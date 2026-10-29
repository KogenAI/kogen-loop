package provider

import (
	"context"
	"os"
	"reflect"
	"strings"
	"testing"

	"kogen-loop/sys"
)

const hourBreakpoint = `"cache_control":{"ttl":"1h","type":"ephemeral"}`

func ttlRequest(ttl string) Request {
	return Request{Role: claudeRole, Instructions: "policy", Input: user("hi"), Tools: []any{goTool("read_file")}, CacheID: "fixed-cache-id", AnthropicCacheTTL: ttl}
}

func TestBreakpointTTLDefault(t *testing.T) {
	e, f := keyEnv(t, "anthropic", claudeText("ok"))
	obs := &observer{}
	if _, err := e.c.Respond(context.Background(), e.s, ttlRequest(""), obs); err != nil {
		t.Fatal(err)
	}
	r := f.requests()
	if len(r) != 1 {
		t.Fatalf("requests = %d", len(r))
	}
	if got := string(r[0].Body); got != parallelBaseline["anthropic"] {
		t.Errorf("default body changed\n got %s\nwant %s", got, parallelBaseline["anthropic"])
	}
	if r[0].Header.Get("Anthropic-Version") != "2026-10-21" || r[0].Header.Get("Anthropic-Beta") != "" {
		t.Errorf("headers = %v", r[0].Header)
	}
	recs := obs.records()
	if len(recs) != 1 {
		t.Fatalf("records = %d", len(recs))
	}
	cache, _ := recs[0]["cache"].(map[string]any)
	if v, ok := cache["configured_ttl"]; !ok || v != nil {
		t.Errorf("configured_ttl = %v (present %v)", v, ok)
	}
}

func TestBreakpointTTLHour(t *testing.T) {
	e, f := keyEnv(t, "anthropic", claudeText("ok"))
	obs := &observer{}
	if _, err := e.c.Respond(context.Background(), e.s, ttlRequest("1h"), obs); err != nil {
		t.Fatal(err)
	}
	r := f.requests()
	if len(r) != 1 {
		t.Fatalf("requests = %d", len(r))
	}
	want := strings.NewReplacer(`"cache_control":{"type":"ephemeral"}`, hourBreakpoint).Replace(parallelBaseline["anthropic"])
	if got := string(r[0].Body); got != want {
		t.Errorf("one-hour body\n got %s\nwant %s", got, want)
	}
	if n := strings.Count(string(r[0].Body), hourBreakpoint); n != 3 {
		t.Errorf("one-hour markers = %d", n)
	}
	if r[0].Header.Get("Anthropic-Beta") != "" || r[0].Header.Get("Anthropic-Version") != "2026-10-21" || r[0].Header.Get("X-Api-Key") != testKey || r[0].Header.Get("Content-Type") != "application/json" {
		t.Errorf("headers = %v", r[0].Header)
	}
	recs := obs.records()
	if len(recs) != 1 {
		t.Fatalf("records = %d", len(recs))
	}
	cache, _ := recs[0]["cache"].(map[string]any)
	if cache["configured_ttl"] != "1h" {
		t.Errorf("configured_ttl = %v", cache["configured_ttl"])
	}
	if v, ok := cache["applied_ttl"]; !ok || v != nil {
		t.Errorf("applied_ttl = %v (present %v)", v, ok)
	}
}

func TestBreakpointTTLAuthority(t *testing.T) {
	e, f := keyEnv(t, "anthropic", claudeText("ok"))
	input := append(twoBlockUser(), map[string]any{"role": "user", "content": "later"})
	before := jsonOf(t, input)
	req := authorityRequest(input, intp(0))
	req.AnthropicCacheTTL = "1h"
	if _, err := e.c.Respond(context.Background(), e.s, req, nil); err != nil {
		t.Fatal(err)
	}
	r := f.requests()
	if len(r) != 1 {
		t.Fatalf("requests = %d", len(r))
	}
	want := []string{"tools[0]", "system[0]", "messages[0].content[0]", "messages[1].content[0]"}
	if got := markedAt(r[0].JSON); !reflect.DeepEqual(got, want) {
		t.Fatalf("markers = %v\n%s", got, r[0].Body)
	}
	if n := strings.Count(string(r[0].Body), hourBreakpoint); n != 4 || strings.Contains(string(r[0].Body), `"cache_control":{"type":"ephemeral"}`) {
		t.Errorf("markers not all one hour: %s", r[0].Body)
	}
	if jsonOf(t, input) != before {
		t.Error("caller input mutated")
	}
}

func TestBreakpointTTLInvalid(t *testing.T) {
	check := func(label string, err error) {
		t.Helper()
		se, ok := err.(*sys.Error)
		if !ok || se.Class != "provider" || se.Reason != "invalid_request" || !strings.Contains(err.Error(), "AnthropicCacheTTL") {
			t.Errorf("%s: err = %#v", label, err)
		}
	}
	for _, ttl := range []string{"5m", "2h"} {
		_, err := NewClient("").Render(ttlRequest(ttl))
		check("render "+ttl, err)
		e, f := keyEnv(t, "anthropic", claudeText("ok"))
		obs := &observer{}
		_, err = e.c.Respond(context.Background(), e.s, ttlRequest(ttl), obs)
		check("respond "+ttl, err)
		if n := len(f.requests()); n != 0 {
			t.Errorf("%s: %d requests sent", ttl, n)
		}
		if n := len(obs.records()); n != 0 {
			t.Errorf("%s: %d attempt records", ttl, n)
		}
	}
}

func TestBreakpointTTLIsolation(t *testing.T) {
	for _, c := range parallelRoles {
		if c.info == "anthropic" {
			continue
		}
		for _, ttl := range []string{"", "1h", "5m", "bogus"} {
			info, _ := Lookup(c.role.Provider)
			req := Request{Role: c.role, Instructions: "policy", Input: user("hi"), Tools: []any{goTool("read_file")}, CacheID: "fixed-cache-id", AnthropicCacheTTL: ttl}
			body, err := NewClient("").Render(req)
			if err != nil {
				t.Fatalf("%s %q: %v", c.name, ttl, err)
			}
			enc, err := encodeBody(info, body)
			if err != nil {
				t.Fatal(err)
			}
			if string(enc) != parallelBaseline[c.name] {
				t.Errorf("%s %q: body changed\n got %s", c.name, ttl, enc)
			}
		}
	}
	// Diagnostics of a non-Anthropic attempt do not depend on the option.
	records := func(ttl string) map[string]any {
		e, f := keyEnv(t, "opencode-go", jsonAnswer(200, map[string]any{"id": "r", "model": "kimi-k3", "choices": []any{map[string]any{"message": map[string]any{"role": "assistant", "content": "ok"}, "finish_reason": "stop"}}}))
		_ = f
		obs := &observer{}
		req := Request{Role: goRole, Instructions: "policy", Input: user("hi"), CacheID: "fixed-cache-id", AnthropicCacheTTL: ttl}
		if _, err := e.c.Respond(context.Background(), e.s, req, obs); err != nil {
			t.Fatalf("%q: %v", ttl, err)
		}
		recs := obs.records()
		if len(recs) != 1 {
			t.Fatalf("%q: records = %d", ttl, len(recs))
		}
		cache, _ := recs[0]["cache"].(map[string]any)
		return cache
	}
	base := records("")
	for _, ttl := range []string{"1h", "bogus"} {
		if got := records(ttl); !reflect.DeepEqual(got, base) {
			t.Errorf("%q: cache diagnostics %v differ from %v", ttl, got, base)
		}
	}
}

func TestBreakpointTTLContract(t *testing.T) {
	b, err := os.ReadFile("../docs/contract/loop-v1.md")
	if err != nil {
		t.Fatal(err)
	}
	doc := string(b)
	for _, want := range []string{"AnthropicCacheTTL", "empty", "`1h`", "provider-only", "configured_ttl", "applied_ttl", "anthropic-version"} {
		if !strings.Contains(doc, want) {
			t.Errorf("contract lacks %q", want)
		}
	}
}

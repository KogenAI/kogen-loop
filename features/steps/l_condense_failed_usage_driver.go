//go:build ignore

// Independent public-API acceptance collector for L-CONDENSE-FAILED-USAGE. It sends one
// loop.Direct request over a local fake ChatGPT Responses server and reports what it observed
// as one JSON object; the JS observer and the Gherkin own the expectations. It is not part of
// the product module.
//
// Input (stdin): {"exchanges": n, "pad": bytes, "summaries": [answer...]}. The history is a
// task and n complete read_file exchanges whose outputs carry pad filler bytes. A request
// without tools is a summarization request and takes the next answer: {"text": t, "usage": u}
// streams t as the summary and u as the response usage; {"status": s} answers HTTP s with a
// JSON error. Every other request is the conversation's and is answered "done".
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/KogenAI/kogen-loop/loop"
	"github.com/KogenAI/kogen-loop/provider"
	"github.com/KogenAI/kogen-loop/sys"
)

type answer struct {
	Text   string         `json:"text"`
	Usage  map[string]any `json:"usage"`
	Status int            `json:"status"`
}

type config struct {
	Exchanges int      `json:"exchanges"`
	Pad       int      `json:"pad"`
	Summaries []answer `json:"summaries"`
}

func main() {
	var c config
	if err := json.NewDecoder(os.Stdin).Decode(&c); err != nil {
		panic(err)
	}
	var mu sync.Mutex
	summaries, conversation := 0, 0
	faults := []string{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || r.URL.Path != "/v1/responses" {
			mu.Lock()
			faults = append(faults, fmt.Sprintf("unexpected request %s %s", r.Method, r.URL.Path))
			mu.Unlock()
			w.WriteHeader(404)
			return
		}
		tl, _ := body["tools"].([]any)
		mu.Lock()
		a := answer{Text: "done"}
		if len(tl) == 0 {
			if summaries >= len(c.Summaries) {
				faults = append(faults, fmt.Sprintf("summarization request %d has no scripted answer", summaries+1))
				a = answer{Status: 400}
			} else {
				a = c.Summaries[summaries]
			}
			summaries++
		} else {
			conversation++
		}
		mu.Unlock()
		if a.Status != 0 {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(a.Status)
			fmt.Fprint(w, `{"error":{"message":"fixture failure","code":"invalid_request_error"}}`)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		item, _ := json.Marshal(map[string]any{"type": "response.output_item.done", "output_index": 0, "item": map[string]any{
			"type": "message", "role": "assistant", "content": []any{map[string]any{"type": "output_text", "text": a.Text}}}})
		fmt.Fprintf(w, "data: %s\n\n", item)
		resp := map[string]any{"status": "completed"}
		if a.Usage != nil {
			resp["usage"] = a.Usage
		}
		done, _ := json.Marshal(map[string]any{"type": "response.completed", "response": resp})
		fmt.Fprintf(w, "data: %s\n\n", done)
	}))
	defer srv.Close()

	home, err := os.MkdirTemp("", "l-condense-failed-usage-")
	if err != nil {
		panic(err)
	}
	defer os.RemoveAll(home)
	creds := filepath.Join(home, ".kogen", "credentials")
	if err := os.MkdirAll(creds, 0o700); err != nil {
		panic(err)
	}
	cred, _ := json.Marshal(map[string]any{"client_id": "oaiapp_fixture", "access_token": "fake-access-token", "refresh_token": "fake-refresh-token", "expires_at": time.Now().Unix() + 3600})
	if err := os.WriteFile(filepath.Join(creds, "chatgpt.json"), cred, 0o600); err != nil {
		panic(err)
	}
	session := sys.NewWith([]string{"HOME=" + home, "PATH=" + os.Getenv("PATH"), "KOGEN_PROVIDER_URL=" + srv.URL}, home)
	client := provider.NewClient("")
	client.Sleep = func(ctx context.Context, d time.Duration) error { return ctx.Err() }
	disclosures := []loop.Condensation{}
	d := &loop.Direct{Client: client, Session: session, CacheID: provider.NewCacheID(), Cache: provider.NewCache(nil),
		Condensed: func(c loop.Condensation) { disclosures = append(disclosures, c) }}
	client.Cache = d.Cache

	input := []any{map[string]any{"role": "user", "content": "TASK: keep every fact"}}
	for i := 1; i <= c.Exchanges; i++ {
		id := fmt.Sprintf("call-%03d", i)
		input = append(input,
			map[string]any{"type": "function_call", "call_id": id, "name": "read_file", "arguments": fmt.Sprintf(`{"path":"f%03d.txt"}`, i)},
			map[string]any{"type": "function_call_output", "call_id": id, "output": fmt.Sprintf("FACT-%03d %s", i, strings.Repeat("a", c.Pad))})
	}
	defs := []any{}
	for _, name := range []string{"read_file", "finish"} {
		defs = append(defs, map[string]any{"type": "function", "name": name, "description": "d", "parameters": map[string]any{"type": "object"}})
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	_, _, reqErr := d.Request(ctx, loop.Request{Owner: "acceptance", Role: provider.Role{Provider: "chatgpt", Model: "fixture-model", Effort: "medium"},
		Instructions: "INSTRUCTIONS stay exact", Input: input, Tools: defs})

	var errObs any
	if reqErr != nil {
		e := map[string]any{"text": reqErr.Error()}
		if se, ok := sys.AsError(reqErr); ok {
			e = map[string]any{"class": se.Class, "reason": se.Reason, "detail": se.Detail}
		}
		errObs = e
	}
	mu.Lock()
	defer mu.Unlock()
	out := map[string]any{"summary_requests": summaries, "conversation_requests": conversation, "error": errObs, "disclosures": disclosures, "faults": faults}
	if err := json.NewEncoder(os.Stdout).Encode(out); err != nil {
		panic(err)
	}
}

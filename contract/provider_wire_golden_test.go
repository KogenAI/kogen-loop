package contract_test

import (
	"encoding/json"
	"fmt"
	"os"
	"reflect"
	"testing"

	"github.com/KogenAI/kogen-loop/provider"
)

// Kogen's cli/research_removal_test.go and cli/testdata/loop_knobs_golden.json
// motivate owning these consumer request pins in loop. The inputs and recorded
// bodies come from loop's baseline_bodies_test.go and tool_choice_empty_golden.json;
// neither the Kogen checkout nor fixture generation is needed to run this test.
func TestProviderWireGoldens(t *testing.T) {
	data, err := os.ReadFile("testdata/loop_knobs_golden.json")
	if err != nil {
		t.Fatal(err)
	}
	var golden map[string]json.RawMessage
	if err := json.Unmarshal(data, &golden); err != nil {
		t.Fatal(err)
	}
	routes := []struct {
		name string
		role provider.Role
	}{
		{"chatgpt", provider.Role{Model: "gpt-6.1-sol", Effort: "high"}},
		{"supergrok", provider.Role{Provider: "supergrok", Model: "grok-4.7", Effort: "low"}},
		{"anthropic", provider.Role{Provider: "anthropic", Model: "claude-opus-5-5", Effort: "high"}},
		{"anthropic-profile", provider.Role{Provider: "anthropic", Model: "claude-sonnet-5-5", Effort: "high"}},
		{"opencode-go", provider.Role{Provider: "opencode-go", Model: "kimi-k3", Effort: "high"}},
		{"openai-compatible", provider.Role{Provider: "openai-compatible", Model: "m", Effort: "default", BaseURL: "http://127.0.0.1:1/v1"}},
	}
	tool := func(name string) any {
		return map[string]any{"type": "function", "name": name, "description": "d", "parameters": map[string]any{"type": "object"}}
	}
	for _, route := range routes {
		for _, variant := range []string{"baseline", "tools=false", "tools=true"} {
			key := "baseline/" + route.name
			role := route.role
			tools := []any{tool("read_file")}
			if variant != "baseline" {
				key = fmt.Sprintf("tools/%s/%s", route.name, variant)
				if route.name == "openai-compatible" {
					role.Model = "qwen3-coder:30b"
				}
				if variant == "tools=false" {
					tools = nil
				} else {
					tools = append(tools, tool("submit"))
				}
			}
			t.Run(key, func(t *testing.T) {
				req := provider.Request{Role: role, Instructions: "policy", Input: []any{map[string]any{"role": "user", "content": []any{map[string]any{"type": "input_text", "text": "hi"}}}}, Tools: tools, CacheID: "fixed-cache-id"}
				body, err := provider.NewClient("").Render(req)
				if err != nil {
					t.Fatalf("render %s: %v", key, err)
				}
				gotBytes, err := json.Marshal(body)
				if err != nil {
					t.Fatalf("marshal %s: %v", key, err)
				}
				raw, ok := golden[key]
				if !ok {
					t.Fatalf("missing golden %s", key)
				}
				var got, want map[string]any
				if err := json.Unmarshal(gotBytes, &got); err != nil {
					t.Fatalf("decode actual %s: %v", key, err)
				}
				if err := json.Unmarshal(raw, &want); err != nil || want == nil {
					t.Fatalf("decode golden %s: %v", key, err)
				}
				if !reflect.DeepEqual(got, want) {
					t.Errorf("%s body mismatch\n got: %s\nwant: %s", key, gotBytes, raw)
				}
			})
		}
	}
}

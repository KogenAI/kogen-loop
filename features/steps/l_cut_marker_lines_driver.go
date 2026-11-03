//go:build ignore

// Independent acceptance collector for the cut marker. It reports observations; the JS
// observer and Gherkin own expectations. It is not part of the product module.
//
//	cut:   stdin is a JSON string; stdout is [tools.Cut(text), tools.Cut(tools.Cut(text))].
//	read:  stdin is a JSON string written to big.txt; one loop.Run round calls read_file on
//	       it and stdout is the function_call_output the engine delivered to the model.
//	shell: stdin is a JSON string written to payload.txt; a shell call prints it and yields,
//	       a handle call retrieves it, and stdout is [yield envelope, completed envelope].
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/KogenAI/kogen-loop/loop"
	"github.com/KogenAI/kogen-loop/provider"
	"github.com/KogenAI/kogen-loop/sys"
	"github.com/KogenAI/kogen-loop/tools"
)

type scripted struct {
	items [][]map[string]any
	seen  []loop.Request
}

func (s *scripted) Request(ctx context.Context, req loop.Request) (*provider.Response, []any, error) {
	s.seen = append(s.seen, req)
	i := len(s.seen) - 1
	if i >= len(s.items) {
		return nil, nil, errors.New("recording exhausted")
	}
	return &provider.Response{ID: fmt.Sprintf("r%d", i+1), Items: s.items[i]}, req.Input, nil
}

func main() {
	var text string
	if err := json.NewDecoder(os.Stdin).Decode(&text); err != nil {
		panic(err)
	}
	root, err := os.MkdirTemp("", "cut-marker-")
	if err != nil {
		panic(err)
	}
	defer os.RemoveAll(root)
	var out any
	switch os.Args[1] {
	case "cut":
		cut := tools.Cut(text)
		out = []string{cut, tools.Cut(cut)}
	case "read":
		out = read(root, text)
	case "shell":
		out = shell(root, text)
	default:
		panic("unknown mode " + os.Args[1])
	}
	if err := json.NewEncoder(os.Stdout).Encode(out); err != nil {
		panic(err)
	}
}

func read(root, text string) any {
	if err := os.WriteFile(filepath.Join(root, "big.txt"), []byte(text), 0o600); err != nil {
		panic(err)
	}
	s := &scripted{items: [][]map[string]any{
		{{"type": "function_call", "call_id": "read-1", "name": "read_file", "arguments": `{"path":"big.txt"}`}},
		{{"type": "message", "role": "assistant", "content": []any{map[string]any{"type": "output_text", "text": "done"}}}},
	}}
	session := sys.NewWith([]string{"HOME=" + root, "PATH=" + os.Getenv("PATH")}, root)
	rd := loop.Round{Owner: "independent", Role: provider.Role{Provider: "chatgpt", Model: "fixture-model", Effort: "medium"}, Instructions: "cut marker acceptance", Definitions: []any{map[string]any{"name": "sentinel"}}, Tools: &tools.Tools{Root: root, Session: session, Enabled: []string{tools.ReadFileTool}}}
	if _, err := loop.Run(context.Background(), rd, []any{map[string]any{"role": "user", "content": "start"}}, s, loop.Hooks{}); err != nil {
		panic(err)
	}
	if len(s.seen) != 2 {
		panic(fmt.Sprintf("%d requests, want 2", len(s.seen)))
	}
	for _, item := range s.seen[1].Input {
		if m, ok := item.(map[string]any); ok && m["type"] == "function_call_output" && m["call_id"] == "read-1" {
			return m["output"]
		}
	}
	panic("no function_call_output for read-1 in the second request")
}

func shell(root, text string) any {
	if err := os.WriteFile(filepath.Join(root, "payload.txt"), []byte(text), 0o600); err != nil {
		panic(err)
	}
	calls := 0
	after := func(time.Duration) <-chan time.Time {
		calls++
		if calls > 1 {
			return nil // the handle call returns when the command completes
		}
		ch := make(chan time.Time, 1)
		go func() {
			for {
				if _, err := os.Stat(filepath.Join(root, "ready")); err == nil {
					break
				}
				time.Sleep(10 * time.Millisecond)
			}
			time.Sleep(200 * time.Millisecond)
			ch <- time.Now()
		}()
		return ch
	}
	tl := &tools.Tools{Root: root, Session: sys.NewWith(os.Environ(), root), Enabled: []string{tools.ShellTool}, ShellAfter: after}
	defer tl.EndShellRound()
	yield, err := tl.Run(tools.ShellTool, map[string]any{"command": "cat payload.txt; : > ready; while [ ! -f release ]; do sleep .05; done"})
	if err != nil {
		panic(err)
	}
	var v map[string]any
	if err := json.Unmarshal([]byte(yield.Text), &v); err != nil {
		panic(fmt.Sprintf("yield is not a JSON envelope: %.200q", yield.Text))
	}
	if err := os.WriteFile(filepath.Join(root, "release"), nil, 0o600); err != nil {
		panic(err)
	}
	done, err := tl.Run(tools.ShellTool, map[string]any{"handle": v["handle"]})
	if err != nil {
		panic(err)
	}
	return []string{yield.Text, done.Text}
}

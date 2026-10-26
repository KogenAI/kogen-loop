//go:build ignore

// Independent public-API acceptance collector. It reports observations; the JS
// observer and Gherkin own expectations. It is not part of the product module.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"kogen-loop/loop"
	"kogen-loop/provider"
	"kogen-loop/sys"
	"kogen-loop/tools"
)

type config struct {
	Responses [][]map[string]any `json:"responses"`
	Files     map[string]string  `json:"files"`
	Handle    string             `json:"handle"`
	Stop      string             `json:"stop"`
	Cancel    bool               `json:"cancel"`
	Terminal  []string           `json:"terminal"`
	Sizes     []int              `json:"sizes"`
}

type recorder struct {
	cfg  config
	seen []loop.Request
}

func (r *recorder) Request(ctx context.Context, req loop.Request) (*provider.Response, []any, error) {
	r.seen = append(r.seen, req)
	if err := ctx.Err(); err != nil {
		return nil, nil, err
	}
	i := len(r.seen) - 1
	if i >= len(r.cfg.Responses) {
		return nil, nil, errors.New("recording exhausted")
	}
	return &provider.Response{ID: fmt.Sprintf("r%d", i+1), Items: r.cfg.Responses[i]}, req.Input, nil
}

func main() {
	var c config
	if err := json.NewDecoder(os.Stdin).Decode(&c); err != nil {
		panic(err)
	}
	root, err := os.MkdirTemp("", "loop-api-")
	if err != nil {
		panic(err)
	}
	defer os.RemoveAll(root)
	for p, text := range c.Files {
		if err := os.WriteFile(filepath.Join(root, p), []byte(text), 0600); err != nil {
			panic(err)
		}
	}
	s := sys.NewWith([]string{"HOME=" + root, "PATH=" + os.Getenv("PATH")}, root)
	rq := &recorder{cfg: c, seen: []loop.Request{}}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if c.Cancel {
		cancel()
	}
	stop := errors.New("host stop")
	trace := []string{}
	h := loop.Hooks{
		BeforeRequest: func(context.Context, []any) error { trace = append(trace, "request"); return nil },
		BeforeCall: func(_ context.Context, call tools.Call, _ []any) error {
			trace = append(trace, "before:"+fmt.Sprint(call.CallID()))
			if call.CallID() == c.Stop {
				return stop
			}
			return nil
		},
		HandleCall: func(_ context.Context, call tools.Call) (loop.Handled, error) {
			if call.CallID() == c.Handle {
				return loop.Handled{Handled: true, Output: tools.Output{Text: "host output"}}, nil
			}
			return loop.Handled{}, nil
		},
		AfterCall: func(_ context.Context, call tools.Call, _ tools.Output, terminal bool, _ []any) error {
			trace = append(trace, fmt.Sprintf("after:%v:%t", call.CallID(), terminal))
			return nil
		},
	}
	rd := loop.Round{Owner: "independent", Role: provider.Role{Provider: "chatgpt", Model: "fixture-model", Effort: "medium"}, Instructions: "native acceptance", Definitions: []any{map[string]any{"name": "sentinel"}}, Terminal: c.Terminal, Tools: &tools.Tools{Root: root, Session: s, Enabled: []string{"read_file", "write_file", "shell"}}}
	res, runErr := loop.Run(ctx, rd, []any{map[string]any{"role": "user", "content": "start"}}, rq, h)
	var terminal any
	if res.Terminal != nil {
		terminal = res.Terminal.CallID()
	}
	files := map[string]string{}
	fileNames := []string{}
	entries, _ := os.ReadDir(root)
	for _, e := range entries {
		if !e.IsDir() {
			b, _ := os.ReadFile(filepath.Join(root, e.Name()))
			files[e.Name()] = string(b)
			fileNames = append(fileNames, e.Name())
		}
	}
	cuts := []map[string]any{}
	for _, n := range c.Sizes {
		raw := strings.Repeat("x", n)
		cut := tools.Output{Text: raw}.Cut().Text
		cuts = append(cuts, map[string]any{"size": n, "bytes": len(cut), "unchanged": cut == raw, "marker": strings.Contains(cut, "bytes omitted"), "stable": tools.Cut(cut) == cut})
	}
	errText := ""
	if runErr != nil {
		errText = runErr.Error()
	}
	json.NewEncoder(os.Stdout).Encode(map[string]any{"ending": res.Ending, "terminal": terminal, "requests": res.Requests, "input": res.Input, "seen": rq.seen, "trace": trace, "error": errText, "host_error": errors.Is(runErr, stop), "cancelled": errors.Is(runErr, context.Canceled), "files": files, "file_names": fileNames, "cuts": cuts})
}

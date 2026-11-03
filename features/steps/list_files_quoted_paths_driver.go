//go:build ignore

// Acceptance collector for list-files-quoted-paths. It runs one generic tool call on a root,
// or reads one tool definition, and prints what the model receives as JSON. The JS steps
// and the Gherkin own the expectations. It is not part of the product module.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"

	"kogen-loop/sys"
	"kogen-loop/tools"
)

type request struct {
	Root       string         `json:"root"`
	Tool       string         `json:"tool"`
	Args       map[string]any `json:"args"`
	Definition string         `json:"definition"`
}

func main() {
	var req request
	if err := json.NewDecoder(os.Stdin).Decode(&req); err != nil {
		fmt.Fprintln(os.Stderr, "driver input:", err)
		os.Exit(2)
	}
	res := map[string]any{}
	if req.Definition != "" {
		def, ok := tools.Definition(req.Definition)
		if !ok {
			fmt.Fprintln(os.Stderr, "no definition for", req.Definition)
			os.Exit(2)
		}
		res["description"] = def["description"]
	} else {
		tl := &tools.Tools{Root: req.Root, Session: sys.NewWith(os.Environ(), req.Root),
			Enabled: []string{tools.ReadFileTool, tools.ListFilesTool, tools.SearchTextTool, tools.ShellTool}}
		args := req.Args
		if args == nil {
			args = map[string]any{}
		}
		out, err := tl.RunContext(context.Background(), req.Tool, args)
		tl.EndShellRound()
		res["text"] = out.Cut().Text
		if err != nil {
			res["error"] = err.Error()
		}
	}
	if err := json.NewEncoder(os.Stdout).Encode(res); err != nil {
		fmt.Fprintln(os.Stderr, "driver output:", err)
		os.Exit(2)
	}
}

// Command driver calls loop.NewSession with the JSON config on stdin and prints the
// refusal as one JSON object: {"class":...,"reason":...,"detail":...} or {"started":true}.
package main

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/KogenAI/kogen-loop/loop"
	"github.com/KogenAI/kogen-loop/provider"
	"github.com/KogenAI/kogen-loop/sys"
)

func main() {
	var in struct {
		Root     string   `json:"root"`
		Provider string   `json:"provider"`
		Tools    []string `json:"tools"`
		Terminal []string `json:"terminal"`
	}
	if err := json.NewDecoder(os.Stdin).Decode(&in); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(3)
	}
	_, err := loop.NewSession(loop.SessionConfig{
		Root: in.Root, Role: provider.Role{Provider: in.Provider, Model: "m", Effort: "medium"},
		Enabled: in.Tools, Terminal: in.Terminal,
	})
	out := map[string]any{"started": err == nil}
	if err != nil {
		e, ok := sys.AsError(err)
		if !ok {
			fmt.Fprintln(os.Stderr, "not a sys error:", err)
			os.Exit(3)
		}
		out = map[string]any{"class": e.Class, "reason": e.Reason, "detail": e.Detail}
	}
	json.NewEncoder(os.Stdout).Encode(out)
}

//go:build ignore

// Command read_file_binary_notice_driver runs one tool call the way the loop delivers its
// result: tools.Tools.CallClassified on the call's JSON arguments, then Output.Cut. Usage:
// go run features/steps/read_file_binary_notice_driver.go <root> <tool> <arguments-json>
package main

import (
	"encoding/base64"
	"encoding/json"
	"os"

	"kogen-loop/tools"
)

func main() {
	root, name, arguments := os.Args[1], os.Args[2], os.Args[3]
	tl := &tools.Tools{Root: root, Enabled: []string{tools.ReadFileTool, tools.ViewImageTool}}
	c, err := tl.CallClassified(nil, tools.Call{Name: name, Arguments: arguments})
	if err != nil {
		panic(err)
	}
	out := c.Output().Cut()
	types := []string{}
	for _, p := range out.Parts {
		m, _ := p.(map[string]any)
		kind, _ := m["type"].(string)
		types = append(types, kind)
	}
	if err := json.NewEncoder(os.Stdout).Encode(map[string]any{
		"typed":           out.Typed(),
		"text_base64":     base64.StdEncoding.EncodeToString([]byte(out.Text)),
		"error_kind":      c.ErrorKind,
		"malformed_class": c.MalformedClass,
		"part_types":      types,
	}); err != nil {
		panic(err)
	}
}

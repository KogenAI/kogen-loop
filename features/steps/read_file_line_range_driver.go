//go:build ignore

// read_file_line_range_driver runs read_file calls through tools.Tools.CallClassified on a
// temporary root. Stdin: {"files": {"<name>": "<content>"}, "calls": ["<raw arguments>"]}.
// Stdout: one JSON array with {"text", "error_kind", "malformed_class", "error"} per call.
package main

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"

	"kogen-loop/tools"
)

type result struct {
	Text           string `json:"text"`
	ErrorKind      string `json:"error_kind"`
	MalformedClass string `json:"malformed_class"`
	Error          string `json:"error"`
}

func main() {
	var in struct {
		Files map[string]string `json:"files"`
		Calls []string          `json:"calls"`
	}
	if err := json.NewDecoder(os.Stdin).Decode(&in); err != nil {
		panic(err)
	}
	dir, err := os.MkdirTemp("", "read-file-line-range-")
	if err != nil {
		panic(err)
	}
	defer os.RemoveAll(dir)
	root, err := filepath.EvalSymlinks(dir)
	if err != nil {
		panic(err)
	}
	for name, content := range in.Files {
		if err := os.WriteFile(filepath.Join(root, name), []byte(content), 0o644); err != nil {
			panic(err)
		}
	}
	tl := &tools.Tools{Root: root, Enabled: []string{tools.ReadFileTool}}
	out := []result{}
	for _, raw := range in.Calls {
		c, err := tl.CallClassified(context.Background(), tools.Call{Name: tools.ReadFileTool, Arguments: raw})
		r := result{Text: c.Text, ErrorKind: c.ErrorKind, MalformedClass: c.MalformedClass}
		if err != nil {
			r.Error = err.Error()
		}
		out = append(out, r)
	}
	if err := json.NewEncoder(os.Stdout).Encode(out); err != nil {
		panic(err)
	}
}

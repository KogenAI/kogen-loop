//go:build ignore

package main

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"

	"github.com/KogenAI/kogen-loop/tools"
)

func must(err error) {
	if err != nil {
		panic(err)
	}
}

func main() {
	root, err := os.MkdirTemp("", "protected-write-")
	must(err)
	defer os.RemoveAll(root)
	must(os.MkdirAll(filepath.Join(root, "checks"), 0755))
	name := os.Args[1]
	target := "checks/accept.txt"
	path := target
	protected := []string{target}
	if name == "unprotected" {
		target = "checks/free.txt"
	}
	if name != "dangling" && name != "create" {
		must(os.WriteFile(filepath.Join(root, target), []byte("keep"), 0640))
	}
	links := map[string]string{}
	switch name {
	case "link", "unprotected", "dangling":
		links["shortcut.txt"] = target
		path = "shortcut.txt"
	case "chain":
		links["shortcut.txt"] = "second.txt"
		links["second.txt"] = target
		path = "shortcut.txt"
	case "directory":
		links["alias"] = "checks"
		path = "alias/accept.txt"
	case "create":
		target = "new/deep/file.txt"
		path = target
		protected = nil
	case "replace", "readonly":
		protected = nil
	}
	for p, v := range links {
		must(os.Symlink(v, filepath.Join(root, p)))
	}
	if name == "readonly" {
		must(os.Chmod(filepath.Join(root, target), 0444))
	}
	t := tools.Tools{Root: root, Enabled: []string{"write_file"}, Protected: protected}
	result, err := t.RunClassified(context.Background(), "write_file", map[string]any{"path": path, "content": "replace"})
	must(err)
	data, err := os.ReadFile(filepath.Join(root, target))
	exists := err == nil
	if err != nil && !os.IsNotExist(err) {
		panic(err)
	}
	after := map[string]string{}
	for p := range links {
		v, e := os.Readlink(filepath.Join(root, p))
		must(e)
		after[p] = v
	}
	mode := "missing"
	if exists {
		st, e := os.Stat(filepath.Join(root, target))
		must(e)
		mode = st.Mode().Perm().String()
	}
	must(json.NewEncoder(os.Stdout).Encode(map[string]any{"text": result.Text, "kind": result.ErrorKind, "content": string(data), "exists": exists, "links": after, "mode": mode}))
}

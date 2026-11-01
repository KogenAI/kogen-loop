package tools

import (
	"os"
	"path/filepath"
	"testing"

	"kogen-loop/sys"
)

func TestShellEmptyHandleSelection(t *testing.T) {
	root := t.TempDir()
	tl := &Tools{Root: root, Session: sys.NewWith(os.Environ(), root), Enabled: []string{ShellTool}}
	defer tl.EndShellRound()
	for _, tc := range []struct {
		args map[string]any
		want string
	}{
		{map[string]any{"command": "printf ok", "handle": ""}, "exit status: 0\nok"},
		{map[string]any{"command": 42, "handle": ""}, "error: argument command must be a string"},
		{map[string]any{"command": "touch marker", "handle": nil}, "error: supply exactly one of command or handle"},
		{map[string]any{"command": "touch marker", "handle": 42}, "error: supply exactly one of command or handle"},
	} {
		if got := run(t, tl, ShellTool, tc.args); got != tc.want {
			t.Errorf("%v: got %q, want %q", tc.args, got, tc.want)
		}
	}
	if _, err := os.Stat(filepath.Join(root, "marker")); !os.IsNotExist(err) {
		t.Fatalf("marker exists or cannot be checked: %v", err)
	}
}

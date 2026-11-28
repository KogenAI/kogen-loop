package tools

import (
	"context"
	"encoding/json"
	"os"
	"time"

	"github.com/KogenAI/kogen-loop/api"
	"testing"

	"github.com/KogenAI/kogen-loop/sys"
)

func TestShellEmptyHandleSelection(t *testing.T) {
	root := t.TempDir()
	tl := &Tools{Root: root, Session: sys.NewWith(os.Environ(), root), Enabled: []string{ShellTool}}
	defer tl.EndShellRound()
	for _, tc := range []struct {
		name string
		args map[string]any
		want string
	}{
		{"absent", map[string]any{"command": "printf ok"}, "exit status: 0\nok"},
		{"null", map[string]any{"command": "printf ok", "handle": nil}, "exit status: 0\nok"},
		{"empty", map[string]any{"command": "printf ok", "handle": ""}, "exit status: 0\nok"},
		{"space", map[string]any{"command": "printf ok", "handle": "   "}, "exit status: 0\nok"},
		{"number", map[string]any{"command": "printf ok", "handle": 42}, "exit status: 0\nok"},
		{"boolean", map[string]any{"command": "printf ok", "handle": false}, "exit status: 0\nok"},
		{"array", map[string]any{"command": "printf ok", "handle": []any{}}, "exit status: 0\nok"},
		{"object", map[string]any{"command": "printf ok", "handle": map[string]any{}}, "exit status: 0\nok"},
		{"invalid command", map[string]any{"command": 42, "handle": ""}, "error: argument command must be a string"},
		{"conflict", map[string]any{"command": "printf no", "handle": " id "}, "error: supply exactly one of command or handle"},
		{"handle identity", map[string]any{"handle": " id "}, "error: unknown shell handle"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := run(t, tl, ShellTool, tc.args); got != tc.want {
				t.Errorf("got %q, want %q", got, tc.want)
			}
		})
	}
	t.Run("invalid command with running handle", func(t *testing.T) {
		fired := make(chan time.Time)
		close(fired)
		tl := &Tools{Root: root, Session: sys.NewWith(os.Environ(), root), Enabled: []string{ShellTool}, ShellAfter: func(time.Duration) <-chan time.Time { return fired }}
		defer tl.EndShellRound()
		started, err := tl.RunClassified(context.Background(), ShellTool, map[string]any{"command": "sleep 60"})
		if err != nil {
			t.Fatal(err)
		}
		var envelope struct {
			Status string `json:"status"`
			Handle string `json:"handle"`
		}
		if err := json.Unmarshal([]byte(started.Text), &envelope); err != nil || envelope.Status != "running" || envelope.Handle == "" {
			t.Fatalf("expected running handle: %q, %v", started.Text, err)
		}
		got, err := tl.RunClassified(context.Background(), ShellTool, map[string]any{"command": 42, "handle": envelope.Handle})
		if err != nil {
			t.Fatal(err)
		}
		if got.Text != "error: argument command must be a string" || got.MalformedClass != api.MalformedWrongArgumentType {
			t.Fatalf("got %+v", got)
		}
	})

}

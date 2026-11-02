package loop

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"testing"
	"time"

	"kogen-loop/sys"
	"kogen-loop/tools"
)

// yieldAfter is a Tools.ShellAfter that lets a new command's wait elapse once the command has
// written the marker file in root, and never lets a retrieval's wait elapse.
func yieldAfter(t *testing.T, root, marker string) func(time.Duration) <-chan time.Time {
	return func(wait time.Duration) <-chan time.Time {
		if wait != 45*time.Second {
			return nil
		}
		fire := make(chan time.Time, 1)
		go func() {
			end := time.Now().Add(10 * time.Second)
			for time.Now().Before(end) {
				if _, err := os.Stat(filepath.Join(root, marker)); err == nil {
					break
				}
				time.Sleep(10 * time.Millisecond)
			}
			fire <- time.Now()
		}()
		return fire
	}
}

func TestDiscardedAttemptStopsYieldedShell(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	tl := &tools.Tools{Root: root, Session: sys.NewWith(os.Environ(), root), Enabled: []string{tools.ShellTool}, ShellAfter: yieldAfter(t, root, "ready")}
	defer tl.EndShellRound()
	st := newStage(context.Background(), tl, nil)
	st.Done(0, olShell("c", ": > ready; while :; do sleep 1; done"))
	st.mu.Lock()
	g := st.gen
	for len(g.slots) == 0 || g.slots[0].state != finished {
		st.cond.Wait()
	}
	text := g.slots[0].out.Text
	st.mu.Unlock()
	var result struct {
		Status string `json:"status"`
		Handle string `json:"handle"`
	}
	if err := json.Unmarshal([]byte(text), &result); err != nil || result.Status != "running" || result.Handle == "" {
		t.Fatalf("yield: %q %v", text, err)
	}
	st.Abort()
	out, err := tl.Run(tools.ShellTool, map[string]any{"handle": result.Handle})
	if err != nil || out.Text != "error: unknown shell handle" {
		t.Fatalf("discarded handle: %q %v", out.Text, err)
	}
}

// A yielded leader may finish before its attempt is discarded, leaving a child.
func TestDiscardedAttemptStopsCompletedYieldedShell(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	tl := &tools.Tools{Root: root, Session: sys.NewWith(os.Environ(), root), Enabled: []string{tools.ShellTool}, ShellAfter: yieldAfter(t, root, "ready")}
	defer tl.EndShellRound()
	st := newStage(context.Background(), tl, nil)
	st.Done(0, olShell("c", `sleep 600 >/dev/null 2>&1 & echo $! > child.pid; : > ready; while [ ! -f release ]; do sleep .05; done`))
	st.mu.Lock()
	g := st.gen
	for len(g.slots) == 0 || g.slots[0].state != finished {
		st.cond.Wait()
	}
	text := g.slots[0].out.Text
	st.mu.Unlock()
	var result struct {
		Status string `json:"status"`
		Handle string `json:"handle"`
	}
	if err := json.Unmarshal([]byte(text), &result); err != nil || result.Status != "running" || result.Handle == "" {
		t.Fatalf("yield: %q %v", text, err)
	}
	data, err := os.ReadFile(filepath.Join(root, "child.pid"))
	if err != nil {
		t.Fatal(err)
	}
	pid, err := strconv.Atoi(strings.TrimSpace(string(data)))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { sys.Terminate(tl.Session.LiveGroups()) })
	if err := os.WriteFile(filepath.Join(root, "release"), nil, 0600); err != nil {
		t.Fatal(err)
	}
	out, err := tl.Run(tools.ShellTool, map[string]any{"handle": result.Handle})
	if err != nil {
		t.Fatal(err)
	}
	var complete struct {
		Status string `json:"status"`
	}
	if err := json.Unmarshal([]byte(out.Text), &complete); err != nil || complete.Status != "completed" {
		t.Fatalf("completion: %q %v", out.Text, err)
	}
	live := func() bool {
		out, err := exec.Command("ps", "-o", "stat=", "-p", strconv.Itoa(pid)).Output()
		return err == nil && len(strings.Fields(string(out))) > 0 && !strings.HasPrefix(strings.TrimSpace(string(out)), "Z")
	}
	if !live() {
		t.Fatal("child did not survive between calls")
	}
	st.Abort()
	if live() {
		t.Fatal("child survived discarded attempt")
	}
}

// A command can finish before yielding while leaving work in its group.
func TestDiscardedAttemptStopsFastShellChild(t *testing.T) {
	root := t.TempDir()
	tl := &tools.Tools{Root: root, Session: sys.NewWith(os.Environ(), root), Enabled: []string{tools.ShellTool}}
	defer tl.EndShellRound()
	st := newStage(context.Background(), tl, nil)
	st.Done(0, olShell("c", `sleep 600 >/dev/null 2>&1 & echo $! > child.pid`))
	st.mu.Lock()
	g := st.gen
	for len(g.slots) == 0 || g.slots[0].state != finished {
		st.cond.Wait()
	}
	text := g.slots[0].out.Text
	st.mu.Unlock()
	if !strings.HasPrefix(text, "exit status: 0") {
		t.Fatalf("fast shell: %q", text)
	}
	data, err := os.ReadFile(filepath.Join(root, "child.pid"))
	if err != nil {
		t.Fatal(err)
	}
	pid, err := strconv.Atoi(strings.TrimSpace(string(data)))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { sys.Terminate(tl.Session.LiveGroups()) })
	live := func() bool {
		out, err := exec.Command("ps", "-o", "stat=", "-p", strconv.Itoa(pid)).Output()
		return err == nil && len(strings.Fields(string(out))) > 0 && !strings.HasPrefix(strings.TrimSpace(string(out)), "Z")
	}
	if !live() {
		t.Fatal("child did not survive command")
	}
	st.Abort()
	if live() {
		t.Fatal("child survived discarded attempt")
	}
}

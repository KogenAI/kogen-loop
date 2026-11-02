package tools

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

// shellTimer is one wait a shell call asked its test for; sending on fire is the wait elapsing.
type shellTimer struct {
	wait time.Duration
	fire chan time.Time
}

// shellClock is the controlled time of a test: every wait a shell call reaches arrives on requests.
type shellClock struct {
	requests chan shellTimer
}

func newShellClock() *shellClock {
	return &shellClock{requests: make(chan shellTimer, 16)}
}

// After is the Tools.ShellAfter of the test.
func (c *shellClock) After(wait time.Duration) <-chan time.Time {
	fire := make(chan time.Time, 1)
	c.requests <- shellTimer{wait, fire}
	return fire
}

// next returns the wait the next shell call asked for, which must be want.
func (c *shellClock) next(t *testing.T, step string, want time.Duration) shellTimer {
	t.Helper()
	select {
	case r := <-c.requests:
		if r.wait != want {
			t.Fatalf("%s: the shell wait asked ShellAfter for %v, want %v", step, r.wait, want)
		}
		return r
	case <-time.After(10 * time.Second):
		t.Fatalf("%s: the shell wait never asked ShellAfter for its %v wait", step, want)
	}
	return shellTimer{}
}

// appears waits for a file the command writes once it has produced the output the test expects.
func appears(t *testing.T, root, name string) {
	t.Helper()
	end := time.Now().Add(10 * time.Second)
	for {
		if _, err := os.Stat(filepath.Join(root, name)); err == nil {
			return
		}
		if time.Now().After(end) {
			t.Fatalf("the command never wrote %s", name)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

// captured waits until a command has written the file marker and the session has captured
// exactly size bytes of its output, so a yield returns what the test expects.
func captured(t *testing.T, tl *Tools, size int) {
	t.Helper()
	end := time.Now().Add(10 * time.Second)
	for {
		r := tl.registry()
		r.mu.Lock()
		got := -1
		for _, j := range r.jobs {
			res, _, _ := j.cmd.Snapshot()
			got = len(res.Output)
		}
		r.mu.Unlock()
		if got == size {
			return
		}
		if time.Now().After(end) {
			t.Fatalf("the session captured %d output bytes, want %d", got, size)
		}
		time.Sleep(5 * time.Millisecond)
	}
}

type shellOutcome struct {
	text string
	err  error
}

// callShell runs a shell call in the background.
func callShell(tl *Tools, args map[string]any) <-chan shellOutcome {
	ch := make(chan shellOutcome, 1)
	go func() {
		out, err := tl.Run(ShellTool, args)
		ch <- shellOutcome{out.Text, err}
	}()
	return ch
}

// held fails when the call returns before its controlled wait has elapsed.
func held(t *testing.T, step string, ch <-chan shellOutcome) {
	t.Helper()
	select {
	case o := <-ch:
		t.Fatalf("%s: the call returned %q (%v) before its controlled wait elapsed", step, o.text, o.err)
	case <-time.After(200 * time.Millisecond):
	}
}

// finished is the result of a call that must return.
func finished(t *testing.T, step string, ch <-chan shellOutcome) string {
	t.Helper()
	select {
	case o := <-ch:
		if o.err != nil {
			t.Fatalf("%s: %v", step, o.err)
		}
		return o.text
	case <-time.After(10 * time.Second):
		t.Fatalf("%s: the shell call did not return", step)
	}
	return ""
}

//go:build ignore

// Acceptance collector of L-SHELL-WAIT-INSTANTS. It runs shell calls through the public
// tools.Tools API with ShellAfter on controlled time and reports, per call, the wait the call
// asked for, whether the driver fired it, the call's text and its tools.ShellWait, with the
// driver's own instants around the call. It reports observations; the JS observer and the
// Gherkin own the expectations. It is not part of the product module.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"time"

	"kogen-loop/sys"
	"kogen-loop/tools"
)

// ns is an instant as decimal Unix nanoseconds ("" for the zero time).
func ns(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return strconv.FormatInt(t.UnixNano(), 10)
}

type wait struct {
	Spawned     string `json:"spawned"`
	WaitStarted string `json:"wait_started"`
	WaitEnded   string `json:"wait_ended"`
	EndedBy     string `json:"ended_by"`
}

type sample struct {
	Case     string   `json:"case"`
	Before   string   `json:"before"`
	Asked    []string `json:"asked"`
	AskedAt  string   `json:"asked_at"`
	FiredAt  string   `json:"fired_at"`
	Released string   `json:"released"`
	After    string   `json:"after"`
	Text     string   `json:"text"`
	Error    string   `json:"error"`
	Wait     *wait    `json:"wait"`
}

// clock is the controlled time: each wait a call asks for is recorded, and fires only when
// the driver says so.
type clock struct {
	mu      sync.Mutex
	asked   []string
	askedAt time.Time
	fire    chan time.Time
}

func (c *clock) after(d time.Duration) <-chan time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.asked = append(c.asked, d.String())
	c.askedAt = time.Now()
	c.fire = make(chan time.Time, 1)
	return c.fire
}

func (c *clock) waitAsked() bool {
	end := time.Now().Add(10 * time.Second)
	for time.Now().Before(end) {
		c.mu.Lock()
		asked := c.fire != nil
		c.mu.Unlock()
		if asked {
			return true
		}
		time.Sleep(5 * time.Millisecond)
	}
	return false
}

func appears(path string) bool {
	end := time.Now().Add(10 * time.Second)
	for time.Now().Before(end) {
		if _, err := os.Stat(path); err == nil {
			return true
		}
		time.Sleep(10 * time.Millisecond)
	}
	return false
}

func main() {
	root, err := os.MkdirTemp("", "l-shell-wait-instants-")
	if err != nil {
		panic(err)
	}
	defer os.RemoveAll(root)
	root, _ = filepath.EvalSymlinks(root)
	c := &clock{}
	tl := &tools.Tools{Root: root, Session: sys.New(), Enabled: []string{tools.ShellTool}, ShellAfter: c.after}
	defer tl.EndShellRound()
	var out []sample
	var handle string
	// call runs one shell call; during it, while(fire) runs the driver's part of the case:
	// it may fire the wait (returning its instant) or record a release instant.
	call := func(name string, args map[string]any, during func(fire func()) time.Time) {
		c.mu.Lock()
		c.asked, c.askedAt, c.fire = nil, time.Time{}, nil
		c.mu.Unlock()
		s := sample{Case: name, Asked: []string{}}
		var fired, released time.Time
		done := make(chan struct{})
		go func() {
			defer close(done)
			if during == nil {
				return
			}
			released = during(func() {
				if c.waitAsked() {
					fired = time.Now()
					c.mu.Lock()
					c.fire <- fired
					c.mu.Unlock()
				}
			})
		}()
		before := time.Now()
		got, err := tl.RunClassified(context.Background(), tools.ShellTool, args)
		after := time.Now()
		<-done
		c.mu.Lock()
		s.Asked = append(s.Asked, c.asked...)
		s.AskedAt = ns(c.askedAt)
		c.mu.Unlock()
		s.Before, s.After, s.FiredAt, s.Released = ns(before), ns(after), ns(fired), ns(released)
		s.Text = got.Text
		if err != nil {
			s.Error = err.Error()
		}
		if w := got.ShellWait; w != nil {
			s.Wait = &wait{Spawned: ns(w.Spawned), WaitStarted: ns(w.WaitStarted), WaitEnded: ns(w.WaitEnded), EndedBy: w.EndedBy}
		}
		var env map[string]any
		if json.Unmarshal([]byte(got.Text), &env) == nil {
			if h, ok := env["handle"].(string); ok && handle == "" {
				handle = h
			}
		}
		out = append(out, s)
	}
	call("yield", map[string]any{"command": ": > started; while [ ! -f release ]; do sleep .05; done"}, func(fire func()) time.Time {
		if appears(filepath.Join(root, "started")) {
			time.Sleep(200 * time.Millisecond)
			fire()
		}
		return time.Time{}
	})
	call("bound", map[string]any{"handle": handle}, func(fire func()) time.Time {
		time.Sleep(100 * time.Millisecond)
		fire()
		return time.Time{}
	})
	call("release", map[string]any{"handle": handle}, func(fire func()) time.Time {
		c.waitAsked()
		time.Sleep(300 * time.Millisecond)
		released := time.Now()
		if err := os.WriteFile(filepath.Join(root, "release"), nil, 0o600); err != nil {
			panic(err)
		}
		return released
	})
	call("completed", map[string]any{"handle": handle}, nil)
	call("exit", map[string]any{"command": "sleep 0.3; echo out; exit 3"}, nil)
	call("refused", map[string]any{"command": "pkill -f nothing-at-all-l-shell-wait-instants"}, nil)
	call("unknown", map[string]any{"handle": "no-such-handle-l-shell-wait-instants"}, nil)
	call("malformed", map[string]any{}, nil)
	if err := json.NewEncoder(os.Stdout).Encode(out); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

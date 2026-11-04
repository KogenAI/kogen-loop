'use strict';
// Go source of the l-startup-hooks-per-run acceptance harness (package main). The step driver
// l-startup-hooks-per-run__seam.js runs it with go run -race -overlay as the package
// ./zz_l_startup_hooks_per_run_accept, which exists only in the overlay; it is never written to
// the tree. This file defines no steps. The source holds no backquote, so String.raw keeps it
// byte for byte.
module.exports = String.raw`package main

// Acceptance harness of l-startup-hooks-per-run, run with go run -race -overlay as
// ./zz_l_startup_hooks_per_run_accept; it is never written to the tree. Two rounds run at the
// same time on their own sys.Sessions, each holding its shell start at its own stage through
// Session.StartHook, while a third session without a hook runs freely. It prints
// "l-startup-hooks-per-run harness: ok" and exits 0, or prints the failure and exits 1.

import (
	"context"
	"errors"
	"fmt"
	"os"
	"reflect"
	"sync"
	"time"

	"github.com/KogenAI/kogen-loop/loop"
	"github.com/KogenAI/kogen-loop/provider"
	"github.com/KogenAI/kogen-loop/sys"
	"github.com/KogenAI/kogen-loop/tools"
)

type requester struct {
	mu        sync.Mutex
	responses []*provider.Response
	asked     int
}

func (r *requester) Request(ctx context.Context, q loop.Request) (*provider.Response, []any, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return nil, nil, err
	}
	r.asked++
	if r.asked > len(r.responses) {
		return nil, nil, errors.New("no response left")
	}
	return r.responses[r.asked-1], append([]any(nil), q.Input...), nil
}

// gate is one session's hook: it records every stage it sees and holds the first call at its
// hold stage until released.
type gate struct {
	name, hold  string
	mu          sync.Mutex
	stages      []string
	reachedOnce sync.Once
	reached     chan struct{}
	releaseOnce sync.Once
	release     chan struct{}
}

func newGate(name, hold string) *gate {
	return &gate{name: name, hold: hold, reached: make(chan struct{}), release: make(chan struct{})}
}

func (g *gate) hook(stage string) {
	g.mu.Lock()
	g.stages = append(g.stages, stage)
	g.mu.Unlock()
	if stage == g.hold {
		g.reachedOnce.Do(func() { close(g.reached) })
		<-g.release
	}
}

func (g *gate) seen() []string {
	g.mu.Lock()
	defer g.mu.Unlock()
	return append([]string{}, g.stages...)
}

func (g *gate) open() { g.releaseOnce.Do(func() { close(g.release) }) }

type round struct {
	done chan struct{}
	res  loop.Result
	err  error
}

func (r *round) returned() bool {
	select {
	case <-r.done:
		return true
	default:
		return false
	}
}

func (r *round) output() string {
	for _, it := range r.res.Input {
		if m, ok := it.(map[string]any); ok && m["type"] == "function_call_output" && m["call_id"] == "c1" {
			return fmt.Sprint(m["output"])
		}
	}
	return "<no output for c1>"
}

// start runs one round on its own session: one shell call printing word, then a no-call answer.
func start(sess *sys.Session, root, word string) *round {
	rq := &requester{responses: []*provider.Response{
		{ID: "r1", Items: []map[string]any{{"type": "function_call", "call_id": "c1", "name": "shell", "arguments": "{\"command\":\"echo " + word + "\"}"}}},
		{ID: "r2", Items: []map[string]any{{"type": "message", "id": "m1", "role": "assistant", "content": []any{map[string]any{"type": "output_text", "text": "done", "annotations": []any{}}}}}},
	}}
	rd := loop.Round{
		Owner: "test", Role: provider.Role{Provider: "chatgpt", Model: "m", Effort: "e"},
		Instructions: "inst", Definitions: []any{"def"},
		Tools: &tools.Tools{Root: root, Session: sess, Enabled: []string{"shell"}},
	}
	r := &round{done: make(chan struct{})}
	go func() {
		defer close(r.done)
		r.res, r.err = loop.Run(context.Background(), rd, []any{map[string]any{"role": "user", "content": "go"}}, rq, loop.Hooks{})
	}()
	return r
}

func session(dirs *[]string) (*sys.Session, string, error) {
	root, err := os.MkdirTemp("", "l-startup-hooks-per-run-root-")
	if err != nil {
		return nil, "", err
	}
	home, err := os.MkdirTemp("", "l-startup-hooks-per-run-home-")
	if err != nil {
		return nil, "", err
	}
	*dirs = append(*dirs, root, home)
	return sys.NewWith([]string{"HOME=" + home, "PATH=" + os.Getenv("PATH")}, root), root, nil
}

func check(a, b *gate, dirs *[]string) error {
	sa, rootA, err := session(dirs)
	if err != nil {
		return err
	}
	sb, rootB, err := session(dirs)
	if err != nil {
		return err
	}
	sa.StartHook = a.hook
	sb.StartHook = b.hook
	runA := start(sa, rootA, "round-a")
	runB := start(sb, rootB, "round-b")
	for _, g := range []*gate{a, b} {
		select {
		case <-g.reached:
		case <-time.After(20 * time.Second):
			return fmt.Errorf("round %s never stopped at its hold stage %q within 20 s; its session hook saw %q", g.name, g.hold, g.seen())
		}
	}
	if got, want := a.seen(), []string{"enter", "starting"}; !reflect.DeepEqual(got, want) {
		return fmt.Errorf("round A (held at starting) saw stages %q, want %q", got, want)
	}
	if got, want := b.seen(), []string{"enter", "starting", "started"}; !reflect.DeepEqual(got, want) {
		return fmt.Errorf("round B (held at started) saw stages %q, want %q", got, want)
	}

	// A session without a hook is neither held nor seen by the held rounds' hooks.
	sc, rootC, err := session(dirs)
	if err != nil {
		return err
	}
	free := make(chan string, 1)
	go func() {
		res, err := sc.Run("echo free", rootC, sys.Options{})
		free <- fmt.Sprintf("%d %q %v", res.Status, res.Output, err)
	}()
	select {
	case got := <-free:
		if got != "0 \"free\\n\" <nil>" {
			return fmt.Errorf("a session without a hook ran %s, want 0 \"free\\n\" <nil>", got)
		}
	case <-time.After(10 * time.Second):
		return errors.New("a session without a hook was blocked for 10 s while two other sessions were held")
	}
	if got := a.seen(); !reflect.DeepEqual(got, []string{"enter", "starting"}) {
		return fmt.Errorf("round A's hook saw %q after another session ran a command, want [enter starting]", got)
	}
	if got := b.seen(); !reflect.DeepEqual(got, []string{"enter", "starting", "started"}) {
		return fmt.Errorf("round B's hook saw %q after another session ran a command, want [enter starting started]", got)
	}
	if runA.returned() || runB.returned() {
		return fmt.Errorf("a held round returned: A %v, B %v", runA.returned(), runB.returned())
	}

	// Releasing B lets only B finish; A stays held at its own stage.
	b.open()
	select {
	case <-runB.done:
	case <-time.After(10 * time.Second):
		return errors.New("round B did not return within 10 s of releasing its own hook")
	}
	if runB.err != nil || runB.res.Ending != loop.EndNoCall || runB.output() != "exit status: 0\nround-b\n" {
		return fmt.Errorf("round B returned %v ending %q output %q, want no error, no_call and \"exit status: 0\\nround-b\\n\"", runB.err, runB.res.Ending, runB.output())
	}
	time.Sleep(100 * time.Millisecond)
	if runA.returned() {
		return errors.New("round A returned although only round B's hook was released")
	}
	if got := a.seen(); !reflect.DeepEqual(got, []string{"enter", "starting"}) {
		return fmt.Errorf("round A's hook saw %q after round B finished, want [enter starting]", got)
	}

	a.open()
	select {
	case <-runA.done:
	case <-time.After(10 * time.Second):
		return errors.New("round A did not return within 10 s of releasing its own hook")
	}
	if runA.err != nil || runA.res.Ending != loop.EndNoCall || runA.output() != "exit status: 0\nround-a\n" {
		return fmt.Errorf("round A returned %v ending %q output %q, want no error, no_call and \"exit status: 0\\nround-a\\n\"", runA.err, runA.res.Ending, runA.output())
	}
	for _, g := range []*gate{a, b} {
		if got, want := g.seen(), []string{"enter", "starting", "started"}; !reflect.DeepEqual(got, want) {
			return fmt.Errorf("round %s's hook saw %q in total, want exactly %q (its own one shell start)", g.name, got, want)
		}
	}
	return nil
}

func main() {
	a, b := newGate("A", "starting"), newGate("B", "started")
	var dirs []string
	err := check(a, b, &dirs)
	a.open()
	b.open()
	for _, d := range dirs {
		os.RemoveAll(d)
	}
	if err != nil {
		fmt.Println("l-startup-hooks-per-run harness: FAIL: " + err.Error())
		os.Exit(1)
	}
	fmt.Println("l-startup-hooks-per-run harness: ok")
}
`;

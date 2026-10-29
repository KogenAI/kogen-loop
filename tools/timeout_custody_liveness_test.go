package tools

import (
	"context"
	"testing"
)

func TestTimeoutCustodyContextCalls(t *testing.T) {
	tt := &Tools{Root: t.TempDir(), Enabled: []string{ShellTool}}
	call := Call{Name: ShellTool, Arguments: `{"command":"printf exact"}`}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	// Context must not impose policy on unbounded calls, and old nil wrappers
	// must retain exact ordinary bytes.
	for _, run := range []func() (Output, error){func() (Output, error) { return tt.RunContext(ctx, ShellTool, call.Args()) }, func() (Output, error) { return tt.CallContext(ctx, call) }, func() (Output, error) { return tt.Run(ShellTool, call.Args()) }, func() (Output, error) { return tt.Call(call) }} {
		out, err := run()
		if err != nil || out.Text != "exit status: 0\nexact" {
			t.Fatalf("%+v %v", out, err)
		}
	}
}

# Changelog

## v0.1.0 (unreleased)

- bbf3fdd Extract the standalone Kogen Loop
- b782019 Verify provider affinity and tool-batch replay
- 84c427d Add caller-owned shell duration bounds
- f47ec9f Restore timeout custody liveness
- 0665b58 Explain invalid Anthropic stream outcomes
- 2ea31bf Retry transient provider stream faults
- 3fd0443 Sweep command groups and refuse foreign kills
- 9c079e1 Store a token for the external executor
- bd627aa Keep the provider's bounded refusal message
- c803fea Add a round limit and no-progress stop to Run
- c7e8331 Fix two Linux test flakes
- Remove the unused `provider.Request.AnthropicCacheTTL` and `Budget`, `loop.Direct.Policy` (with `ContextPolicy`), `loop.Round.StopAfterTerminal` and `loop.SessionConfig.CacheID` options
- Remove the unused experimental levers: provider prefix-event logging (`provider.Client.PrefixLog`, `EndPrefixLog`, `PrefixEvent`), the read ledger (`loop.Round.ReadLedger`, `ReadLedger`, `NewReadLedger`, `Continuation`), terminal reminders (`loop.Round.TerminalReminders`, `loop.SessionConfig.TerminalReminders`, `loop.Hooks.TerminalReminder`, the `round.terminal_reminder` event), compact tool descriptions (`tools.Tools.CompactDescriptions`) and `tools.Tools.OmitViewImage`. Behavior is fixed at the former defaults: a response without a tool call ends the round, tool descriptions are full and `view_image` is offered whenever it is enabled. No default request, result, definition or tool-output bytes change.

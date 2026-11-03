Feature: kogen-loop pins what its consumers use in its own contract suite
  kogen-loop's contract/ package is a Go test suite that pins the exported API its consumers
  (kogen, kogen-coordinator, kogen-executor, kogen-verification, kogen-shaping, kogen-build)
  call, the behaviours they rely on and the file and wire formats they read or write, with
  cases copied and adapted from the consumers' own tests and synthetic fixtures only. It runs
  in the ordinary `go test ./...`, offline and fast, without the consumer repositories, so an
  interface change fails in kogen-loop first.

  Scenario: The contract suite passes offline and fast in the ordinary go test run
    When I run the kogen-loop contract suite offline
    Then the contract suite run observations are:
      """
      {"exit":0,"build_failed":false,"packages_not_passed":[],"tests_failed":[],"tests_skipped":[],"ran_tests":true,"packages_over_30_seconds":[],"not_in_go_list_all":[],"build_constraints":[]}
      """

  Scenario: The contract suite uses and lists every kogen-loop member a consumer uses
    Given the kogen-loop members its consumers use are:
      | member | consumers |
      | api.Library | kogen, kogen-build |
      | api.Protocol | kogen |
      | api.Usage | kogen-build |
      | api.Usage.Cached | kogen-build |
      | api.Usage.Input | kogen-build |
      | api.Usage.Output | kogen-build |
      | api.Usage.Reasoning | kogen-build |
      | api.Usage.State | kogen-build |
      | loop.Handled | kogen-build |
      | loop.Handled.Handled | kogen-build |
      | loop.Handled.Output | kogen-build |
      | loop.Hooks | kogen-build |
      | loop.Hooks.AfterCall | kogen-build |
      | loop.Hooks.AfterResponse | kogen-build |
      | loop.Hooks.BeforeCall | kogen-build |
      | loop.Hooks.BeforeRequest | kogen-build |
      | loop.Hooks.HandleCall | kogen-build |
      | loop.Request | kogen-build |
      | loop.Request.Input | kogen-build |
      | loop.Request.Instructions | kogen-build |
      | loop.Request.Owner | kogen-build |
      | loop.Request.Tools | kogen-build |
      | loop.Result.Input | kogen-build |
      | loop.Result.Response | kogen-build |
      | loop.Result.Terminal | kogen-build |
      | loop.Round | kogen-build |
      | loop.Round.Definitions | kogen-build |
      | loop.Round.Instructions | kogen-build |
      | loop.Round.Owner | kogen-build |
      | loop.Round.Role | kogen-build |
      | loop.Round.Terminal | kogen-build |
      | loop.Round.Tools | kogen-build |
      | loop.Run | kogen-build |
      | loop.SumUsage | kogen-build |
      | loop.UsageOf | kogen-build |
      | provider.Cache | kogen-build |
      | provider.Cache.States | kogen-build |
      | provider.CacheState | kogen-build |
      | provider.CacheState.ID | kogen-build |
      | provider.CacheState.Response | kogen-build |
      | provider.CacheState.Unsupported | kogen-build |
      | provider.CacheState.Valid | kogen-build |
      | provider.CheckSeams | kogen |
      | provider.ClaudeCodeToken | kogen |
      | provider.Client | kogen, kogen-executor, kogen-shaping, kogen-build |
      | provider.Client.Body | kogen, kogen-shaping, kogen-build |
      | provider.Client.Cache | kogen-shaping, kogen-build |
      | provider.Client.HTTP | kogen, kogen-shaping, kogen-build |
      | provider.Client.Input | kogen |
      | provider.Client.Login | kogen |
      | provider.Client.LoginWithBaseURL | kogen |
      | provider.Client.Now | kogen-executor, kogen-shaping, kogen-build |
      | provider.Client.Respond | kogen, kogen-executor, kogen-shaping, kogen-build |
      | provider.Client.ResponseBudget | kogen, kogen-executor, kogen-shaping, kogen-build |
      | provider.Client.Sleep | kogen, kogen-executor, kogen-shaping |
      | provider.Client.Version | kogen-shaping, kogen-build |
      | provider.ContractBlocks | kogen-shaping, kogen-build |
      | provider.Fingerprint | kogen-build |
      | provider.Info.Name | kogen |
      | provider.Input.Reader | kogen |
      | provider.InputBudgetBytes | kogen-shaping |
      | provider.KnownUsage | kogen-build |
      | provider.KnownUsage.Cached | kogen-build |
      | provider.KnownUsage.Input | kogen-build |
      | provider.KnownUsage.Map | kogen-shaping |
      | provider.KnownUsage.Output | kogen-build |
      | provider.KnownUsage.Reasoning | kogen-build |
      | provider.KnownUsage.Write | kogen-build |
      | provider.Lookup | kogen |
      | provider.MaxCacheID | kogen-build |
      | provider.Name | kogen-build |
      | provider.NewCache | kogen-shaping, kogen-build |
      | provider.NewCacheID | kogen-shaping, kogen-build |
      | provider.NewClient | kogen, kogen-executor, kogen-shaping, kogen-build |
      | provider.Observer | kogen-shaping |
      | provider.OfficialText | kogen |
      | provider.Profiles | kogen |
      | provider.RedirectFunc | kogen |
      | provider.Request | kogen, kogen-executor, kogen-shaping, kogen-build |
      | provider.Request.Cache | kogen-build |
      | provider.Request.CacheID | kogen, kogen-executor, kogen-shaping, kogen-build |
      | provider.Request.Context | kogen-shaping, kogen-build |
      | provider.Request.Input | kogen, kogen-executor, kogen-shaping, kogen-build |
      | provider.Request.Instructions | kogen, kogen-executor, kogen-shaping, kogen-build |
      | provider.Request.Role | kogen, kogen-executor, kogen-shaping, kogen-build |
      | provider.Request.Scope | kogen, kogen-shaping |
      | provider.Request.Single | kogen-shaping |
      | provider.Request.ToolChoice | kogen-shaping, kogen-build |
      | provider.Request.Tools | kogen, kogen-shaping, kogen-build |
      | provider.RequireLogin | kogen, kogen-shaping, kogen-build |
      | provider.Response | kogen-shaping, kogen-build |
      | provider.Response.Items | kogen-shaping, kogen-build |
      | provider.Response.Known | kogen-shaping, kogen-build |
      | provider.Response.Model | kogen-build |
      | provider.Response.OperationID | kogen-build |
      | provider.Response.Usage | kogen-shaping, kogen-build |
      | provider.ResponseBudget | kogen, kogen-executor, kogen-build |
      | provider.Role | kogen, kogen-executor, kogen-shaping, kogen-build |
      | provider.Role.BaseURL | kogen, kogen-shaping, kogen-build |
      | provider.Role.Effort | kogen, kogen-executor, kogen-shaping, kogen-build |
      | provider.Role.Model | kogen, kogen-executor, kogen-shaping, kogen-build |
      | provider.Role.Provider | kogen, kogen-executor, kogen-shaping, kogen-build |
      | provider.Status | kogen |
      | provider.StdinInput | kogen |
      | provider.SupportsToolChoice | kogen-shaping, kogen-build |
      | provider.Usage | kogen-shaping, kogen-build |
      | provider.Usage.Add | kogen-shaping |
      | provider.Usage.Cached | kogen-shaping, kogen-build |
      | provider.Usage.Input | kogen-shaping, kogen-build |
      | provider.Usage.Line | kogen-shaping |
      | provider.Usage.Output | kogen-shaping, kogen-build |
      | provider.Usage.Reasoning | kogen-shaping, kogen-build |
      | provider.ValidCacheStates | kogen-build |
      | sys.AsError | kogen, kogen-coordinator, kogen-executor, kogen-verification, kogen-shaping, kogen-build |
      | sys.EnableSupervisor | kogen |
      | sys.ErrTimeoutObservation | kogen-verification, kogen-shaping |
      | sys.Error | kogen-coordinator, kogen-executor, kogen-verification, kogen-shaping, kogen-build |
      | sys.Error.Class | kogen, kogen-coordinator, kogen-executor, kogen-verification, kogen-shaping, kogen-build |
      | sys.Error.Detail | kogen, kogen-coordinator, kogen-executor, kogen-verification, kogen-shaping, kogen-build |
      | sys.Error.Error | kogen-coordinator, kogen-shaping |
      | sys.Error.Exit | kogen, kogen-coordinator, kogen-executor, kogen-verification, kogen-shaping, kogen-build |
      | sys.Error.Lines | kogen, kogen-coordinator, kogen-executor, kogen-verification, kogen-shaping, kogen-build |
      | sys.Error.ProviderFailure | kogen-shaping, kogen-build |
      | sys.Error.Reason | kogen, kogen-coordinator, kogen-executor, kogen-verification, kogen-shaping, kogen-build |
      | sys.Error.Render | kogen, kogen-coordinator, kogen-verification, kogen-shaping, kogen-build |
      | sys.Fail | kogen, kogen-coordinator, kogen-executor, kogen-verification, kogen-shaping, kogen-build |
      | sys.Interrupted | kogen, kogen-coordinator, kogen-verification, kogen-shaping, kogen-build |
      | sys.Interrupted.ExitCode | kogen, kogen-shaping, kogen-build |
      | sys.Interrupted.Signal | kogen-verification, kogen-shaping, kogen-build |
      | sys.MaybeSupervise | kogen |
      | sys.New | kogen, kogen-verification |
      | sys.NewWith | kogen, kogen-coordinator, kogen-executor, kogen-verification, kogen-shaping, kogen-build |
      | sys.Options | kogen, kogen-coordinator, kogen-verification, kogen-shaping, kogen-build |
      | sys.Options.Context | kogen-verification |
      | sys.Options.Env | kogen, kogen-verification, kogen-shaping |
      | sys.Options.FinishOnInterrupt | kogen-coordinator |
      | sys.Options.KillGroupOnExit | kogen, kogen-coordinator, kogen-verification, kogen-shaping, kogen-build |
      | sys.Options.RefuseForeignKill | kogen-verification |
      | sys.Options.Timeout | kogen-verification |
      | sys.Result | kogen, kogen-verification, kogen-shaping, kogen-build |
      | sys.Result.Output | kogen-coordinator, kogen-verification, kogen-shaping, kogen-build |
      | sys.Result.Status | kogen, kogen-coordinator, kogen-verification, kogen-shaping, kogen-build |
      | sys.Result.TimedOut | kogen-verification |
      | sys.Session | kogen, kogen-coordinator, kogen-verification, kogen-shaping, kogen-build |
      | sys.Session.Context | kogen, kogen-verification, kogen-shaping, kogen-build |
      | sys.Session.Cwd | kogen, kogen-verification, kogen-shaping |
      | sys.Session.Debug | kogen |
      | sys.Session.Env | kogen, kogen-verification, kogen-shaping, kogen-build |
      | sys.Session.Err | kogen, kogen-coordinator, kogen-verification, kogen-shaping, kogen-build |
      | sys.Session.Getenv | kogen, kogen-verification, kogen-shaping, kogen-build |
      | sys.Session.Groups | kogen, kogen-verification, kogen-build |
      | sys.Session.Interrupt | kogen-coordinator, kogen-verification, kogen-shaping, kogen-build |
      | sys.Session.LookupEnv | kogen-verification |
      | sys.Session.Out | kogen, kogen-shaping, kogen-build |
      | sys.Session.Progress | kogen-coordinator, kogen-verification, kogen-shaping, kogen-build |
      | sys.Session.Puts | kogen, kogen-shaping, kogen-build |
      | sys.Session.Run | kogen, kogen-coordinator, kogen-verification, kogen-shaping, kogen-build |
      | sys.Session.Stderr | kogen, kogen-coordinator, kogen-verification, kogen-shaping, kogen-build |
      | sys.Session.Stdout | kogen-shaping, kogen-build |
      | sys.Session.WatchSignals | kogen |
      | sys.Terminate | kogen, kogen-build |
      | sys.TmpPath | kogen-coordinator, kogen-verification, kogen-shaping |
      | tools.AsAny | kogen-executor |
      | tools.Call | kogen-shaping, kogen-build |
      | tools.Call.Args | kogen-shaping, kogen-build |
      | tools.Call.Arguments | kogen-build |
      | tools.Call.CallID | kogen-build |
      | tools.Call.Item | kogen-build |
      | tools.Call.Name | kogen-shaping, kogen-build |
      | tools.Call.Output | kogen-shaping, kogen-build |
      | tools.Calls | kogen-shaping, kogen-build |
      | tools.Cut | kogen, kogen-shaping, kogen-build |
      | tools.DecodeArguments | kogen, kogen-shaping, kogen-build |
      | tools.Definition | kogen, kogen-executor, kogen-build |
      | tools.Deliver | kogen-shaping, kogen-build |
      | tools.Documentation | kogen, kogen-shaping |
      | tools.Documentation.Lookup | kogen |
      | tools.Documentation.UserAgent | kogen-shaping |
      | tools.DocumentationTool | kogen, kogen-executor, kogen-shaping |
      | tools.Git | kogen-executor |
      | tools.Git.Head | kogen-executor |
      | tools.Git.Run | kogen-executor |
      | tools.Git.Tree | kogen-executor |
      | tools.GitResult | kogen-executor |
      | tools.GitResult.Status | kogen-executor |
      | tools.GitResult.Stderr | kogen-executor |
      | tools.GitResult.Stdout | kogen-executor |
      | tools.ImageEntries | kogen-build |
      | tools.ImageEntry | kogen-build |
      | tools.ImageEntry.Meta | kogen-build |
      | tools.InputBudgetBytes | kogen, kogen-shaping, kogen-build |
      | tools.ListFilesTool | kogen, kogen-executor, kogen-shaping |
      | tools.Measure | kogen, kogen-shaping, kogen-build |
      | tools.Measurement | kogen-build |
      | tools.Measurement.Fits | kogen, kogen-shaping, kogen-build |
      | tools.Measurement.InputBudgetBytes | kogen, kogen-build |
      | tools.Measurement.OutputReserveTokens | kogen, kogen-build |
      | tools.Measurement.RenderedBytes | kogen, kogen-shaping, kogen-build |
      | tools.Output | kogen, kogen-shaping, kogen-build |
      | tools.Output.Cut | kogen, kogen-shaping, kogen-build |
      | tools.Output.Parts | kogen |
      | tools.Output.Text | kogen, kogen-executor, kogen-shaping, kogen-build |
      | tools.Output.Typed | kogen-executor, kogen-build |
      | tools.Output.Value | kogen-build |
      | tools.OutputItem | kogen, kogen-build |
      | tools.OutputReserveTokens | kogen-shaping, kogen-build |
      | tools.ReadEvent | kogen-shaping, kogen-build |
      | tools.ReadFileTool | kogen, kogen-executor, kogen-shaping, kogen-build |
      | tools.Replay | kogen-shaping, kogen-build |
      | tools.ReplayItem | kogen |
      | tools.SearchTextTool | kogen, kogen-executor, kogen-shaping |
      | tools.ShellTool | kogen, kogen-executor |
      | tools.Tools | kogen, kogen-executor, kogen-shaping, kogen-build |
      | tools.Tools.Call | kogen-build |
      | tools.Tools.Definition | kogen-build |
      | tools.Tools.Documentation | kogen-shaping |
      | tools.Tools.Enabled | kogen, kogen-executor, kogen-shaping, kogen-build |
      | tools.Tools.Excluded | kogen-build |
      | tools.Tools.Probe | kogen-executor, kogen-shaping |
      | tools.Tools.Protected | kogen-build |
      | tools.Tools.Repo | kogen-executor, kogen-shaping, kogen-build |
      | tools.Tools.Root | kogen, kogen-executor, kogen-shaping, kogen-build |
      | tools.Tools.Run | kogen, kogen-executor, kogen-shaping, kogen-build |
      | tools.Tools.Session | kogen, kogen-executor, kogen-shaping, kogen-build |
      | tools.ViewImageTool | kogen, kogen-executor, kogen-shaping |
      | tools.WriteFileTool | kogen, kogen-executor |
    When I compare the contract suite and contract/README.md with that inventory
    Then the contract inventory observations are:
      """
      {"unused":[],"missing_rows":[],"extra_rows":[],"duplicate_rows":[],"wrong_consumers":[],"bad_sources":[],"unknown_tests":[]}
      """

  Scenario: The contract suite depends on nothing but kogen-loop and the standard library
    When I observe what the contract suite depends on
    Then the contract dependency observations are:
      """
      {"go_mod":"module kogen-loop\n\ngo 1.27.2\n","go_sum":false,"foreign_imports":[],"parent_paths":[]}
      """

  Scenario: A change to a behaviour a consumer relies on fails the contract suite first
    Given these consumer-relied kogen-loop behaviour changes:
      """
      [
        {"id": "sys-error-line", "file": "sys/error.go", "from": "e.Class + \"/\" + e.Reason", "to": "e.Class + \":\" + e.Reason", "count": 1},
        {"id": "sys-error-lines", "file": "sys/error.go", "from": "b.WriteString(\"  \" + l", "to": "b.WriteString(\"    \" + l", "count": 1},
        {"id": "sys-interrupt-exit", "file": "sys/sys.go", "from": "\"SIGINT\": 130", "to": "\"SIGINT\": 2", "count": 1},
        {"id": "sys-foreign-kill-status", "file": "sys/sys.go", "from": "return Result{Status: 126, Output: RefusalText(rule), Rule: rule}, nil", "to": "return Result{Status: 1, Output: RefusalText(rule), Rule: rule}, nil", "count": 1},
        {"id": "tools-unknown-tool", "file": "tools/tools.go", "from": "\"error: unknown tool \" + name, MalformedClass", "to": "\"error: no tool \" + name, MalformedClass", "count": 1},
        {"id": "tools-read-numbered", "file": "tools/tools.go", "from": "strconv.FormatInt(n, 10) +", "to": "strconv.FormatInt(n, 10) + \":\" +", "count": 1},
        {"id": "tools-cut-bound", "file": "tools/tools.go", "from": "maxResult         = 16_384", "to": "maxResult         = 16_000", "count": 1},
        {"id": "tools-cut-head", "file": "tools/tools.go", "from": "defaultResultHead = 4096", "to": "defaultResultHead = 2048", "count": 1},
        {"id": "tools-invalid-arguments", "file": "tools/conversation.go", "from": "return map[string]any{\"__invalid__\": true}", "to": "return map[string]any{}", "count": 1},
        {"id": "tools-output-item", "file": "tools/conversation.go", "from": "\"call_id\": callID, \"output\": result", "to": "\"id\": callID, \"output\": result", "count": 1},
        {"id": "provider-cache-key", "file": "provider/wire.go", "from": "body[\"prompt_cache_key\"] = id", "to": "body[\"prompt_cache_id\"] = id", "count": 2},
        {"id": "provider-cache-id-format", "file": "provider/cache.go", "from": "return prefix + \"-\" + hex.EncodeToString(b)", "to": "return prefix + \"_\" + hex.EncodeToString(b)", "count": 1},
        {"id": "provider-usage-line", "file": "provider/usage.go", "from": "\"input=%d cached=%d output=%d reasoning=%d\"", "to": "\"input=%d cache=%d output=%d reasoning=%d\"", "count": 1},
        {"id": "provider-input-budget", "file": "provider/respond.go", "from": "const InputBudgetBytes = 524288", "to": "const InputBudgetBytes = 500000", "count": 1},
        {"id": "provider-response-budget", "file": "provider/client.go", "from": "const ResponseBudget = 30 * time.Minute", "to": "const ResponseBudget = 20 * time.Minute", "count": 1},
        {"id": "provider-url-seam", "file": "provider/respond.go", "from": "k.origin()+\"/v1/responses\"", "to": "k.origin()+\"/v2/responses\"", "count": 1},
        {"id": "provider-credentials", "file": "provider/creds.go", "from": "!nonempty(c[\"access_token\"])", "to": "!nonempty(c[\"access\"])", "count": 1},
        {"id": "provider-wait-text", "file": "provider/client.go", "from": "\" response wait exceeded \"", "to": "\" response took longer than \"", "count": 1},
        {"id": "api-protocol", "file": "api/api.go", "from": "Protocol = \"kogen-loop/v1\"", "to": "Protocol = \"kogen-loop/v2\"", "count": 1},
        {"id": "api-library", "file": "api/api.go", "from": "Library = \"loop/v1\"", "to": "Library = \"loop/v2\"", "count": 1},
        {"id": "loop-terminal", "file": "loop/loop.go", "from": "isTerminal := slices.Contains(terminal, call.Name)", "to": "isTerminal := false", "count": 1},
        {"id": "loop-usage-state", "file": "loop/usage.go", "from": "known++", "to": "known += 2", "count": 1}
      ]
      """
    When I run the contract suite on the unchanged tree and after each change
    Then the contract suite outcomes are:
      """
      {
        "unchanged": "contract passed",
        "sys-error-line": "contract failed",
        "sys-error-lines": "contract failed",
        "sys-interrupt-exit": "contract failed",
        "sys-foreign-kill-status": "contract failed",
        "tools-unknown-tool": "contract failed",
        "tools-read-numbered": "contract failed",
        "tools-cut-bound": "contract failed",
        "tools-cut-head": "contract failed",
        "tools-invalid-arguments": "contract failed",
        "tools-output-item": "contract failed",
        "provider-cache-key": "contract failed",
        "provider-cache-id-format": "contract failed",
        "provider-usage-line": "contract failed",
        "provider-input-budget": "contract failed",
        "provider-response-budget": "contract failed",
        "provider-url-seam": "contract failed",
        "provider-credentials": "contract failed",
        "provider-wait-text": "contract failed",
        "api-protocol": "contract failed",
        "api-library": "contract failed",
        "loop-terminal": "contract failed",
        "loop-usage-state": "contract failed"
      }
      """

  Scenario: The README points at the contract and states how it changes
    When I read the contract documentation
    Then the contract documentation observations are:
      """
      {"readme_folder_map_row":true,"readme_links_contract":true,"contract_readme_change_rule":true}
      """

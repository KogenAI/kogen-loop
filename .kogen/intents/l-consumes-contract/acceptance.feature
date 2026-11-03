Feature: kogen-loop states what it consumes and covers what its consumers use
  kogen-loop depends on no other Kogen repository, so it has no consumes/ directory. Its
  contract/ suite states what it provides: it must cover every kogen-loop member its consumers
  (kogen, kogen-coordinator, kogen-executor, kogen-verification, kogen-shaping, kogen-setup,
  kogen-review, kogen-build) use at their current main commits, which those consumers will state
  in their own consumes/kogen-loop/ suites. The suite runs in the ordinary go test ./...,
  offline, and kogen-loop's behaviour, go.mod and go.sum stay unchanged.

  Scenario: The contract suite uses and lists every kogen-loop member a current consumer uses
    Given l-consumes-contract: the kogen-loop members its consumers use are:
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
      | provider.Catalog | kogen-setup |
      | provider.CheckSeams | kogen |
      | provider.ClaudeCodeToken | kogen, kogen-setup |
      | provider.Client | kogen, kogen-executor, kogen-shaping, kogen-setup, kogen-review, kogen-build |
      | provider.Client.Body | kogen, kogen-shaping, kogen-build |
      | provider.Client.Cache | kogen-shaping, kogen-build |
      | provider.Client.HTTP | kogen, kogen-shaping, kogen-setup, kogen-build |
      | provider.Client.Input | kogen |
      | provider.Client.Login | kogen |
      | provider.Client.LoginWithBaseURL | kogen |
      | provider.Client.Now | kogen-executor, kogen-shaping, kogen-build |
      | provider.Client.Respond | kogen, kogen-executor, kogen-shaping, kogen-setup, kogen-review, kogen-build |
      | provider.Client.ResponseBudget | kogen, kogen-executor, kogen-shaping, kogen-setup, kogen-build |
      | provider.Client.Sleep | kogen, kogen-executor, kogen-shaping |
      | provider.Client.Version | kogen-shaping, kogen-build |
      | provider.ContractBlocks | kogen-shaping, kogen-build |
      | provider.Fingerprint | kogen-review, kogen-build |
      | provider.Info.Models | kogen-setup |
      | provider.Info.Name | kogen, kogen-setup |
      | provider.Input.Reader | kogen |
      | provider.InputBudgetBytes | kogen-shaping |
      | provider.KnownUsage | kogen-build |
      | provider.KnownUsage.Cached | kogen-executor, kogen-build |
      | provider.KnownUsage.Input | kogen-executor, kogen-build |
      | provider.KnownUsage.Map | kogen-shaping |
      | provider.KnownUsage.Output | kogen-executor, kogen-build |
      | provider.KnownUsage.Reasoning | kogen-executor |
      | provider.KnownUsage.Write | kogen-build |
      | provider.Lookup | kogen |
      | provider.MaxCacheID | kogen-build |
      | provider.Name | kogen-executor, kogen-review |
      | provider.NewCache | kogen-shaping, kogen-build |
      | provider.NewCacheID | kogen-shaping, kogen-setup, kogen-build |
      | provider.NewClient | kogen, kogen-executor, kogen-shaping, kogen-setup, kogen-review, kogen-build |
      | provider.Observer | kogen-shaping |
      | provider.OfficialText | kogen |
      | provider.Profiles | kogen |
      | provider.RedirectFunc | kogen |
      | provider.Request | kogen, kogen-executor, kogen-shaping, kogen-setup, kogen-review, kogen-build |
      | provider.Request.Cache | kogen-build |
      | provider.Request.CacheID | kogen, kogen-executor, kogen-shaping, kogen-setup, kogen-build |
      | provider.Request.Context | kogen-shaping, kogen-build |
      | provider.Request.Input | kogen, kogen-executor, kogen-shaping, kogen-setup, kogen-review, kogen-build |
      | provider.Request.Instructions | kogen, kogen-executor, kogen-shaping, kogen-setup, kogen-review, kogen-build |
      | provider.Request.Role | kogen, kogen-executor, kogen-shaping, kogen-setup, kogen-review, kogen-build |
      | provider.Request.Scope | kogen, kogen-shaping |
      | provider.Request.ToolChoice | kogen-shaping, kogen-review, kogen-build |
      | provider.Request.Tools | kogen, kogen-shaping, kogen-setup, kogen-review, kogen-build |
      | provider.RequireLogin | kogen, kogen-shaping, kogen-setup, kogen-build |
      | provider.Response | kogen-executor, kogen-shaping, kogen-review, kogen-build |
      | provider.Response.Items | kogen-shaping, kogen-setup, kogen-review, kogen-build |
      | provider.Response.Known | kogen-executor, kogen-shaping, kogen-build |
      | provider.Response.Model | kogen-build |
      | provider.Response.OperationID | kogen-build |
      | provider.Response.Usage | kogen-executor, kogen-shaping, kogen-setup, kogen-review, kogen-build |
      | provider.ResponseBudget | kogen, kogen-executor, kogen-build |
      | provider.Role | kogen, kogen-executor, kogen-shaping, kogen-setup, kogen-build |
      | provider.Role.BaseURL | kogen, kogen-executor, kogen-shaping, kogen-setup |
      | provider.Role.Effort | kogen, kogen-executor, kogen-shaping, kogen-setup |
      | provider.Role.Model | kogen, kogen-executor, kogen-shaping, kogen-setup, kogen-build |
      | provider.Role.Provider | kogen, kogen-executor, kogen-shaping, kogen-setup, kogen-build |
      | provider.Status | kogen, kogen-setup |
      | provider.StdinInput | kogen |
      | provider.SupportsToolChoice | kogen-shaping, kogen-review, kogen-build |
      | provider.Usage | kogen-executor, kogen-shaping, kogen-setup, kogen-review, kogen-build |
      | provider.Usage.Add | kogen-shaping, kogen-setup |
      | provider.Usage.Cached | kogen-executor, kogen-shaping |
      | provider.Usage.Input | kogen-executor, kogen-shaping, kogen-review, kogen-build |
      | provider.Usage.Line | kogen-shaping, kogen-setup |
      | provider.Usage.Output | kogen-executor, kogen-shaping, kogen-review, kogen-build |
      | provider.Usage.Reasoning | kogen-executor, kogen-shaping |
      | provider.ValidCacheStates | kogen-build |
      | sys.AsError | kogen, kogen-coordinator, kogen-executor, kogen-verification, kogen-shaping, kogen-setup, kogen-review, kogen-build |
      | sys.CapturedCommand.Done | kogen-verification |
      | sys.CapturedCommand.Snapshot | kogen-verification |
      | sys.CapturedCommand.Stop | kogen-verification |
      | sys.EnableSupervisor | kogen, kogen-review, kogen-build |
      | sys.ErrTimeoutObservation | kogen-verification, kogen-shaping |
      | sys.Error | kogen-coordinator, kogen-executor, kogen-verification, kogen-shaping, kogen-setup, kogen-review, kogen-build |
      | sys.Error.Class | kogen, kogen-coordinator, kogen-executor, kogen-verification, kogen-shaping, kogen-setup, kogen-review, kogen-build |
      | sys.Error.Detail | kogen, kogen-coordinator, kogen-executor, kogen-verification, kogen-shaping, kogen-setup, kogen-review, kogen-build |
      | sys.Error.Error | kogen-coordinator, kogen-shaping, kogen-setup |
      | sys.Error.Exit | kogen, kogen-coordinator, kogen-executor, kogen-verification, kogen-shaping, kogen-setup, kogen-review, kogen-build |
      | sys.Error.Lines | kogen, kogen-coordinator, kogen-executor, kogen-verification, kogen-shaping, kogen-setup, kogen-review, kogen-build |
      | sys.Error.ProviderFailure | kogen-shaping, kogen-build |
      | sys.Error.Reason | kogen, kogen-coordinator, kogen-executor, kogen-verification, kogen-shaping, kogen-setup, kogen-review, kogen-build |
      | sys.Error.Render | kogen, kogen-coordinator, kogen-verification, kogen-shaping, kogen-build |
      | sys.Fail | kogen, kogen-coordinator, kogen-executor, kogen-verification, kogen-shaping, kogen-setup, kogen-review, kogen-build |
      | sys.Interrupted | kogen, kogen-coordinator, kogen-executor, kogen-verification, kogen-shaping, kogen-setup, kogen-build |
      | sys.Interrupted.ExitCode | kogen, kogen-executor, kogen-shaping, kogen-setup, kogen-build |
      | sys.Interrupted.Signal | kogen-executor, kogen-verification, kogen-shaping, kogen-build |
      | sys.MaybeSupervise | kogen, kogen-review, kogen-build |
      | sys.New | kogen, kogen-verification, kogen-shaping, kogen-setup, kogen-review, kogen-build |
      | sys.NewWith | kogen, kogen-coordinator, kogen-executor, kogen-verification, kogen-shaping, kogen-setup, kogen-review, kogen-build |
      | sys.Options | kogen, kogen-coordinator, kogen-verification, kogen-shaping, kogen-setup, kogen-build |
      | sys.Options.Context | kogen-verification, kogen-shaping |
      | sys.Options.Env | kogen, kogen-verification, kogen-shaping, kogen-setup, kogen-build |
      | sys.Options.FinishOnInterrupt | kogen-coordinator |
      | sys.Options.KillGroupOnExit | kogen, kogen-coordinator, kogen-verification, kogen-shaping, kogen-setup, kogen-build |
      | sys.Options.RefuseForeignKill | kogen-verification |
      | sys.Options.Timeout | kogen-verification, kogen-shaping, kogen-setup |
      | sys.Result | kogen, kogen-verification, kogen-shaping, kogen-setup, kogen-build |
      | sys.Result.Output | kogen-coordinator, kogen-verification, kogen-shaping, kogen-setup, kogen-build |
      | sys.Result.Status | kogen, kogen-coordinator, kogen-verification, kogen-shaping, kogen-setup, kogen-build |
      | sys.Result.TimedOut | kogen-verification, kogen-shaping, kogen-setup |
      | sys.Session | kogen, kogen-coordinator, kogen-verification, kogen-shaping, kogen-setup, kogen-review, kogen-build |
      | sys.Session.Context | kogen, kogen-verification, kogen-setup, kogen-review, kogen-build |
      | sys.Session.Cwd | kogen, kogen-verification, kogen-shaping, kogen-setup |
      | sys.Session.Debug | kogen |
      | sys.Session.Env | kogen, kogen-verification, kogen-shaping, kogen-setup, kogen-build |
      | sys.Session.Err | kogen, kogen-coordinator, kogen-verification, kogen-shaping, kogen-setup, kogen-review, kogen-build |
      | sys.Session.Getenv | kogen, kogen-verification, kogen-shaping, kogen-setup, kogen-review, kogen-build |
      | sys.Session.Groups | kogen, kogen-verification, kogen-build |
      | sys.Session.Interrupt | kogen-coordinator, kogen-verification, kogen-shaping, kogen-setup, kogen-build |
      | sys.Session.LookupEnv | kogen-verification |
      | sys.Session.Out | kogen, kogen-shaping, kogen-build |
      | sys.Session.Progress | kogen-coordinator, kogen-verification, kogen-shaping, kogen-setup, kogen-review, kogen-build |
      | sys.Session.Puts | kogen, kogen-shaping, kogen-setup, kogen-build |
      | sys.Session.Run | kogen, kogen-coordinator, kogen-verification, kogen-shaping, kogen-setup, kogen-build |
      | sys.Session.RunContext | kogen-verification, kogen-shaping |
      | sys.Session.StartCaptured | kogen-verification |
      | sys.Session.Stderr | kogen, kogen-coordinator, kogen-verification, kogen-shaping, kogen-setup, kogen-build |
      | sys.Session.Stdout | kogen-shaping, kogen-setup, kogen-review, kogen-build |
      | sys.Session.WatchSignals | kogen, kogen-shaping, kogen-review, kogen-build |
      | sys.Terminate | kogen, kogen-build |
      | sys.TmpPath | kogen-coordinator, kogen-verification, kogen-shaping, kogen-setup |
      | tools.AsAny | kogen-executor |
      | tools.Call | kogen-shaping, kogen-setup, kogen-review, kogen-build |
      | tools.Call.Args | kogen-shaping, kogen-setup, kogen-review, kogen-build |
      | tools.Call.Arguments | kogen-review, kogen-build |
      | tools.Call.CallID | kogen-build |
      | tools.Call.Item | kogen-review, kogen-build |
      | tools.Call.Name | kogen-shaping, kogen-setup, kogen-review, kogen-build |
      | tools.Call.Output | kogen-shaping, kogen-setup, kogen-review, kogen-build |
      | tools.Calls | kogen-shaping, kogen-setup, kogen-review |
      | tools.Cut | kogen, kogen-shaping, kogen-setup, kogen-review, kogen-build |
      | tools.DecodeArguments | kogen, kogen-shaping, kogen-review, kogen-build |
      | tools.Definition | kogen, kogen-executor, kogen-shaping, kogen-setup, kogen-review, kogen-build |
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
      | tools.InputBudgetBytes | kogen, kogen-shaping, kogen-review, kogen-build |
      | tools.ListFilesTool | kogen, kogen-executor, kogen-shaping |
      | tools.Measure | kogen, kogen-shaping, kogen-build |
      | tools.Measurement | kogen-build |
      | tools.Measurement.Fits | kogen, kogen-shaping, kogen-build |
      | tools.Measurement.InputBudgetBytes | kogen, kogen-build |
      | tools.Measurement.OutputReserveTokens | kogen, kogen-build |
      | tools.Measurement.RenderedBytes | kogen, kogen-shaping, kogen-build |
      | tools.Output | kogen, kogen-shaping, kogen-setup, kogen-review, kogen-build |
      | tools.Output.Cut | kogen, kogen-shaping, kogen-setup, kogen-review, kogen-build |
      | tools.Output.Parts | kogen |
      | tools.Output.Text | kogen, kogen-executor, kogen-shaping, kogen-build |
      | tools.Output.Typed | kogen-executor, kogen-build |
      | tools.Output.Value | kogen-review, kogen-build |
      | tools.OutputItem | kogen, kogen-build |
      | tools.OutputReserveTokens | kogen-shaping, kogen-build |
      | tools.ReadEvent | kogen-shaping, kogen-review, kogen-build |
      | tools.ReadFileTool | kogen, kogen-executor, kogen-shaping, kogen-build |
      | tools.Replay | kogen-shaping, kogen-setup, kogen-review, kogen-build |
      | tools.ReplayItem | kogen |
      | tools.SearchTextTool | kogen, kogen-executor, kogen-shaping |
      | tools.ShellTool | kogen, kogen-executor |
      | tools.Tools | kogen, kogen-executor, kogen-shaping, kogen-review, kogen-build |
      | tools.Tools.Call | kogen-review, kogen-build |
      | tools.Tools.Definition | kogen-executor |
      | tools.Tools.Documentation | kogen-shaping |
      | tools.Tools.Enabled | kogen, kogen-executor, kogen-shaping, kogen-review, kogen-build |
      | tools.Tools.Excluded | kogen-build |
      | tools.Tools.Probe | kogen-executor, kogen-shaping |
      | tools.Tools.Protected | kogen-build |
      | tools.Tools.Repo | kogen-executor, kogen-shaping, kogen-build |
      | tools.Tools.Root | kogen, kogen-executor, kogen-shaping, kogen-review, kogen-build |
      | tools.Tools.Run | kogen, kogen-executor, kogen-shaping, kogen-build |
      | tools.Tools.Session | kogen, kogen-executor, kogen-shaping, kogen-review, kogen-build |
      | tools.ViewImageTool | kogen, kogen-executor, kogen-shaping |
      | tools.WriteFileTool | kogen, kogen-executor |
    When l-consumes-contract: I compare the contract suite and contract/README.md with that inventory
    Then l-consumes-contract: the contract inventory observations are:
      """
      {"unused":[],"missing_rows":[],"extra_rows":[],"duplicate_rows":[],"wrong_consumers":[],"bad_sources":[],"unknown_tests":[],"missing_source_commits":[],"foreign_imports":[],"parent_paths":[]}
      """

  Scenario: A change to a behaviour a new consumer use relies on fails the contract suite offline
    Given l-consumes-contract: these consumer-relied kogen-loop behaviour changes:
      """
      [
        {"id": "provider-catalog", "file": "provider/provider.go", "from": "Models: []string{\"grok-4.7\"}", "to": "Models: []string{\"grok-4.6\"}", "count": 1},
        {"id": "sys-run-context-cancel", "file": "sys/sys.go", "from": "return Result{}, ctx.Err()", "to": "return Result{Output: buf.String()}, nil", "count": 1},
        {"id": "sys-captured-partial", "file": "sys/sys.go", "from": "return Result{Output: c.buf.String()}, false, nil", "to": "return Result{}, false, nil", "count": 1},
        {"id": "sys-captured-finished", "file": "sys/sys.go", "from": "return c.result, true, c.err", "to": "return c.result, false, c.err", "count": 1}
      ]
      """
    When l-consumes-contract: I run the contract suite on the unchanged tree and after each change
    Then l-consumes-contract: the contract suite outcomes are:
      """
      {
        "unchanged": "contract passed",
        "provider-catalog": "contract failed",
        "sys-run-context-cancel": "contract failed",
        "sys-captured-partial": "contract failed",
        "sys-captured-finished": "contract failed"
      }
      """
    When l-consumes-contract: I run the kogen-loop contract suite offline
    Then l-consumes-contract: the contract suite run observations are:
      """
      {"exit":0,"build_failed":false,"packages_not_passed":[],"tests_failed":[],"tests_skipped":[],"ran_tests":true,"packages_over_30_seconds":[],"not_in_go_list_all":[],"build_constraints":[]}
      """

  Scenario: kogen-loop consumes no other Kogen repository and says so
    When l-consumes-contract: I observe what kogen-loop consumes from other Kogen repositories
    Then l-consumes-contract: the consumed-repository observations are:
      """
      {"consumes_directory":false,"go_mod":"module kogen-loop\n\ngo 1.27.2\n","go_sum":false,"modules":["kogen-loop"],"foreign_packages":[],"contract_readme":{"section":true,"states_no_consumes":true,"names_the_check":true}}
      """

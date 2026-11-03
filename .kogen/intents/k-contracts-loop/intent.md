# Pin what consumers use in a contract suite

Slug: k-contracts-loop
Model: not applicable — the change adds a test suite and documentation; no product state, transition or interacting rule changes
Acceptance:
- .kogen/intents/k-contracts-loop/acceptance.feature
- features/steps/k_contracts_loop.js
- features/steps/k_contracts_loop_uses.go.txt

K-CONTRACTS-LOOP (filed by kogen-delivery on main's ruling, 3 Nov 2026, after an owner challenge: running every consumer's offline suite at each landing defeats isolated, fast components; contracts belong in the producer; change_type: feature). Today a kogen-loop landing runs the offline suites of its consumers (kogen, kogen-coordinator, kogen-executor, kogen-verification, kogen-shaping, kogen-build) to catch interface breaks. That is slow, and kogen-loop itself does not write down the contract its consumers rely on. After this change kogen-loop has a `contract/` suite that pins exactly what its consumers use: the exported API they call, the behaviours they rely on, and the file and wire formats they read or write. The cases are copied and adapted from the consumers' existing tests, with synthetic fixtures only. The suite runs in kogen-loop's own fast gate (`go test ./...`, the configured `go-test` check), so an interface change fails in kogen-loop first. An intended interface change then edits this contract together with paired consumer items.

What is added:
- `contract/`: a Go test package of the `kogen-loop` module (package `contract` or `contract_test`; subpackages under `contract/` are allowed), made of `_test.go` files with optional non-test helper `.go` files, optional synthetic fixtures under `contract/testdata/`, and `contract/README.md`. No file has a build constraint (`//go:build` or `// +build`), so `go test ./...` runs the suite on every platform.
- `README.md`: a Folder map row that starts with ``| `contract/` |``, and a "Start here" bullet that links to it as `[...](contract/)`. The text says what the suite is and the change rule.
- Nothing else changes. Production code under `api/`, `loop/`, `provider/`, `tools/`, `sys/`, `internal/` and `cmd/`, `go.mod`, `docs/contract/loop-v1.md`, the existing tests and `.kogen/project.yaml` stay as they are. There is no new CLI command, flag, option or setting, and no timeout is raised. The suite pins kogen-loop's current behaviour at the Build's base. The unused unexported `(*call).apiBase()` in `provider/client.go` also stays as it is.

What the suite pins:
1. The API. Every member in the inventory table of acceptance scenario "The contract suite uses and lists every kogen-loop member a consumer uses" is used by the suite's Go code. That table is the authoritative list: 226 exported members of `kogen-loop/api`, `loop`, `provider`, `sys` and `tools`, written as `<pkg>.<Name>` or `<pkg>.<Type>.<Member>` (a method or a struct field), each with the consumers that use it. It was derived mechanically with the acceptance's own go/types observer, `features/steps/k_contracts_loop_uses.go.txt`, over each consumer's Go module, tests included. The sources are these `main` commits: kogen `9bf6073f8096f5a50013fc42c482695742645ac8` (`cli/`, against its vendored `cli/third_party/kogen-loop`, plus the migration drivers under `test/migration/drivers/` that compile), kogen-coordinator `0ad33f64273515844c2980a432b1a4219b8e68bb`, kogen-executor `bcb2c76ad20c1f6004bd6f37447560f6114f5bd7`, kogen-verification `f39e7c2c62fdde97d77d23366238fa9562e65cce`, kogen-shaping `f561b3df6f00507ebc7249857f0662736a1769d0` and kogen-build `1a8a18d75c1f5ecf8aa057c49551a9a98c342d7c`. The other consumers resolve kogen-loop at `c6e2360`. Every listed member exists at this repository's HEAD. A use must be a real case, not a bare reference:
   - a function or method is called and its result asserted;
   - a field is set or read in such a call;
   - a type is constructed or received;
   - a constant's or variable's value is asserted.
   `var _ = x` stubs do not count as cases, and review rejects them.
2. The behaviours and formats consumers rely on, each asserted so that changing it fails the suite. Acceptance changes each one in a copy of the tree and requires a contract test to fail. Each change alters code that a consumer reaches through the exported entry point named here, on a path the named consumer evidence exercises; none is in dead code.
   - `sys-error-line`: `(*sys.Error).Error()` is `<class>/<reason>: <detail>`, and `Render()` adds `\n`; for example `intent/not_found: Intent does not exist\n` (kogen-coordinator `project/intent_test.go`).
   - `sys-error-lines`: `Render()` prints each of `Lines` indented by two spaces and ending in `\n`, for example `environment/x: d\n  l1\n` (kogen-coordinator `project/config_test.go`).
   - `sys-interrupt-exit`: `(*sys.Interrupted).ExitCode()` is 130 for `SIGINT`, 143 for `SIGTERM` and 129 for `SIGHUP` (kogen-shaping `shape/shape_test.go`, exit 130).
   - `sys-foreign-kill-status`: `Session.Run("pkill -f x", dir, sys.Options{RefuseForeignKill: true})` starts nothing and returns `Result{Status: 126, Output: sys.RefusalText(rule), Rule: "pkill-killall"}` with a nil error (kogen-verification `verify/probe.go`).
   - `tools-unknown-tool`: `Tools.Run` of a name that is not enabled returns the text `error: unknown tool <name>` (kogen-executor `agent/tools_test.go`).
   - `tools-read-numbered`: `read_file` through `Tools.Run` numbers lines as `<n>\t<line>`, so `x\n` reads as `1\tx` (kogen-executor `agent/tools_test.go`).
   - `tools-cut-bound` and `tools-cut-head`: a 30000-byte shell output, cut by `Output.Cut()` or `tools.Cut`, is exactly 16384 bytes. Its marker `\n[... ` begins between byte 4090 and byte 4096, and it contains `bytes omitted ...]` (kogen `cli/research_removal_test.go`).
   - `tools-invalid-arguments`: `tools.DecodeArguments` of arguments that are not a JSON object returns `map[__invalid__:true]` (kogen-shaping `shape/init_test.go`).
   - `tools-output-item`: `tools.OutputItem(id, text)` is `{"type":"function_call_output","call_id":id,"output":text}` (kogen-build production code; kogen's migration drivers).
   - `provider-cache-key`: `Client.Body` of a `chatgpt` request with a `CacheID` of at most 64 characters carries that id as `prompt_cache_key` and has no `prompt_cache_options` (kogen-build `build/cache_id_test.go`).
   - `provider-cache-id-format`: `provider.NewCacheID()` matches `^conversation-[0-9a-f]{16}$`, and `provider.MaxCacheID` is 64 (kogen-build `build/context_external_test.go` and `build/cache_id_test.go`).
   - `provider-usage-line`: `provider.Usage{Input: 100, Cached: 0, Output: 20, Reasoning: 5}.Line()` is `input=100 cached=0 output=20 reasoning=5` (kogen-shaping `shape/init_test.go`).
   - `provider-input-budget`: `tools.Measure` of `{"x": 524280 a's}` has `RenderedBytes` 524288, `InputBudgetBytes` 524288, `OutputReserveTokens` 131072 and `Fits` true. One byte more gives 524289 and `Fits` false (kogen `cli/research_removal_test.go`).
   - `provider-response-budget`: `provider.ResponseBudget` is 30 minutes and `provider.NewClient("").ResponseBudget` is 0 (kogen `cli/response_budget_test.go`, kogen-executor `agent/budget_test.go`).
   - `provider-url-seam`: with `KOGEN_PROVIDER_URL` (and `KOGEN_AUTH_URL`) set to a loopback `httptest` server in the `sys.Session` environment, `Client.Respond` for `chatgpt` posts to `<url>/v1/responses` (the path built in `provider/respond.go` as `k.origin()+"/v1/responses"`; the fake providers of kogen-build `build/helper_test.go` refuse any other path). It accepts the SSE stream consumers' fakes write: `data: {"type":"response.output_item.done","output_index":i,"item":...}` frames, then `response.completed` with usage. It returns the items and usage (kogen-build `build/helper_test.go`, kogen-shaping `shape/helper_test.go`).
   - `provider-credentials`: a ChatGPT login is usable for such a request when written the way consumers seed it: `$HOME/.kogen/credentials/chatgpt.json`, mode 0600, in a 0700 `.kogen`, with `client_id` `oaiapp_fake`, `access_token`, `refresh_token`, a future unix `expires_at`, `scope` and `email` (kogen-build `build/helper_test.go`).
   - `provider-wait-text`: when the response budget runs out, `Respond` fails with a `*sys.Error` of class `provider`, reason `unavailable`, exit 4 and detail `<Label> response wait exceeded <budget>`, such as `ChatGPT response wait exceeded 10 minutes` for a ten-minute budget. Use the `Client.Now`/`Client.Sleep` seams so no real time passes (kogen-executor `agent/budget_test.go`).
   - `api-protocol` and `api-library`: `api.Protocol` is `kogen-loop/v1` and `api.Library` is `loop/v1` (kogen `cli/loop_pin_test.go`).
   - `loop-terminal`: `loop.Run` with hooks (as kogen-build drives it) does not execute a call named in `Round.Terminal`, or `finish` by default. It ends the round with `EndTerminal` and `Result.Terminal` set to that call, and runs the other calls of the batch (kogen-build production rounds).
   - `loop-usage-state`: `loop.UsageOf` of a response with all four counts known has state `complete`, with none known `unknown`, and otherwise `partial`. `loop.SumUsage` keeps a category nil when any usage lacks it (kogen-build production records through `loop.UsageOf`, `loop.SumUsage` and `api.Usage.State`).
   The exact changes acceptance applies are listed in that scenario. Each replaces one production text, which must occur the stated number of times. The changed tree must still pass `go build ./...` and `go vet ./...` (so every package and every existing test file still compiles), and the suite must then report a failing test. A build failure of the suite does not count.

How the cases are derived. Copy and adapt the consumers' cases that exercise these members and behaviours. The consumer test files that import kogen-loop directly are:
- kogen `cli/`: `buildprogram/review_delivery_test.go`, `compatible_login_test.go`, `executor_wiring_test.go`, `loop_pin_test.go`, `readiness/readiness_test.go`, `research_removal_test.go`, `response_budget_test.go`.
- kogen-coordinator: `git/commit_test.go`, `git/helper_test.go`, `git/lock_test.go`, `project/config_test.go`, `project/golden_test.go`, `project/intent_test.go`, `project/provenance_test.go`.
- kogen-executor: `agent/budget_test.go`, `agent/defs_test.go`, `agent/git_test.go`, `agent/tools_test.go`, `executor/claudecode/adapter_test.go`.
- kogen-verification: `contract/contract_test.go`, and in `verify/`: `attempt`, `evidence`, `feasibility`, `helper_project`, `helper`, `hung`, `interrupt`, `probe_deadline`, `probe_mise`, `readiness`, `sweep`, `tools`, `verify` (each `_test.go`).
- kogen-shaping `shape/`: `approve`, `batch`, `contract_check`, `datastores`, `evidence`, `exec_state`, `force`, `helper`, `init`, `k18b`, `lineup_shape`, `lineup`, `loop_knobs`, `preflight`, `refine`, `response_budget`, `shape`, `window` (each `_test.go`).
- kogen-build `build/`: `baseline_cache`, `build`, `cache_id`, `context`, `executor_native`, `executor`, `helper`, `hooks`, `k_review_verdict_strand`, `k_reviewretry2`, `k_reviewretry_safety`, `lineup`, `loop_ownership`, `material`, `records`, `recover`, `response_budget`, `review_batch`, `review_budget`, `review_delivery`, `review_lineup`, `review_parts_source`, `review_prefill`, `review_resume_external`, `unit` (each `_test.go`).

The sources are readable on this host as `git --git-dir=/Users/kogen-runner/work.noindex/mirrors/<consumer>.git show <commit>:<path>`. A member used only by consumer production code is pinned with a case adapted from the consumer code that uses it.

The fixtures are synthetic only:
- loopback `httptest` servers;
- `t.TempDir()` roots, Git repositories and `HOME` directories;
- fake tokens and `example.invalid` addresses;
- explicit `sys.NewWith` environments with their own Git identity and `GIT_CONFIG_GLOBAL=/dev/null`, as the consumers' `hermeticEnv` sets.

The suite must not:
- run a model, contact a non-loopback host, or rely on the caller's `HOME`, credentials or `KOGEN_*` variables;
- read kogen-loop's own source files (no string beginning with `..`, and no `go/*` packages);
- import a consumer module.

Where commands run under the supervisor (`sys.EnableSupervisor`), a `TestMain` calls `sys.MaybeSupervise(os.Args[1:])` first, as `sys/sys_test.go` does. If an adapted consumer case disagrees with current behaviour, the case pins the current behaviour, and `contract/README.md` names the difference under a heading `## Differences from consumer expectations`.

The suite must be fast:
- Acceptance requires each contract package's test time to be at most 30 seconds; aim for a few seconds.
- No test waits on real 45-second shell yields, 5-second termination waits, provider backoff or retry sleeps.
- It uses the seams consumers use, such as `Client.Now`, `Client.Sleep` and short commands.
- It has no `t.Skip`.
- It passes with `-count=1`, with `-trimpath`, and when several copies of the tree run it at once, so it uses no fixed ports or shared paths.

`contract/README.md` states what the suite pins and the source commits above. It contains this sentence verbatim: `An intended interface change edits this contract together with paired consumer items.` It holds one Markdown table whose header and separator lines are exactly:

```
| Interface | Consumers | Derived from | Contract tests |
| --- | --- | --- | --- |
```

The table has one row per inventory member: no missing, extra or duplicate rows, and no other lines inside the table. The cells are separated by ` | `, and each row looks like ``| `sys.AsError` | kogen, kogen-coordinator, kogen-executor, kogen-verification, kogen-shaping, kogen-build | `kogen-coordinator/project/intent_test.go` | `TestErrorRendering` |``.
- Interface: the member in backticks, exactly as in the inventory.
- Consumers: exactly the inventory's consumers for it, separated by `, `, in the order kogen, kogen-coordinator, kogen-executor, kogen-verification, kogen-shaping, kogen-build.
- Derived from: one or more backticked paths, separated by `, `. Each path is `<consumer>/<path in that repository>.go`, its consumer is one of the row's consumers, and it names the consumer test the case was adapted from, or the consumer source that uses the member when no consumer test exercises it. A kogen path includes `cli/` or `test/`.
- Contract tests: one or more backticked top-level test names, separated by `, `, each a test that `go test -list . ./contract/...` reports.

Out of scope: Kogen delivery's landing procedure, which today runs the consumer suites, lives outside this repository; this change does not alter it. No consumer repository, Kogen's vendored copy or its pin changes. No CHANGELOG.md entry is added (the commit message records the change).

## Decisions
- The contract suite lives in kogen-loop as `contract/` and joins the ordinary `go test ./...` check (source: request)
- It pins the exported API consumers call, the behaviours they rely on and the file and wire formats they read or write, with cases copied and adapted from the consumers' existing tests (source: request)
- Synthetic fixtures only: no model runs, no network, no consumer repositories at test time, no new CLI commands or flags, no timeout raised, and the suite stays fast (source: request)
- An intended interface change edits this contract together with paired consumer items, as `contract/README.md` states (source: request)
- Every behaviour change in acceptance alters code a consumer reaches through kogen-loop's exported API and leaves every package and test file compiling, as the request's earlier-attempts section requires (source: request)

## Source comparison
- Addressed: "pins exactly what its consumers use: the exported API they call". The inventory is mechanical: the go/types observer over each consumer module at the commits above found 226 members. Acceptance "uses and lists every kogen-loop member" requires the suite's Go code to use each one and `contract/README.md` to list each one with its exact consumers, source and passing contract test names. So removing, renaming or re-signing a consumed member breaks the suite's build.
- Addressed: "the behaviours they rely on, and the file and wire formats they read or write". Twenty-two consumer-relied behaviours and formats are pinned, each traced to the consumer case above: error rendering, interrupt exit codes, foreign-kill refusal, tool texts, cut bounds, argument decoding, the `function_call_output` item, `prompt_cache_key` placement, the cache id format, the usage line, input and response budgets, the provider URL seam with consumers' SSE frames, the credentials file consumers seed, the budget-expiry text, the protocol and library ids, terminal handling and usage state. Acceptance "A change to a behaviour a consumer relies on fails the contract suite first" changes each in a copy of the tree. It requires a failing contract test, and the unchanged copy must pass.
- Addressed: "Derive the cases from the consumers' existing tests ... copy and adapt ... synthetic fixtures only". Each README row names its consumer source. Acceptance checks the form of that source (a consumer path of one of the row's consumers), not that it is truthful; review checks that the cases really come from those sources.
- Addressed: "The suite runs as part of kogen-loop's own fast gate". Acceptance "passes offline and fast" runs `go test -json -count=1 ./contract/...` in a copy with an empty `HOME`, the Go proxy off, `KOGEN_*` variables removed and HTTP(S) proxies pointed at a closed port. It requires a pass, no skip, at least one test, every package within 30 seconds, no build constraint, and every package listed by `go list ./...`.
- Addressed: "An intended interface change then edits this contract together with paired consumer items". The exact sentence is in `contract/README.md`, and the README points at `contract/` (acceptance "The README points at the contract").
- Addressed, constraints: no consumer repositories at test time (acceptance "depends on nothing but kogen-loop and the standard library": `go.mod` stays `module kogen-loop\n\ngo 1.27.2\n`, no `go.sum`, only standard-library and the five kogen-loop package imports, no string beginning with `..`). No model runs or network, through the offline run. No production code changes, no new CLI command or flag, and no timeout raised.
- Superseded, earlier attempt (Build dea2940a, build_blocked): its `provider-url-seam` change edited `return v + "/v1"` inside the unexported, uncalled `(*call).apiBase()` in `provider/client.go`, which no contract test can observe. This Intent changes instead the `k.origin()+"/v1/responses"` path in `provider/respond.go` that `Client.Respond` posts to and consumers' fake providers check. All other 21 changes are unchanged; each is on a path reached through an exported entry point.
- Addressed, earlier attempts: "must leave every package compiling" (the K-CONTRACTS-COORDINATOR block). The acceptance driver now runs `go vet ./...` after `go build ./...` on every changed tree, so a change that breaks any package or existing test file reports `change does not vet`, not a contract failure; all 22 changes pass both.
- Interpretation, decided here: "what its consumers use" is what consumer Go code (production and tests) references at the commits above. kogen's acceptance-step drivers (`features/steps/*_driver.go`) and kogen-shaping's step drivers were checked and add no further package-level member. Two kogen migration drivers (`all_provider_cache`, `claude-api-key`) no longer compile against kogen's vendored copy (unknown field `Budget` in `provider.Request`), so they are not counted; their one other member, `tools.ReplayItem`, is in the inventory through `shape_working_summary`.
- Lesson from K-CONTRACTS-COORDINATOR: its review blocked a contract that pinned only part of the consumed interface. Here the inventory is complete and checked mechanically.
- Omitted, separate: removing consumer-suite runs from Kogen delivery's landing procedure, and the paired consumer items of future interface changes.

## Tests
- Every kogen-loop member a consumer uses is exercised by a contract case and listed in `contract/README.md` with its consumers, its consumer source and its contract tests: new tests in `contract/`; acceptance scenario "uses and lists every kogen-loop member" (integration)
- Each of the 22 consumer-relied behaviours and formats is asserted, so that changing it (in a tree that still builds and vets) fails the suite while the unchanged tree passes: new tests in `contract/`; acceptance scenario "A change to a behaviour a consumer relies on fails the contract suite first" (integration)
- The suite passes offline, without skips, within 30 seconds per package, and is part of `go test ./...`: acceptance scenario "passes offline and fast" (integration)
- The suite depends on nothing but the standard library and kogen-loop's five packages, and `go.mod` is unchanged: acceptance scenario "depends on nothing but kogen-loop and the standard library" (integration)
- The README points at `contract/` and `contract/README.md` states the change rule: acceptance scenario "The README points at the contract" (scenario)
- Existing behaviour and tests stay unchanged; no production code changes: the existing `go test ./...`, `go vet ./...` and `go build` checks pass unchanged (existing)

## Feasibility
- Repository inspection. No external protocol, provider or library fact is involved, so no documentation lookup was needed. The consumer Go modules resolve from the local module cache with `GOPROXY=off`; their sources are the local mirrors named above.
- Scratch observation in this Shape session, outside the checkout (not a Kogen probe): the go/types observer `k_contracts_loop_uses.go.txt` ran over kogen-verification, kogen-shaping and kogen-build at both the earlier inventory commits (`d746efe`, `37d5474`, `44063cb`) and their current mains (`f39e7c2`, `f561b3d`, `1a8a18d`). All type-checked (exit 0), and the member sets are identical, matching the 226-member inventory for those consumers exactly. kogen, kogen-coordinator and kogen-executor mains are unchanged since the inventory. kogen-verification's only new importing test file is `contract/contract_test.go`.
- Scratch observation on a `git archive` of HEAD `e3ebb8f` (production code identical to the earlier attempt's base) with the earlier Build's candidate `contract/` suite added (67 tests, pass in 3.4 s). Each of the 22 changes occurs the stated number of times; every changed tree passes `go build -trimpath ./...` and `go vet ./...`; and the candidate suite then reports failing tests for every one, for example `provider-url-seam` (now in `provider/respond.go`) fails `TestProviderRespondURLSeam`, `loop-terminal` fails `TestLoopRunTerminalWithHooks`, `provider-credentials` fails `TestProviderRespondCredentialsFile`. So every change is reachable through the exported API and observable by a correct suite. kogen-build `build/helper_test.go` refuses any path but `/v1/responses`, `/v1/messages` and the chat path, and sets `KOGEN_PROVIDER_URL` and `KOGEN_AUTH_URL` to its loopback server.
- Observer controls run on scratch copies with the final driver bytes: `--control good` printed `contract suite observer accepted` (exit 0) and `--control bad` printed `contract suite observer rejected` (exit 1). The new bad case breaks `sys/sys_test.go` only: `go build ./...` exits 0 and the `./tools` cut test passes, while `go vet ./...` exits 1 with `undefined: undefinedContractControl`, so the driver reports `change does not vet` instead of accepting it.
- evidence: {"id":"contract-suite-observer","kind":"observer","inputs":["features/steps/k_contracts_loop.js","features/steps/k_contracts_loop_uses.go.txt","tools/tools.go","tools/cut_test.go","sys/sys_test.go","cmd/kogen-loop/main.go"],"observers":["features/steps/k_contracts_loop.js","features/steps/k_contracts_loop_uses.go.txt"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/k_contracts_loop.js --control good","exit":0,"output":"contract suite observer accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/k_contracts_loop.js --control bad","exit":1,"output":"contract suite observer rejected\n"}]}

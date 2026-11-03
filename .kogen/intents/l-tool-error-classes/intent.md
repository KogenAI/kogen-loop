# Name tool error kinds and malformed call classes

Slug: l-tool-error-classes
Model: not applicable — each category is a pure function of one executed call (its name, its decoded arguments, the session's enabled tools) and of how its tool failed; nothing is stored or carried between calls, rounds or sessions
Acceptance:
- .kogen/intents/l-tool-error-classes/acceptance.feature
- features/steps/l_tool_error_classes.js

L-TOOL-ERROR-CLASSES (filed by kogen-delivery for kogen-research-owner, climb-loop-2, 3 Nov 2026; change_type: feature, observability, not model-facing). Today a standalone `loop.Session`, and so `kogen-loop run`, records a tool error or a malformed tool call in its v1 JSONL event log only as hashes (`tool.call` `arguments_sha256`, `tool.result` `result_sha256`), so research cannot count or classify them per cell. After this change every `tool.result` event of a tool error carries `"error_kind"` and every `tool.result` event of a malformed call carries `"malformed_class"`. Each is one string from the fixed vocabulary below, never the error text and never the call's arguments, so counts per cell and per class can be read from the event log alone. Nothing the model sees changes.

Which results are classified:
- Only executed calls have a `tool.result`, as today. Terminal calls (default `finish`) are not executed, have no `tool.result` and are not classified.
- A result is an error exactly when its delivered text starts with `error: ` or `refused: `. That is the existing `tools.Tools` rule for a refused or failed call. Such a result carries exactly one of the two fields. Every other result carries neither field. Typed `view_image` parts are not errors. Neither is the `exit status: N` text of a finished shell command, for any N, nor the JSON envelope of a running or retrieved shell command. `(no matches)` and `(no files)` are not errors. No `documentation` result is an error, including `"status":"unsupported"`, because the contract already says that tool never reports an error.
- The two fields are added beside the existing `tool.result` fields (`call_id`, `name`, `result_sha256`, `bytes`, `cut`, and `rule` only for a refused shell call). Those fields keep their values; a foreign-kill refusal keeps its `rule` beside `error_kind`. `tool.call` events are unchanged: `call_id`, `name`, `arguments_sha256` and nothing else.

`malformed_class`: the call itself is wrong. It is decided from the call's name, the session's enabled tools and the arguments as `tools.Call.Args` decodes them. Each class is listed with today's model text for it.
- `unknown_tool`: the name is not one of the session's enabled tools. That covers an unknown name such as `delete_file` and a known tool that is not enabled, such as `documentation`. Text: `error: unknown tool <name>`.
- `missing_argument`: a required argument is absent.
  - `path` of `read_file`; `path` or `content` of `write_file`; `pattern` of `search_text`. Text: `error: argument <key> must be a string`, where the decoded arguments have no such key.
  - `path` of `view_image`. Text: `error: (no selected path): unreadable/nonregular artifact or invalid PNG: path must be a string. ...`.
  - A `shell` call with neither a non-blank string `command` nor a non-blank string `handle`, for example `{}` or `{"command":"  "}`. Text: `error: supply exactly one of command or handle`.
- `wrong_argument_type`: that argument is present but is not a string, including JSON `null`.
  - Text `error: argument <key> must be a string` where the key exists.
  - A `view_image` call whose `path` is not a string.
  - A `shell` call whose `command` is not a string and that has no non-blank `handle`. Text: `error: argument command must be a string`.
- `conflicting_arguments`: a `shell` call with both a non-blank string `command` and a non-blank string `handle`. Text: `error: supply exactly one of command or handle`.
- Where a tool checks several arguments, the class follows the one today's text names. For example, `write_file` checks `path` before `content`.

`error_kind`: the call is well formed and its tool failed.
- `not_found`: `read_file` of a path that does not exist (`error: <path> does not exist`). The kind must not depend on the path's text: a missing path named `gone is a folder; use list_files` is still `not_found`.
- `is_folder`: `read_file` of a folder (`error: <path> is a folder; use list_files`).
- `outside_root`: root containment refused the path of `read_file`, `view_image`, `list_files` or `search_text`. That covers `~`, an absolute path outside the root, a `..` escape, a symlink leaving the root and a top-anchored Git pathspec.
- `file_error`: any other file-system failure (`error: <path>: <reason>`, for example `error: blocker/x.txt: enotdir`). It applies to `read_file`, to `write_file`, and to resolving the path of `list_files` or `search_text`.
- `protected`: `write_file` refused a protected path (`refused: <path> is part of the approved acceptance baseline`).
- `git_failed`: the Git command of `list_files` or `search_text` failed or could not start (`error: ` followed by Git's output). Examples are a root that is not a Git repository and an invalid search pattern.
- `unknown_shell_handle`: a `shell` retrieval with an unknown or expired handle (`error: unknown shell handle`).
- `foreign_kill`: the foreign-kill filter refused a `shell` command. The text is `sys.RefusalText(rule)`, and `rule` stays in the event.
- `invalid_image`: `view_image` with a string path inside the root that is missing, not a regular file, outside the byte limits or not a supported PNG.

`probe` is not a Session tool, because `tools.Definition` has none, so it gets no category and its behavior is unchanged.

Interfaces:
- `api/api.go` exports the names as string constants beside the existing error classes, as the contract asks of v1 vocabulary:
  - kinds: `ToolErrorNotFound`, `ToolErrorIsFolder`, `ToolErrorOutsideRoot`, `ToolErrorFile`, `ToolErrorProtected`, `ToolErrorGit`, `ToolErrorUnknownShellHandle`, `ToolErrorForeignKill`, `ToolErrorInvalidImage`;
  - classes: `MalformedUnknownTool`, `MalformedMissingArgument`, `MalformedWrongArgumentType`, `MalformedConflictingArguments`.
- How the Session learns the category is the Build's choice. For example, `tools.Output` could carry it beside `Rule`, or the tools package could export a classifier. Whatever the mechanism, the category must come from the call and the tool's own failure path, never from matching text the model controls, such as the path. It must not change any `Output.Text` or `Output.Parts`.
- `docs/contract/loop-v1.md` updates the `tool.result` row of the events table and adds a short subsection that lists both vocabularies with their conditions. The contract's rule for an additive v1 change asks for a contract note and a conformance fixture.

Unchanged and out of scope:
- Everything the model receives: tool output texts, typed outputs, tool definitions, instructions, request bodies and the transcript.
- Capabilities and `capabilities_digest`, CLI commands and flags, task fields, `SessionConfig`, timeouts, `request.attempt` records and the other event types.
- `loop.Run` and its hooks, which emit no events.
- Calls whose arguments are not a JSON object. Every provider adapter already refuses such a response as invalid before any tool runs; Responses records it in the attempt record's `provider_failure.validation` with `arguments_object`. That stays as it is.
- Kogen's own run logs, its vendored copy and its pin, and CHANGELOG.md, since commit history records changes.

## Decisions
- Each tool error and each malformed tool call is recorded in the event log with a stable category (its kind or class), never its text or arguments, so counts per cell and per class can be read from the log alone (source: request)
- Nothing the model sees changes; the change is observability only (source: request)
- No new CLI commands or flags; no timeout raised; synthetic tests only (source: request)

## Source comparison
- Addressed: "each tool error ... recorded ... with a stable category (its kind)". `tool.result` gains `error_kind` from a fixed set of nine kinds, each with its trigger. Acceptance `errors` and `not-git` cover all nine. Two wrong implementations fail: one that matches path text (`not-found-folder-text`) and one that drops `rule` (`kill`).
- Addressed: "each malformed tool call ... (its class)". `tool.result` gains `malformed_class` from a fixed set of four classes. Acceptance `malformed` covers every class for every Session tool that has a required argument: missing, wrong type (null included), blank shell command, both command and handle, an unknown name and a disabled known tool.
- Addressed: "never its text or arguments". Values come only from the fixed vocabulary. In every scenario the argument sentinel `SENTINEL-1c9e` and every full tool error text must be absent from stdout (`logged: []`).
- Addressed: "counts per cell and per class can be read from the log alone". Each classified result carries exactly one field on its own `tool.result` line, and every other result carries neither. Acceptance compares every result's added fields exactly, successes and failed shell exits included.
- Addressed: "Nothing the model sees changes". Acceptance compares, byte for byte, every `function_call_output` text that the second request carries to the model with today's text, recorded from the unchanged CLI. `tool.call` events must keep exactly their existing fields.
- Addressed, constraints: there is no CLI command, flag, task field or option and no timeout change. Tests use a local scripted provider and fake credentials only.
- Interpretation, decided here: "malformed tool call" means an executed call whose name or arguments the tool rejects. Non-object arguments never reach the tools, because the provider adapters refuse the whole response (stream.go `validItem`, chat.go `validCall`). Those stay classified in the attempt record as they are today.
- Interpretation, decided here: a shell command that ran and exited nonzero is a command result, not a tool error, so `exit status: 3` carries no field.
- Evidence: the research notes (`~/Scratch.noindex/kogen-lanes-private/notes-harness/climb/loop/LANE.md:46-60`, 107 retained Terra shape/build/review logs) were not present on this machine. They are motivation, not thresholds.
- Omitted, separate: K-TOOL-ARGS-LOG (kogen-executor, redacted tool-call arguments in Kogen run logs). Also omitted: Kogen's own hook-written logs and Kogen's vendored copy and pin.

## Tests
- A tool error's `tool.result` carries `error_kind` for each of the nine kinds, keeps `rule` on a foreign-kill refusal, and gets a kind that does not depend on the path's text: acceptance `errors` and `not-git` through the built CLI, plus a new conformance test that runs a `loop.Session` with the existing fake provider (as in `conformance/foreign_kill_event_test.go`) and checks `error_kind` for each kind; that test is the conformance fixture the contract requires for an additive event field (integration)
- A malformed call's `tool.result` carries `malformed_class` (`unknown_tool` for unknown and disabled names, `missing_argument`, `wrong_argument_type`, `conflicting_arguments`): acceptance `malformed`, plus the same cases in that conformance test (integration)
- Results that are not errors carry neither field (a successful read, list and search, `(no matches)`, and shell commands that exited 3 or 0), `tool.call` events keep exactly `call_id`, `name` and `arguments_sha256`, and no argument or error text reaches the log: all three acceptance scenarios, plus a check in the conformance test that a successful call's `tool.result` has neither field (integration)
- Nothing the model sees changes, so every delivered tool output text equals today's text: all three acceptance scenarios (scenario)
- Existing tool texts, hashes, `cut`, `rule`, other events, provider validation and `loop.Run` keep their behavior: the existing `go test ./...` suites keep passing unchanged, as they did on a scratch reference implementation (existing)

## Feasibility
- Repository inspection: `tool.call` and `tool.result` events come only from `loop/session.go` `Session.Round`, through its `BeforeCall`, `HandleCall` and `AfterCall` hooks. `HandleCall` already sees each raw `tools.Output` and forwards its `Rule`. The model-facing texts come from `tools/tools.go`, `tools/contain.go`, `tools/image.go` and `sys/foreign_kill.go`. `loop.Run` emits no events. No external protocol, provider or library fact is involved, so no documentation lookup was needed.
- Scratch probe against unchanged HEAD cec9745: a built CLI with a local scripted Responses provider, Go 1.27.2, git 2.54.0 and Node 24.21.0. Today every `tool.result` carries no category; the one extra field is `rule` on the refused `pkill`. `tool.call` events carry only `call_id`, `name` and `arguments_sha256`. Neither the argument sentinel nor any error text reaches stdout. The exact output texts in the feature were recorded from this run. With `GIT_CEILING_DIRECTORIES`, a non-Git root gives `error: fatal: not a git repository (or any of the parent directories): .git` for both `list_files` and `search_text`.
- Scratch control outside the checkout. A `git archive` of HEAD plus a reference classifier in `Session.Round` passed the submitted acceptance 3/3, and `go test ./loop ./conformance ./tools ./api ./cmd/... -count=1` passed on it. Unchanged HEAD failed all 3 scenarios, each at the missing `error_kind` or `malformed_class` fields.
- evidence: {"id":"tool-error-classes-observer","kind":"observer","inputs":["features/steps/l_tool_error_classes.js"],"observers":["features/steps/l_tool_error_classes.js"],"checks":[{"name":"good","command":"\"$KOGEN_NODE\" features/steps/l_tool_error_classes.js --control good","exit":0,"output":"tool error classes observer accepted\n"},{"name":"bad","command":"\"$KOGEN_NODE\" features/steps/l_tool_error_classes.js --control bad","exit":1,"output":"tool error classes observer rejected\n"}]}

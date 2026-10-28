# Add an option to omit view_image

Slug: l-image
Model: not applicable — a static boolean filters one definition and dispatch; there is no meaningful state transition
Acceptance:
- .kogen/intents/l-image/acceptance.feature
- features/steps/l_image.js

Add the library-only boolean `tools.Tools.OmitViewImage`, false by default. When true, the instance's `Definition(tools.ViewImageTool)` returns `(nil, false)` and execution refuses view_image with the ordinary unknown-tool output, even if Enabled contains it. Callers assemble definitions by retaining only successful instance Definition results and use that same instance for execution. Do not change package-level Definition/Defs or make the engine filter caller-supplied definitions. Document this option and assembly pattern in docs/contract/loop-v1.md. No CLI, task field, environment setting or capability change. No external services, release, install, vendoring or pin update.

## Decisions
- Omission is opt-in and off preserves byte-identical definitions. (source: request)
- No CLI option is added. (source: request)
- Use OmitViewImage bool on Tools and the existing instance Definition presence result; all other definitions and tool execution remain unchanged. (source: request)
- Tool-list bytes are the research metric, not a claimed token saving or required percentage reduction. The request is the low-priority L-IMAGE research seed dated 28 Oct 2026. (source: request)
- Shared-host operations use temporary directories only for scratch work, never synthetic CPU load, never process-name/pattern termination and only terminate pids started by the operation. (source: request)

## Source comparison
- Addressed: request What to build and Acceptance map to OmitViewImage, Definition absence and unknown-tool execution above and the omission/refusal acceptance cases. Existing tools/defs.go instance Definition currently always exposes view_image; this opt-in replaces only that behavior.
- Addressed: request Must stay maps to the default-byte and package-default cases, unchanged existing golden files and the explicit no-CLI boundary. Existing docs/contract/loop-v1.md configuration-aware Definition assembly remains the integration pattern.
- Addressed: request docs/contract maps to the maintained loop-v1.md option documentation; configured checks in .kogen/project.yaml remain mandatory unchanged.
- Addressed: request Why, Metric and Host safety are retained in Decisions and boundaries; no paid-provider or CPU benchmark is needed for a deterministic list-byte reduction.
- Omitted: no requested behavior. Superseded: none. Conflicting: none. tools.Tools.Enabled currently refuses disabled names but is not sufficient: omission must win even when view_image is enabled.

## Tests
- True omits only view_image from instance definitions: add TestLImageDefinitions using public Definition, retaining successful results in original order and comparing remaining definitions to the off instance including compact descriptions (unit)
- True refuses view_image even when enabled: add TestLImageRefusal through Run, RunContext, Call and CallContext expecting Output{Text: "error: unknown tool view_image"} and nil Go error; absent path arguments must not reach image validation (unit)
- False preserves definitions byte for byte and image dispatch: add TestLImageDefaults comparing json.Marshal output for every generic definition to the corresponding tools/testdata/defs_golden.json entry for zero/default and explicit false instances; view_image still gives ordinary argument validation rather than unknown-tool feedback (unit)
- Package definitions remain unchanged: add TestLImagePackageDefaults comparing package Definition/Defs against off instance definitions and asserting they still expose view_image after using an omit-enabled instance (unit)
- Contract documents opt-in, default, refusal and same-instance assembly without CLI behavior: review docs/contract/loop-v1.md and run unchanged configured checks (existing)

Implement the four named Go tests in unprotected tools/l_image_test.go using public interfaces; acceptance runs each by exact name and requires actual run/pass events, not merely successful empty selection. Keep existing golden files unchanged. JSON serialization of parsed golden entries defines byte comparisons (the golden file itself is an object containing multiple tool definitions, not a serialized list). Run affected tests during implementation and all configured checks before completion. Record off/on serialized tool-list byte counts in test output; no threshold beyond omission is required.

## Feasibility
- none

# Name earlier failed attempts in unavailable errors

Slug: kogen-loop-unavailable-names-earlier-attempts
Model: not applicable — the change adds one detail line to a stateless error built at the end of a bounded retry loop
Acceptance:
- .kogen/intents/kogen-loop-unavailable-names-earlier-attempts/acceptance.feature
- features/steps/kogen-loop-unavailable-names-earlier-attempts__earlier.js

When a ChatGPT provider call ends as `provider/unavailable` after retrying, the `*sys.Error` now also names the failures of the earlier attempts whenever they differ from the one it reports. `(*run).attempts` in provider/respond.go remembers the `res.detail` of each failed transport attempt, in order. The call ends as `unavailable` at two sites: the third failed transport attempt (`<label> did not answer after 3 attempts: <detail>`) and an advertised Retry-After above 60 s (`<label> asked to wait <secs> s before retrying, more than the 60 s limit: <detail>`). At either site, when at least one earlier attempt's detail differs from the detail of the attempt that ended the call, the error gets one extra detail line in `Lines`:

`earlier attempts: ` followed by each earlier attempt as its number, a space and its detail, joined with a semicolon and a space, in attempt order (for example `earlier attempts: 1 HTTP 429 rate limited; 2 HTTP 503 overloaded`). The attempt that ended the call is not repeated in the line.

When there is no earlier attempt, or every earlier attempt has exactly the detail of the ending attempt, no line is added, so three identical failures give the same error lines as today.

Unchanged: the error's class, reason, detail text, exit code, provider diagnostics (the `provider failure:` line keeps its text and stays before the new line), the retry schedule (2 s then 8 s, or the advertised Retry-After up to 60 s), the attempt count and the attempt records. No flag, setting or environment variable. Single-attempt mode (`single`) and the key providers' non-retrying path are untouched. Nothing in kogen, kogen-verification or kogen-setup changes.

## Decisions
- The extra line is appended after the existing detail lines, so the `provider failure:` line keeps its position and text; it is added to the `*sys.Error` returned by `withDiagnostics` through a small helper used at both unavailable sites. (decision: D1, round 1) (constraint: only this line is added; existing lines keep text and relative order) (evidence: provider/respond.go; provider/errors.go) (source: request)
- Attempt numbers are the transport-attempt numbers of the retry loop (the first failed transient attempt is 1); the compared detail is `res.detail`, not the prefixed sentence. (decision: D2, round 1) (evidence: provider/respond.go) (source: request)
- The Build adds the focused Go tests of the Tests section in provider/earlier_attempts_test.go. The acceptance steps additionally observe the same behavior through a probe test of their own, written into a scratch copy of the checkout, built from the same existing fakes and fake clock (no real waiting, no network), because a named test the Build must write cannot run on the unchanged tree. (decision: D3, round 1) (evidence: provider/retryafter_test.go; provider/helpers_test.go; provider/wait_test.go) (assumption: the caller accepts acceptance and controls observing the behavior through a probe test of the step's own instead of running TestEarlierAttempts tests) (source: request)

## Source comparison
- Addressed: request Expected 1 (remember each failed attempt's detail in order) and 2 (one `earlier attempts: ` line at both unavailable sites, ending attempt not repeated) are exercised by scenarios 1 and 3 of acceptance.feature.
- Addressed: Expected 3 (identical failures or no earlier attempt add nothing) is scenario 2.
- Addressed: Expected 4 and the constraints: the detail texts, reason, class, exit code, retry schedule (slept 2 s, 8 s) and request counts are asserted in the same scenarios; the existing tests that pin whole `Lines` of three identical failures must keep passing unchanged.
- Wrong implementations rejected by controls: adding no line, naming only attempt 2, adding the line whenever any earlier attempt exists, and adding it only at the third-attempt site.
- Build instructions for Go tests: add provider/earlier_attempts_test.go with TestEarlierAttemptsNamesBothEarlierFailures, TestEarlierAttemptsIdenticalFailuresAddNoLine and TestEarlierAttemptsAfterRetryAfterBound using the existing fakes as in provider/retryafter_test.go (the `raRoutes` fixtures, `limited`, `secs`; ChatGPT route via `chatEnv`, `jsonAnswer`, `e.respond`, `mustErr`, `e.clk.slept()`), with the scripts and expectations of the three scenarios.

## Tests
- Three different failures are all named in attempt order: TestEarlierAttemptsNamesBothEarlierFailures in provider/earlier_attempts_test.go (integration)
- Three identical failures add no earlier-attempts line and keep today's lines: TestEarlierAttemptsIdenticalFailuresAddNoLine in provider/earlier_attempts_test.go (integration)
- A Retry-After above the bound still names the earlier attempt: TestEarlierAttemptsAfterRetryAfterBound in provider/earlier_attempts_test.go (integration)
- Existing identical-failure and Retry-After tests keep passing unchanged: provider/retryafter_test.go and provider/transient_test.go (existing)

## Feasibility
- none

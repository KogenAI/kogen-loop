# Bind compatible keys to their saved origin

Slug: l-cred-origin
Model: not applicable — origin authorization is a predicate over persisted credential and request URL, with no new session lifecycle
Acceptance:
- .kogen/intents/l-cred-origin/acceptance.feature
- features/steps/l_cred_origin.js

Fix L-CRED-ORIGIN (security), from kogenSecrets KS-1, static review 29 October 2026 of Kogen cace62d. Replace globally selected openai-compatible keys with origin-bound credentials in this standalone loop only. Kogen re-pins afterwards; do not change Kogen, install globally, or modify its pin.

Persist `origin` alongside `provider` and `api_key` in ~/.kogen/credentials/openai-compatible.json. Use scheme, hostname and effective port, excluding path, query and fragment. Normalize scheme/hostname case and default ports; do not conflate subdomains, schemes or distinct ports. Use HTTPS for saved compatible keys. HTTP is permitted only with no saved compatible credential and a literal loopback IP or localhost; do not resolve arbitrary names to classify them as loopback. Refuse HTTP key login without changing prior credential bytes. HTTPS keyless compatible use remains supported.

Before inference transport, compare the actual destination origin with the saved compatible origin. Mismatch returns a clear provider error naming both origins and sends no saved key (prefer no request). A legacy compatible credential without origin fails with a message telling the user to log in again, even on loopback; it is not absence. Never include secrets in diagnostics. Matching HTTPS origins continue to work, including differing URL paths. Preserve other providers' formats, login and token behavior.

Client.Login currently has no base URL argument and loginKey does not contact a server. Add an additive library method `Client.LoginWithBaseURL(ctx, session, name, baseURL, redirect)` using the existing login flow and Input; retain Login for existing callers and other providers. Compatible Login without a URL must clearly request a URL-bearing login rather than save an unbound key. No new CLI or option. Document the library method for the downstream Kogen caller. Save the user-supplied login origin, never infer it from repository-selected inference roles or mutate it on mismatch.

Tests use only fixture homes and temporary directories, no real credentials or paid requests, no synthetic load, and no process-name/pattern termination. Stop only pids started by the tests. All configured checks remain unchanged and must pass, plus go test -race ./....

## Decisions
- Bind saved compatible credentials to their login origin (source: request)
- Refuse cross-origin and legacy unbound keys with clear errors (source: request)
- Allow plaintext only for keyless loopback with no new CLI option (source: request)
- Preserve other providers and matching-origin behavior (source: request)

## Source comparison
- Addressed: What to change and Acceptance map to persisted origin, pre-transport refusal, matching request success, legacy re-login guidance and HTTP policy above, exercised by the five executable named-test scenarios.
- Addressed: KS-1 globally reads ~/.kogen/credentials/openai-compatible.json then sends Bearer to base_url + /chat/completions. Regression must observe Client.Respond and local TLS server headers, not only storedKey. Include https://collector.attacker.invalid/v1 through a recording transport unable to reach the network; it must never receive the saved key.
- Superseded premise: request says login receives a base URL; provider/login.go:30 has no such argument. The additive library method supplies it without a new CLI or option.
- Addressed: Must stay and Host safety are explicit requirements above and below. K-CRED-ORIGIN and audit vendor paths are historical evidence, not edits to Kogen. Kogen re-pins separately.
- Omitted deliberately: audit's optional plaintext local exception; the requested scope allows only keyless loopback and adds no exception setting.

## Tests
- Persist private atomic origin-bound login: add TestLCredOriginLogin through LoginWithBaseURL and fixture credential JSON; assert origin and mode, missing URL refusal, and unchanged other-provider formats (integration)
- Refuse saved origin A at B: add TestLCredOriginMismatch through Client.Respond after TLS A login, TLS B recorder, error naming both origins and no Authorization at B; include collector.attacker.invalid/v1 and independent host, scheme and port differences (regression)
- Preserve matching-origin success: add TestLCredOriginMatch through login then Respond to local TLS Chat Completions with exact Bearer and successful answer; test differing paths and equivalent hostname case/default ports (integration)
- Refuse pre-change unbound keys: add TestLCredOriginLegacy with provider/api_key JSON, HTTPS and loopback requests, no Authorization and re-login guidance (regression)
- Restrict plaintext to keyless loopback: add TestLCredOriginPlaintext with keyless localhost, IPv4 and IPv6 loopback success, non-loopback HTTP refusal without network, saved-key HTTP refusal, and HTTP login preserving prior bytes (integration)
- Preserve unrelated behavior and checks: retain provider tests and run go test -race ./..., go test ./conformance -count=1, go vet ./..., go build -o /dev/null ./..., and configured go-format (existing)

## Feasibility
- none

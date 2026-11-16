# Accept managed access snapshots without refresh

Slug: managed-access-snapshot-without-refresh-secret
Model: not applicable — the change adds a stateless credential validation rule and offline status text; the only cross-request state is a per-Client high-water expiry guard checked by the Go driver
Acceptance:
- .kogen/intents/managed-access-snapshot-without-refresh-secret/acceptance.feature
- features/steps/managed-access-snapshot-without-refresh-secret__managed.js
- features/steps/managed-access-snapshot-without-refresh-secret__driver/managed_driver.go.txt

Add one explicit managed-access credential mode to the native ChatGPT provider of `github.com/KogenAI/kogen-loop/provider`. A managed snapshot is a local, caller-owned, read-only access credential file that carries provider/client identity and an expiry but no refresh secret. An independently authorized single refresh owner publishes fresh snapshots atomically (write a private temporary file, rename over the snapshot); the SDK worker only reads. A worker never logs in, refreshes, rotates, writes credential files, asks another provider or changes global defaults. This is separate from the experimental external Messages route and from account spend reservations, installs no refresh service, and encodes no fleet hosts, paths, subscription or registration IDs. Credentials never enter task inputs, logs, errors, status output or source. Existing interactive full OAuth profiles (with `refresh_token`, no `mode`) keep their behavior, refresh locking and rotation; an ordinary incomplete legacy profile (no `mode`, no `refresh_token`) is still refused with `saved login cannot be used`. Component delivery is not fleet repair: a later qualified assembled consumer must support the format before any worker projection is installed, and native-SIWC worker holds stay until then.

## Decisions
- The managed file is the existing `$HOME/.kogen/credentials/chatgpt.json` with JSON fields `mode` = `managed_access`, `provider` = `chatgpt`, `client_id` (nonempty, `oaiapp_` prefix like the existing ChatGPT rule), `access_token` (nonempty string) and `expires_at` (integer Unix seconds). Managed mode is selected only by `mode` being exactly `managed_access`; a file without `mode` is never reinterpreted as managed. (evidence: provider/creds.go; provider/token.go) (assumption: the field names `mode`, `managed_access` and `provider` are the product contract the owner and workers share) (source: request)
- A `mode` of any other value, a missing/foreign `provider`, a missing/empty/malformed `access_token`, `expires_at` or `client_id`, or the presence of any `refresh_token` key (even empty) or `client_secret` key is refused before any network call with a `*sys.Error` class `provider`, reason `login`, exit 4, whose detail names `managed access snapshot cannot be used` and the fault (`refresh` for refresh_token, `secret` for client_secret), never the secret value. A `mode` on a provider other than chatgpt is refused the same way. (evidence: provider/creds.go) (source: request)
- Expiry uses the existing 60-second boundary: a request is refused when `expires_at - 60 <= now` (client clock). The refusal, a provider 401 (in both `Single` and retrying modes) and a regressed snapshot each return class `provider`, reason `login`, detail containing `owner refresh required` and `managed access`; each makes zero OAuth refresh/login requests, no authentication retry or fallback, writes nothing, creates no lock file and leaves the snapshot bytes unchanged. (evidence: provider/token.go; provider/respond.go) (source: request)
- Each request re-reads the snapshot, so a newer valid snapshot published later is used by the next independently admitted request; it never resets or refunds a `RequestBudget` reservation or deadline. The refused-by-expiry request reserves no budget; a dispatched request that gets 401 keeps its reservation. (evidence: provider/respond.go; provider/budget.go) (source: request)
- Regression guard: a `provider.Client` remembers, per credentials file, the highest `expires_at` of a managed snapshot it has accepted (safe for concurrent use); a later snapshot with a lower `expires_at` is treated as regressed and refused with `owner refresh required` until a snapshot at least as new is published. Partial files cannot be observed because the owner renames atomically; a file that fails to parse is invalid. (evidence: provider/client.go) (assumption: per-Client high-water expiry is an acceptable definition of 'regressed') (source: request)
- Managed access never takes the credentials lock and never calls the token endpoint; legacy `refreshed`, locking and rotation are unchanged. (evidence: provider/token.go; provider/lock.go) (source: request)
- `provider.Status` (`kogen provider list`) prints exactly for chatgpt: `chatgpt: managed access snapshot fresh (local status only; server, account and quota not qualified)` for a valid snapshot outside the 60 s margin; `chatgpt: managed access snapshot expired or invalid; owner refresh required (local status only; server, account and quota not qualified)` for any managed-mode file that is expired, near expiry or invalid; interactive output stays `chatgpt: signed in (<email>)` and an incomplete legacy profile stays `chatgpt: saved login cannot be used; run kogen provider login chatgpt`. Status is offline and never prints tokens. `capabilities --json` is unchanged (no new field). (evidence: provider/creds.go; cmd/kogen-loop/main.go) (source: request)
- `RequireLogin` fails fast on a structurally invalid managed snapshot but does not judge expiry (that happens per request). (evidence: provider/creds.go) (source: request)
- docs/contract/loop-v1.md gains a `managed_access` section defining the file contract, freshness (60 s) and identity checks, the single refresh owner's atomic publication duty, the failure and resume path (owner publishes a newer snapshot, the next request resumes), that local status is not server/account/quota qualification, and that no worker login/refresh exists. (evidence: docs/contract/loop-v1.md) (source: request)

## Source comparison
- Addressed: explicit managed mode acceptance and refusals (scenario 1), expiry/401/resume/budget/zero-OAuth counts (2), concurrency, read-only, cancellation, expiry crossing and regression (3), offline status and secret-free output (4), documentation (5).
- Unchanged: interactive full OAuth profiles, refresh locking and rotation (existing tests), incomplete legacy refusal.
- Omitted deliberately: any refresh service, fleet host/path/ID values, real login/refresh/inference, capability JSON changes, global defaults.

## Tests
- Managed acceptance, refusals, legacy and interactive unchanged: TestManagedAccessAcceptedAndRefused (integration)
- Expiry boundary, 401 stop, resume without budget reset, expiry crossing, cancellation: TestManagedExpiryRejectionAndResume (integration)
- Shared read-only snapshot under atomic replacement, no writes, regression guard: TestManagedSharedSnapshotConcurrency (integration)
- Offline distinct status lines without secrets: TestManagedStatusIsOfflineAndLocal (integration)
- Documentation contract: scenario step reading docs/contract/loop-v1.md (scenario)
- Legacy refresh locking and rotation: existing provider tests (existing)

## Feasibility
- none

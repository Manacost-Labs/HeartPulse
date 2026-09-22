# Credential delivery and persistence

The account-credentials module owns registration/login HTTP validation, code
issuance, orchestration and targeted SQLite persistence. Composition supplies
time, hashing, delivery, the database and the existing account-insert adapter.
This preserves public profile IDs, email identities and mailing contacts.

Registration validates and prepares a code, waits for SMTP, then opens a short
transaction that rechecks uniqueness, inserts that account and upserts only its
code. Login checks the account/password before SMTP and rechecks the account
identity, blocking flag and password hash afterward before storing its code.
No transaction or mutable whole-store snapshot spans delivery. Unrelated
users, pending codes and sessions are never replaced by these operations.

Failed delivery returns the existing HTTP 503 response and persists no new
account or code. Its in-memory issuance reservation is released for retry.
Credential and legacy code flows share cooldown/window limits; replacing a
currently valid code cannot lower its failed-attempt count. Existing-session
login still returns the same public user, permissions and session cookie.

Legacy synchronous verification, profile and session operations remain outside
this increment. They retain their existing contracts; later account extraction
must preserve their identity and subscription side effects.

Behavioral verification uses the real backend entry, temporary SQLite and a
controlled local SMTP server. Background jobs and Redis are disabled, and no
production environment is inherited. Both completion orders of two parallel
registrations must preserve an unrelated user/session inserted during SMTP.
The same write during delivery proves that SMTP does not hold a transaction.

The harness loads current source through `tsx`, as the existing background-job
regression does, so a clean checkout cannot accidentally test stale build output.
Server TypeScript compilation remains a separate required gate. Login tests
also cover concurrent profile/password/blocking edits and monotonic failed-code
attempts. Failed SMTP is followed by an immediate successful retry.

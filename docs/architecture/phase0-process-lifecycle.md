# Phase 0: first process lifecycle slice

## Previous behavior and risk

The Express server had no `SIGTERM` or `SIGINT` handler. The main subscription
refresh cron was created in `server/index.ts` and had no explicit stop path.
The compiled server smoke test sent `SIGTERM`, but accepted termination by the
signal as equivalent to a graceful drain.

That behavior risks interrupting active responses during a systemd restart and
makes job ownership invisible. The first slice is deliberately limited to the
HTTP server and subscription refresh job; it does not claim that every process
resource is migrated.

## Lifecycle contract

`server/app/lifecycle/processLifecycle.ts` installs one idempotent shutdown for
both process signals. It:

1. stops accepting HTTP connections and closes idle connections;
2. quiesces registered jobs in reverse ownership order;
3. waits for active HTTP requests to drain;
4. disposes registered storage resources after the drain;
5. force-closes connections and exits unsuccessfully if the deadline expires;
6. continues cleanup after an individual resource error and returns a failing
   exit code.

The default deadline is 10 seconds and can be changed with
`SERVER_SHUTDOWN_TIMEOUT_MS`. Invalid values fall back to the default rather
than turning into an immediate timeout.

## First owned job

`server/modules/subscription/public.ts` exposes the narrow
`startSubscriptionRefreshJob` contract. The job keeps the existing 30-minute
cron expression, success/error logging and handled refresh failure behavior.
Its `stop()` method is idempotent and is registered with the process lifecycle.

The runtime inventory records the owner, trigger, lifecycle and the current
locking gap. Existing per-user request coalescing remains unchanged; a
cross-instance distributed job lock is not introduced in this behavior-neutral
slice.

## Evidence and remaining work

- Unit tests cover idempotency, cleanup order, resource errors and timeout.
- The job test preserves its schedule, logging, handled failure and stop.
- The compiled server smoke now requires exit code `0`, no terminating signal
  and the `shutdown complete` evidence after `SIGTERM`.

The upstream-health interval, startup timers, Redis/SQLite handles,
Arena-synergy cron and other in-process resources still need explicit lifecycle
ownership. They remain a documented Phase 0 gap.

Rollback is a revert of the integration commit. It restores the inline cron and
previous signal behavior without a schema, cache-key or data migration.

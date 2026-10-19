# Constructed archetype detail loading

Owns the independent core, history and analysis request lifetimes and their
section states. `public.ts` is the client contract; the legacy page composes it.
The seed is anonymous. Protected data is local to the mounted viewer; composition
must key that mount by viewer identity and entitlement. Losing access, changing
resource or receiving 401/403 hides protected data and cancels obsolete reads.
No protected responses are persisted or shared between viewers.

The catalog is anonymous for every viewer. Its hook never waits for access
checks and reuses at most two format snapshots for 30 seconds in this mount.
Search and class selection remain local. Router-owned SSR data handles return
navigation; the module adds no speculative protected prefetch.

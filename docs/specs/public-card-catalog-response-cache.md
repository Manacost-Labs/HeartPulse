# Default public card catalog response cache

The Next catalog loader owns two process-local entries: the validated anonymous
Standard and Wild default seeds. A normalized API request matching the default
shares its seed for 30 seconds after a successful read. This includes a switch
between table and gallery, whose data request is identical.

An in-flight default read is shared for at most ten seconds. The cache owns an
independent settlement deadline and passes its AbortSignal to the transport;
even a transport that ignores cancellation cannot keep every waiter pending.
A timeout cancels and evicts that read, so the next request can recover. Late
completion or failure from an expired read cannot alter a replacement entry.
The completed seed's 30-second TTL still starts after successful validation.
After expiry, the next request must read
Express again; errors and invalid projections are never cached, and expired
data never disguises an outage. Express requests retain their timeout and
anonymous headers. No viewer cookies or paid statistics enter the cache.
Filtered searches, non-default ranks/periods/sorts and later pages read Express
directly. There is no unbounded map of user queries or persistent cache file.
The cache is discarded on process/release restart. Source updates can appear
up to 30 seconds later in an already warm default seed.

`tests/next-public-card-seed.test.ts` verifies overlapping reads, reuse,
format separation, expiry, outage visibility, stalled reads, late settlement
and recovery. Existing Next pilot
checks verify guest SSR, filters, empty results and retryable failures.
Browser review compares full RSC navigation, history and pending feedback;
no page transition, prefetch, document caching or permission policy changes.

Documentation impact: this spec, `apps/public-web/README.md` and `CHANGELOG.md`.

The backend's anonymous catalog reader now skips statistics retrieval and
history recording. Entitled browser requests retain the full statistics reader
and its separate cache. The anonymous `updatedAt` describes catalog publication;
period/rank descriptors remain available. This removes an unrelated source
from the SSR critical path without extending the 30-second seed lifetime or
serving an expired seed after a failure.

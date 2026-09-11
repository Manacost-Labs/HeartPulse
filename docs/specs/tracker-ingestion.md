# IceCrow tracker ingestion

## Purpose

HearthPulse accepts profile events produced by an explicitly authorized
IceCrow desktop installation. Local tracking remains authoritative and usable
offline; this endpoint is only the durable profile-sync boundary.

## Authorization

IceCrow uses the OAuth device flow registered as public client
`manacost-tracker`. The user approves the browser-visible code. The issued
access token must include `tracker.write`; the desktop application stores its
revocable credential with Windows data protection and never embeds a shared
application secret.

`POST /api/v1/tracker/events/batch` accepts `Authorization: Bearer ...` and
requires `tracker.write`. Missing, expired, or insufficient credentials return
401 or 403. Responses are private and non-cacheable.

## Request contract

The JSON envelope contains `events`, with 1–50 items. Each event has:

- `eventId`: UUID idempotency key;
- `type`: `constructed_match`, `arena_match`, `arena_run`,
  `arena_draft_pick`, `battlegrounds_match`, or `collection_snapshot`;
- `schemaVersion`: currently exactly `1`;
- `occurredAt`: ISO 8601 timestamp;
- `payload`: a JSON object using the matching IceCrow v1 record shape.

The request is limited to 5 MiB. Ordinary payloads are limited to 512 KiB and
collection snapshots to 4 MiB. Nested depth, node count, string length, object
width, card-id length, and known arrays are independently bounded. A collection
contains at most 20,000 cards; Battlegrounds final boards at most seven minions.

## Response and idempotency

Success returns 202:

```json
{
  "accepted": ["0199b2d2-7cc7-7d75-bcea-7d28b628ef4b"],
  "rejected": [
    {
      "eventId": "0199b2d2-7cc7-7d75-bcea-7d28b628ef4c",
      "code": "EVENT_LIMIT_EXCEEDED"
    }
  ]
}
```

The `(user_id, event_id)` key is unique. Replaying a previously stored valid
event acknowledges it in `accepted` without creating another row. This lets the
desktop remove a safely persisted item from its outbox after network retries.

Invalid envelopes or event identifiers return 400. Individually identifiable
but unsupported or over-limit events appear in `rejected` so they do not retry
forever.

## Persistence and privacy

HearthPulse stores the normalized envelope fields and the bounded JSON payload
in SQLite table `tracker_profile_events`, owned by the tracker-ingestion module.
Rows are tied to the approving HearthPulse user and cascade-delete with that
user. Tokens are never written to this table or application logs.

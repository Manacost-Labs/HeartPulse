# Reader paid-entitlement bridge

Status: disabled-by-default internal contract. This endpoint is not a browser API
and does not change OIDC issuance, introspection, login, or session binding.

`POST /identity/reader-entitlements` accepts HTTP Basic authentication from the
configured static `manacost-reader-staging` confidential client. Requests with
an `Origin` header or cross-site fetch metadata are rejected. The strict JSON
body is `{ "subjects": ["..."] }`, with 1–20 unique opaque HearthPulse subjects,
a 4 KiB body limit, and no additional fields.

The exact route has a fixed endpoint-wide pre-auth ceiling of 1,200 requests per
minute and a separate authenticated-client ceiling of 120 requests per minute.
The pre-auth limiter uses one constant bucket, so arbitrary credentials cannot
grow limiter memory or consume the authenticated client's quota. Sustained
hostile traffic can exhaust that outer ceiling and temporarily hide the optional
paid badge; entitlement checks fail closed during that interval.

The response preserves input order:

```json
{"entitlements":[{"subject":"...","paid":false,"checkedAt":null,"validUntil":null}]}
```

Positive status requires a non-blocked user and cached provider evidence no
older than 30 minutes. Only a current qualifying Boosty subscription or a
connected, checked, active qualifying Patreon patron counts. Boosty's stored
`dates.nextPaymentAt`, when present, shortens that provider's validity window;
Patreon's cached DTO currently has no membership expiry field. Telegram
membership, manual grants,
stale/grace evidence, missing users, invalid provider data, and database errors
fail closed. The read never calls a provider. Responses are private/no-store,
have no CORS grant, and omit email, provider IDs, tier details, and source.

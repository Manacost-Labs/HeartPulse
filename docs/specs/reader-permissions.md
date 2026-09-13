# Reader administrator-permissions bridge

Status: disabled-by-default internal contract. This endpoint is not a browser
API and does not issue OIDC claims, extend browser identity, or change the paid
entitlement contract.

`POST /identity/reader-permissions` is registered only when both the existing
Reader browser-identity opt-in and `READER_PERMISSIONS_ENABLED=1` are set. It
accepts HTTP Basic authentication only from a configured exact static Reader
confidential client. Requests containing an `Origin`
header or `Sec-Fetch-Site: cross-site` are rejected before body parsing.

Deployment requires `BROWSER_IDENTITY_CLIENTS` to contain either the production
client `manacost-reader-production` with exact callback
`https://hs-manacost.ru/reader-auth/callback`, or the staging client
`manacost-reader-staging` with exact test callback and the explicit staging
bridge flag. The secret must contain at least 43 UTF-8 bytes; otherwise enabling
`READER_PERMISSIONS_ENABLED=1` fails closed during startup. Keep the flag unset
until the matching Reader consumer and credential are present.

The strict JSON request is `{ "subjects": ["..."] }`: exactly one field,
1–20 unique subjects, each matching `[A-Za-z0-9_-]{1,128}`, with a 4 KiB body
limit. The route keeps the same bounded 1,200 request/minute pre-auth bucket
and 120 request/minute authenticated-client bucket as the Reader entitlement
bridge. It sends private/no-store responses, no CORS grant, and generic errors.

The response preserves request order exactly:

```json
{"permissions":[{"subject":"...","canModerateComments":false}]}
```

For every request, the bridge reads `users.role` and `users.blocked_at` from
SQLite. Only an existing, unblocked user whose role is exactly `admin` gets
`canModerateComments: true`; missing users, blocked users, all other roles, and
later role demotion return false. Database failures return `503` and no result
is cached. It never accepts a role from the Reader, WordPress, a browser, or a
long-lived token.

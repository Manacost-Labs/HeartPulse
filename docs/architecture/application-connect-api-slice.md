# Application connect API boundary

## Previous behavior and risk

`ApplicationConnectPage` owned both React state and the two device-authorization
HTTP requests. It built the inspect and decision requests, decoded JSON and
translated server error codes inside the route component. This coupled UI state
to transport details and let a malformed successful authorization payload reach
the view without runtime validation.

The public route, backend endpoints and lazy login boundary were already stable:

- frontend route: `/connect`;
- inspect: `GET /api/v1/oauth/device/authorization?user_code=...`;
- decision: `POST /api/v1/oauth/device/approve`;
- the decision request uses same-origin credentials, JSON and
  `X-CSRF-Request: 1`;
- rejected, expired and unauthenticated codes keep their existing Russian user
  messages.

## Extracted contract

`src/modules/applicationConnect/api/client.ts` now owns the HTTP mapping behind
the injectable `ApplicationConnectApi` interface. The page only coordinates
route state and calls `inspect` or `decide`; it contains no direct `fetch` call.

`schema/deviceAuthorization.ts` is the browser-safe runtime boundary for a
successful inspect response. `DeviceAuthorization` is inferred from that parser
instead of being independently duplicated. The module's `public.ts` exposes the
narrow client, error, schema and type contracts while the default route export
and lazy loading remain unchanged.

## Compatibility evidence

- Client tests pin URLs, methods, credentials, cache mode, abort signal, CSRF
  header, JSON body and stable error mapping.
- Malformed successful payloads produce the existing generic inspection error
  instead of reaching presentation state.
- The page contract test fails if direct `fetch` returns to the route component.
- Existing application-auth route tests cover the unchanged backend status and
  response contracts.
- The source-debt ratchet drops the page's raw-fetch allowance from two to zero.

No endpoint, payload, redirect, SEO metadata, cache header or authentication
policy changes in this slice. Rollback is a revert of the extraction commit;
there is no data or cache migration.

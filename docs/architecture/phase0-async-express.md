# Phase 0: Express 4 async error safety

## Baseline and risk

This slice starts from commit `bb89672`, after repository-wide test discovery
was made release-blocking. HearthPulse currently uses Express `4.21.2`.
Express 4 does not automatically forward rejected promises from async route
handlers to `next(error)`, so an unwrapped rejection can leave a request
unfinished and surface as an `unhandledRejection`.

The framework behavior is documented by the official Express 4 error-handling
guide:
<https://expressjs.com/en/4x/guide/error-handling/#catching-errors>.
Express error middleware must retain its four-argument signature and be
registered after routes:
<https://expressjs.com/en/4x/guide/using-middleware.html#error-handling-middleware>.

## First migration group

The first bounded group is the protected ecosystem subscription transport:

- `GET /api/ecosystem/internal/subscription`;
- `POST /api/ecosystem/internal/subscription`.

Successful responses, authentication, user lookup, force-refresh semantics and
`Cache-Control: private, no-store` remain unchanged. Only rejected promises are
adapted into the existing Express error pipeline.

For an unexpected refresh rejection, the existing structured error middleware
owns the public response contract:

- HTTP status `500`;
- JSON `{ "error": "Внутренняя ошибка сервера", "requestId": "..." }`;
- the caller-provided valid request ID is preserved;
- the response finishes exactly once;
- the structured error log keeps the safe error code, without the private error
  message;
- no process-level `unhandledRejection` is emitted.

## Compatibility adapter

`server/shared/http/asyncHandler.ts` is the only adapter for Express 4 async
handlers. It invokes the handler immediately, forwards synchronous throws and
rejected results to `next(error)`, and does not write a response itself. Public
error formatting and logging remain the responsibility of the application
error middleware.

Future handlers must move in small groups. Each group needs a focused
characterization test for its existing success, validation, cache and error
contracts before it adopts the adapter. Existing route-local handled errors
must not be converted to generic `500` responses.

## Reproduction and rollback

The focused test is:

```bash
node --import tsx tests/ecosystem-internal-routes.test.ts
```

Before the adapter, the rejected GET request timed out after one second instead
of reaching error middleware. With the adapter, both GET and POST satisfy the
contract above.

Rollback is a single commit revert: remove the two wrappers and the shared
adapter together. No data, schema, deployment or public success-response change
is involved.

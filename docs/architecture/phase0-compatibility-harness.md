# Phase 0: compatibility harness

## Checked registration manifest

`config/http-route-manifest.json` is a generated snapshot of every authored
Express registration below `server/`. The TypeScript AST collector records:

- HTTP method and exact static path or regular expression;
- expanded paths declared by static route arrays;
- `app`, `dependencies.app` or `router` ownership;
- route-local middleware order and terminal handler identity;
- every `use` registration in source order;
- explicit guard-like middleware evidence;
- the source file and registration order within that file.

The baseline contains 205 route registrations and 107 middleware
registrations across 68 source files, with no unresolved path expression. It
is a declaration-and-mount graph, not a flattened replacement for Express'
runtime stack. In particular, a guard signal records syntax such as
`dependencies.adminGuard`; the corresponding route test remains authoritative
for the actual `401` or `403` behavior.

Run the checked command with:

```bash
npm run architecture:http-manifest
```

After an intentional, reviewed route change, regenerate the snapshot with:

```bash
npm run architecture:http-manifest:update
npm run test:http-route-manifest
```

`npm run lint:architecture` performs the check automatically. Adding a route
whose static path cannot be resolved fails generation instead of silently
writing an incomplete manifest.

## Compatibility coverage

- HTTP methods, paths and middleware order have a complete declaration
  snapshot in the HTTP route manifest and its contract test.
- Public HTML routes, redirects and canonical policy are release-blocking via
  `public-route-inventory.json`, route, Nginx, prerender and public URL tests.
- Lazy route ownership and preload behavior are release-blocking via the route
  registry and deferred-boundary tests.
- Auth, CSRF, statuses, response bodies and cache headers are covered per route
  family by focused route, auth-security, CSRF and network-boundary tests. A
  single semantic registry does not exist yet.
- SEO metadata and sitemap behavior are release-blocking for registered public
  routes through SEO registry, prerender, sitemap and server SEO route tests.
- Runtime services, schedules and durable/cache stores have ownership entries
  in `runtime-service-inventory.json`. In-process cache keys are not yet a
  complete checked inventory.
- Graceful shutdown remains open: the main process has no explicit `SIGTERM` or
  `SIGINT` lifecycle contract.
- Mixed old/new client-server compatibility remains open: focused adapters and
  route tests exist, but there is no version-pair matrix for every module.

Response payloads are intentionally not copied into the generated route
snapshot. Their executable route tests are the source of truth until shared
runtime schemas are introduced one module at a time. Copying response examples
into a second large JSON file would create drift without validating runtime
data.

## Change and rollback policy

Route moves must keep the same snapshot entry or update it in the same commit
with characterization evidence. A new endpoint needs a focused route test for
authorization, validation, status, response shape and cache policy before the
snapshot is accepted.

This slice is behavior-neutral and rolls back with one commit revert. It adds
no runtime dependency, endpoint, middleware or production configuration.

# Cover administrator SSO runbook

## Preconditions

- HearthPulse is deployed with distinct, random `COVER_SSO_SIGNING_SECRET` and
  `COVER_SSO_PROXY_KEY` values of at least 32 characters, plus
  `COVER_SSO_ORIGIN=https://cover.hs-manacost.ru`.
- The Cover Nginx virtual host has removed legacy `auth_basic` and has the
  exact callback and internal `auth_request` locations from the reviewed
  configuration change. The callback location has `access_log off` (or a
  format based on `$uri`, never `$request`) so its ticket query is not written
  to Nginx logs. The proxy key is never logged or committed.
- `nginx -t` and the HearthPulse release checks pass before activation.

## Nginx boundary

The callback must be the only location that receives the hand-off ticket and
must not use the default `$request` access-log format:

```nginx
location = /_hearthpulse/callback {
    access_log off;
    auth_request off;
    proxy_pass http://127.0.0.1:3001/api/auth/cover/callback;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Cover-Sso-Key "deployment-only value";
}

location = /_hearthpulse_authorize {
    internal;
    proxy_pass http://127.0.0.1:3001/api/auth/cover/authorize;
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
    proxy_set_header Cookie $http_cookie;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Cover-Sso-Key "deployment-only value";
}

location / {
    auth_request /_hearthpulse_authorize;
    error_page 401 = @cover_hearthpulse_login;
    proxy_pass http://127.0.0.1:3127;
}

location @cover_hearthpulse_login {
    return 302 https://hearthpulse.net/api/auth/cover/start;
}
```

## Verify

1. An unsigned request to `https://cover.hs-manacost.ru/` redirects to
   HearthPulse rather than returning the legacy Basic Auth challenge.
2. A signed-in non-administrator receives a 403 from the HearthPulse hand-off
   endpoint and does not receive a `cover_admin_session` cookie.
3. A signed-in administrator returns to Cover with a `Secure`, `HttpOnly`,
   `SameSite=Lax` host-only cookie and receives the Cover application.
4. Remove that user's `admin` role in HearthPulse and refresh Cover. The next
   request must be denied. Restore the role only through the normal admin UI.
5. Check the local callback and authorization route logs for no ticket or
   cookie values. Health endpoints alone do not prove this user flow.

## Rollback

1. Restore the previous Cover Nginx virtual-host file and run `nginx -t`.
2. Reload Nginx only after the configuration test succeeds.
3. If the new HearthPulse release is implicated, use the standard immutable
   release rollback and verify the previous release SHA plus `/api/health/live`.
4. Do not remove secrets while a mixed Nginx/application rollout is possible;
   remove the unused variables only after the prior configuration is active.

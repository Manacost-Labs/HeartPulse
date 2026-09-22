# Manual authentication acceptance

`tests/production-auth-e2e.test.mjs` is an operator-only acceptance helper. It
requires a real interactive terminal and an explicit `YES` before requests.
It can create a test account and send registration/login verification emails,
so run it only after separate authorization for those production actions.
It is explicitly excluded from the automated test registry.

The default target is HearthPulse; `BASE_URL` can select an HTTPS host or a local
HTTP fixture. URL credentials are rejected. Use a dedicated test account, enter
its password at the hidden prompt, and enter codes from the mailbox. The helper
checks OAuth start redirects and registration/login sessions. It does not
subscribe the account to newsletters. It supplies the target Origin for CSRF
checks and removes expired session cookies from its in-memory jar.

The automated guard test runs only the non-interactive rejection path and
performs no network requests. That check is not evidence of email delivery,
provider availability or successful production login.

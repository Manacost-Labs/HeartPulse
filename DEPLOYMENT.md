# HS-Arena immutable deployment

## Filesystem layout

```text
/var/www/koloda/data/www/hs-arena.ru/
├── app/                     # mutable Git/build workspace
├── current -> releases/SHA  # active immutable release
├── previous -> releases/SHA # last healthy release
├── releases/                # root-owned, read-only artifacts
├── runtime/                 # lockfile-addressed production node_modules
└── shared/server-data/      # mutable snapshots, caches and uploads
```

Frontend and compiled server files belong to a release. Scraped datasets,
card-image caches and uploads belong to `shared/server-data` and survive both
deployments and rollbacks.

## Automatic deployment from `main`

Every push to `main` starts `.github/workflows/ci.yml`. The hosted validation
job installs the lockfile, runs `npm run verify:release`, creates an immutable
release whose manifest contains that exact 40-character Git SHA, and uploads it
as a seven-day workflow artifact. Pull requests and feature branches never
create or deploy a production artifact.

The release-blocking command is `npm run verify:release`: lint, architecture
ratchets, the test-discovery completeness gate, the complete classified unit,
integration, contract, browser and production-smoke suite, production builds,
server recovery smoke tests, performance budgets and documentation lint. The
representative responsive browser matrix also runs in a separate
release-blocking observatory job. Both hosted jobs must pass before the
production runner can download the immutable artifact.

After validation succeeds, the `deploy-production` job targets only the
repository-level runner labelled `hs-arena-production`. GitHub's `production`
environment limits deployment to `main`; the `hs-arena-production` concurrency
group serializes releases and never cancels a deployment already in progress.

The runner has no general root access. Its only privileged command is:

```bash
sudo /usr/local/sbin/hs-arena-ci-deploy \
  --require-capability=scraper-runtime-probe-v1 "$artifact" "$GITHUB_SHA"
```

That root-owned gate first requires a protected `hs-arena-deployer-capabilities-v1`
manifest bound to the exact selected deployer path, reported version, SHA-256
checksum and capabilities. The manifest is parsed as strict `key=value` data;
it is never sourced, and missing, malformed, duplicate or unknown fields fail
closed. The gate verifies the checksum before invoking the selected executable's
`--version` and `--capabilities` interfaces. A legacy helper, a stale manifest
or any mixed-version pair therefore fails before receiving the artifact or
changing deployment state.

The installed manifest has this shape:

```text
format=hs-arena-deployer-capabilities-v1
executable=/usr/local/libexec/hs-arena/deploy-release.sh
version=hs-arena-deploy-release 1.1.0
sha256=<64 lowercase hexadecimal characters>
capability=scraper-runtime-probe-v1
```

The gate then accepts artifacts only from the dedicated runner temp directory,
rejects symlinks and writable files, and requires the release manifest SHA to
equal the validated workflow SHA. After a successful switch, it waits for
`arena-static-sync.service`, so the new content-hashed frontend assets reach
every regional edge before the deployment job is marked complete.

Changes to the workflow, gate or deployer are infrastructure changes. A
repository change is incomplete until the privileged copies are installed and
their capabilities are verified; the workflow cannot replace its own root-owned
production gate. From a reviewed clean checkout, use the auditable installer:

```bash
sudo deploy/install-hs-arena-deployer.sh --install
deploy/install-hs-arena-deployer.sh --check
sudo install -o root -g root -m 440 deploy/hs-arena-github-runner.sudoers \
  /etc/sudoers.d/hs-arena-github-runner
sudo visudo -cf /etc/sudoers.d/hs-arena-github-runner
```

The installer stages files in their destination directories, derives the
manifest from the staged deployer's version, checksum and capability output,
then atomically installs root-owned, non-writable copies. Its `--check` mode
reconstructs the expected manifest from the selected installed executable and
requires an exact match. Do not run this step from a release artifact or an
unreviewed branch.

The dedicated `github-runner` account should have a single sudoers rule for
that gate, not unrestricted sudo. Keep the runner registered only to this
repository and route jobs with all four labels:
`[self-hosted, linux, x64, hs-arena-production]`.

## Build a release

Run from the clean `main` workspace:

```bash
sha=$(git rev-parse HEAD)
sudo -u koloda env RELEASE_SHA="$sha" npm run verify:ci
artifact=$(mktemp -d "/tmp/hs-arena-${sha}.XXXXXX")
rmdir "$artifact"
npm run release:create -- --output="$artifact" --sha="$sha"
```

`release.json` records the commit, Node version, package-lock hash and SHA-256
checksums for the compiled server, frontend entry point and lockfile. Manifest
schema v2 also carries every versioned nginx contract file, its origin/edge
role, installation path, individual hash and one aggregate contract hash. The
manifest additionally checksums the versioned operational scripts and systemd
units shipped with the artifact.
`RELEASE_SHA` (or GitHub Actions' `GITHUB_SHA`) is compiled into the Vite entry
chunk. This changes its content hash on every release and lets all imports use
one canonical module URL; `release:create` rejects a bundle that does not
contain the requested SHA.

Before any deployment, compare the immutable release contract with the files
actually installed on the target host. The verifier is strictly read-only: it
does not copy configuration, reload nginx or change file metadata.

```bash
sudo node "$artifact/scripts/verify-nginx-contract.mjs" \
  --release="$artifact" \
  --installed-root=/ \
  --role=origin
```

Exit code `0` means the artifact and installed files match, `1` means runtime
drift (a file is missing or modified), and `2` means the artifact is corrupt,
unsupported or still uses the legacy unmanaged manifest. Resolve drift through
the reviewed infrastructure procedure and run `nginx -t`; never use the
verifier as an installer.

## Deploy

```bash
sudo scripts/deploy-release.sh "$artifact"
```

The deployer runs the same nginx verifier automatically before it creates a
lock or changes deployment state. Configure the host role and an alternate
root only for an isolated test or chroot:

```bash
sudo NGINX_HOST_ROLE=origin NGINX_INSTALLED_ROOT=/ \
  scripts/deploy-release.sh "$artifact"
```

The first managed release, a legacy current manifest and any changed
`nginxContract.hash` are blocked by default. After the candidate configuration
is installed, `nginx -t` passes and N/N-1 compatibility is explicitly reviewed,
acknowledge that transition for this one command:

```bash
sudo ALLOW_NGINX_CONTRACT_CHANGE=1 scripts/deploy-release.sh "$artifact"
```

This acknowledgement cannot bypass a missing/modified installed file, a
corrupt artifact or a tampered verifier.

The deployer:

1. resolves and validates absolute `NODE_BIN` and `TIMEOUT_BIN` executables,
   then verifies the candidate verifier checksum, artifact nginx hashes,
   installed host-role files and N/N-1 contract compatibility without writing
   anything;
2. acquires an exclusive deployment lock;
3. initializes shared data from the workspace only when it does not exist;
4. installs production dependencies as the unprivileged `koloda` user into a
   lockfile-addressed cache, makes that cache world-readable but read-only and
   verifies module access again as `koloda` before switching;
5. carries forward content-hashed assets from the active release without
   overwriting the new build, then removes inherited files older than 35 days;
   this keeps edge-cached HTML usable for longer than the 30-day asset TTL;
6. makes the new release root-owned and read-only;
7. imports the compiled scraper and completes a bounded local browser smoke as
   the service user with explicit release and shared-data roots;
8. atomically switches `current`;
9. restarts `hs-arena.service`;
10. waits for direct readiness on port 3101;
11. restores the former `current` automatically when restart/readiness fails;
12. updates `previous` only after a healthy deployment.

The application rollback only switches the release symlink. It does not roll
back `/etc/nginx`, so a changed nginx contract must remain compatible with both
application versions N and N-1 until a separate, tested infrastructure rollback
is available. Do not describe a release as fully rollback-safe while those
contracts differ without an explicit compatibility review.

## First infrastructure switch

Install [deploy/hs-arena.service](deploy/hs-arena.service) as
`/etc/systemd/system/hs-arena.service`, then update the two paths shown in
[deploy/nginx-paths.conf.example](deploy/nginx-paths.conf.example). Validate
before reloading:

```bash
sudo systemctl daemon-reload
sudo nginx -t
sudo systemctl restart hs-arena.service
curl -fsS http://127.0.0.1:3101/health/ready
sudo systemctl reload nginx
curl -fsS https://hearthpulse.net/api/health/ready
```

Do not remove the old workspace `dist` or `server/data` until the new service,
nginx paths, authenticated E2E and one rollback drill have all passed.

## Local mail transport

The application submits authentication and newsletter mail to the local Exim
listener over SMTP (`127.0.0.1:25` by default). Do not switch it back to the
setuid `/usr/sbin/sendmail` binary: `hs-arena.service` deliberately has
`NoNewPrivileges=true`, so a sendmail child cannot become the Exim user and
cannot create spool files.

The optional `LOCAL_SMTP_HOST`, `LOCAL_SMTP_PORT` and
`LOCAL_SMTP_TIMEOUT_MS` environment variables configure this connection. Keep
the host loopback-only unless transport authentication and encryption are
added. A healthy runtime should retain `NoNewPrivileges: 1`, accept a probe
through local SMTP and have no `Failed to create spool file` records in the
Exim log.

## Manual rollback

The deployer can deploy the already validated `previous` release without
rebuilding it:

```bash
sudo scripts/deploy-release.sh "$(readlink -f /var/www/koloda/data/www/hs-arena.ru/previous)"
```

This performs the same atomic switch, restart and readiness gate. The release
that was active before rollback becomes the new `previous` target.

## Encrypted mutable-data backups

The backup includes the complete shared data/upload directory, a consistent
SQLite `.backup` of `/var/lib/manacost-ecosystem/users.sqlite`, and the KHA/VIP
profile ledger. Card caches are included so a restore does not depend on an
upstream service being available.

Install the root-only configuration and timers after deploying a release that
contains the backup scripts:

```bash
sudo install -d -m 700 /etc/hs-arena /var/backups/hs-arena
sudo openssl rand -out /etc/hs-arena/backup-passphrase -base64 48
sudo chmod 600 /etc/hs-arena/backup-passphrase
sudo install -m 600 deploy/backup.env.example /etc/hs-arena/backup.env
sudo install -m 644 deploy/hs-arena-backup.service /etc/systemd/system/
sudo install -m 644 deploy/hs-arena-backup.timer /etc/systemd/system/
sudo install -m 644 deploy/hs-arena-backup-verify.service /etc/systemd/system/
sudo install -m 644 deploy/hs-arena-backup-verify.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now hs-arena-backup.timer hs-arena-backup-verify.timer
```

The daily job encrypts with GnuPG AES-256 and a high-cost SHA-512 iterated S2K,
writes an atomic archive
plus SHA-256 sidecar, and retains 14 days by default. The weekly drill decrypts
the latest archive into a temporary directory, verifies every manifest entry,
runs `PRAGMA integrity_check` on the restored user database and checks the
three critical Arena snapshots. Run both immediately after installation:

```bash
sudo systemctl start hs-arena-backup.service
sudo systemctl start hs-arena-backup-verify.service
sudo systemctl status hs-arena-backup.service hs-arena-backup-verify.service
```

For a manual restore, first stop the API and restore the chosen archive into a
new empty absolute path. The command verifies the encrypted archive checksum,
rejects unsafe archive paths, checks every manifest entry and SQLite integrity,
and refuses to overwrite a populated target:

```bash
sudo HS_ARENA_BACKUP_PASSPHRASE_FILE=/etc/hs-arena/backup-passphrase \
  current/scripts/restore-backup.sh \
  /var/backups/hs-arena/hs-arena-YYYYMMDDTHHMMSSZ.tar.gz.gpg \
  /var/lib/hs-arena-recovery
```

Preserve the current data separately, then install the recovered
`server-data`, `users.sqlite` and `kha-vip-profiles.json` from that directory.
Start the API only after SQLite integrity, `/api/health/ready`, strict data
health and the public E2E suite pass. Never restore the `-wal` or `-shm` files.

The local encrypted copy protects confidentiality and operator mistakes but
does not protect against loss of the host filesystem. Replicate encrypted
`.gpg` and `.sha256` files plus an offline copy of the passphrase to a separate
failure domain before considering disaster recovery complete.

### Off-site SSH replication

Use a dedicated account and a pre-created directory on a physically separate
backup host. The account needs permission to write the two encrypted files and
run `sha256sum`; it must not have access to the web host or the recovery
passphrase. Pin the host key instead of accepting it on first use:

```bash
sudo install -m 600 deploy/backup-remote.env.example /etc/hs-arena/backup-remote.env
sudo ssh-keygen -t ed25519 -f /etc/hs-arena/backup-replication-key -N ''
sudo ssh-keyscan -H backup.example.net > /etc/hs-arena/backup-known-hosts
sudo chmod 600 /etc/hs-arena/backup-replication-key /etc/hs-arena/backup-known-hosts
sudo install -m 644 deploy/hs-arena-backup-replicate.service /etc/systemd/system/
sudo install -m 644 deploy/hs-arena-backup-replicate.timer /etc/systemd/system/
sudo systemctl daemon-reload
```

Replace every placeholder in `/etc/hs-arena/backup-remote.env`, install only
the public half of the generated key on the backup account, and verify the
pinned fingerprint out of band. The replication script rejects unsafe
host/user/path values, verifies the local checksum before transfer, uses strict
host-key checking, and verifies the uploaded checksum on the remote host.
Enable the timer only after a manual transfer succeeds:

```bash
sudo systemctl start hs-arena-backup-replicate.service
sudo systemctl status hs-arena-backup-replicate.service
sudo systemctl enable --now hs-arena-backup-replicate.timer
```

Do not store `/etc/hs-arena/backup-passphrase` on that same backup host. Keep at
least two offline copies in separate controlled locations and record a key
recovery drill without putting the secret in source control or logs.

For the host-loss drill, provision a clean recovery machine, fetch one `.gpg`
archive and its `.sha256` sidecar from the backup host, provide the offline
passphrase through a root-only file, run `scripts/verify-backup.sh`, then follow
the manual restore procedure above. The drill is complete only after SQLite
integrity, all three required snapshots, `/api/health/ready`, and the public E2E
suite pass on the recovered host.

## Isolated scraper publishing

The web process never runs Puppeteer or writes scraper snapshots. A dedicated
oneshot service publishes each supported dataset only after structural
validation, using a same-filesystem temporary file, file `fsync`, atomic rename
and directory `fsync`. Empty collections, missing card indexes, invalid dates
and unknown filenames are rejected without replacing the last good snapshot.

The immutable release installs `puppeteer-core` with `npm ci --omit=dev`; full
`puppeteer` is development-only browser QA tooling. An explicit
`PUPPETEER_EXECUTABLE_PATH` or `CHROME_BIN` is fail-fast. Without an override,
the scraper tries executable system Chromium/Chrome candidates in order,
closing a failed candidate before continuing. Compatibility is established by
launch, version diagnostics and the real local-page smoke, not by an exact
browser-major allowlist, so a passing Chromium security update does not create
an artificial outage.

Before release creation, `tests/production-scraper-runtime.test.mjs` performs a
clean production-only install in a temporary directory, imports the compiled
scraper and launches the system browser against a local `data:` page. The
release manifest requires and checksums both `build/server/scraper.js` and its
browser runtime module. Before changing `current`, deployment uses the service
user to import that built scraper and open a local `data:` page. The probe and
service receive the same optional browser path from the root-owned, non-secret
configuration, while the probe explicitly receives the candidate release root
and shared-data directory. It receives TERM after 30 seconds and is
force-killed after a further five-second grace period.

To pin a host-specific executable without exposing secrets or sourcing shell
code, install the single-key example and reinstall the systemd unit. The file
must remain root-owned and not group/world-writable; the deployer parses only
the literal `PUPPETEER_EXECUTABLE_PATH=/absolute/path` entry.

```bash
sudo install -o root -g root -m 0600 deploy/browser-runtime.env.example \
  /etc/hs-arena/browser-runtime.env
sudo install -o root -g root -m 0644 deploy/hs-arena-scraper.service \
  /etc/systemd/system/hs-arena-scraper.service
sudo systemctl daemon-reload
```

Read-only host prerequisites can be checked without running the scraper:

```bash
sudo -u koloda test -x /usr/bin/chromium
sudo -u koloda /usr/bin/chromium --version
```

Install the schedule and manual-request path unit:

```bash
sudo install -m 644 deploy/hs-arena-scraper.service /etc/systemd/system/
sudo install -m 644 deploy/hs-arena-scraper.timer /etc/systemd/system/
sudo install -m 644 deploy/hs-arena-scraper.path /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now hs-arena-scraper.timer hs-arena-scraper.path
```

The timer runs every six hours and shortly after boot. An authorized
`POST /api/scrape` atomically creates `.scrape-request`; the path unit starts
the same isolated service, so manual and scheduled runs cannot overlap. A
publication marker makes the API discard in-memory and Redis data caches only
after a validated snapshot is durable.

Verify one real run without touching the web process:

```bash
sudo systemctl start hs-arena-scraper.service
sudo systemctl show hs-arena-scraper.service -p Result -p ExecMainStatus
curl -fsS https://hearthpulse.net/api/health/data
```

`/api/health/data` also monitors `api.hs-manacost.ru/v1/system/health` in the
background. The upstream request is bounded by a five-second timeout and is
cached for five minutes, so health visibility does not add latency to normal
pages. Any stale, semantic-failed, hard-failed or publication-failed parser
source changes the aggregate dataset to `degraded`; a failed probe preserves
the last known state and reports its warning instead of hiding the outage. The
upstream monitor is diagnostic for `/health/data`, not a process-readiness
dependency, so a cold-start network probe cannot block an otherwise healthy
release from starting.

Constructed-card catalog pagination uses four workers by default. Keep this
fan-out bounded: Wild currently spans more than thirty large pages, and loading
all of them simultaneously can overload the local DB proxy and make a recently
verified catalog appear as LKG after a transient fetch failure.

## Verified production drill

The first production drill on 2026-07-11 switched release `bc19b2b` back to
`43c8722`, passed direct liveness with the previous manifest SHA in one second,
then redeployed `bc19b2b`. Both `current` and `previous` remained valid
root-owned read-only releases sharing the same mutable data directory.

## Verification

```bash
readlink -f /var/www/koloda/data/www/hs-arena.ru/current
systemctl is-active hs-arena.service
curl -fsS https://hearthpulse.net/api/health/live
curl -fsS https://hearthpulse.net/api/health/ready
curl -fsS https://hearthpulse.net/api/health/data
curl -fsS https://hearthpulse.net/api/metrics
sudo systemctl list-timers 'hs-arena-backup*'
sudo systemctl list-timers 'hs-arena-scraper*'
npm run qa:e2e
```

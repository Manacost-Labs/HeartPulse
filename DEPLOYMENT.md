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

## Build a release

Run from the clean `main` workspace:

```bash
sudo -u koloda npm run verify:ci
sha=$(git rev-parse HEAD)
artifact=$(mktemp -d "/tmp/hs-arena-${sha}.XXXXXX")
rmdir "$artifact"
npm run release:create -- --output="$artifact" --sha="$sha"
```

`release.json` records the commit, Node version, package-lock hash and SHA-256
checksums for the compiled server, frontend entry point and lockfile.

## Deploy

```bash
sudo scripts/deploy-release.sh "$artifact"
```

The deployer:

1. acquires an exclusive deployment lock;
2. initializes shared data from the workspace only when it does not exist;
3. installs production dependencies as the unprivileged `koloda` user into a
   lockfile-addressed cache, makes that cache world-readable but read-only and
   verifies module access again as `koloda` before switching;
4. makes the new release root-owned and read-only;
5. atomically switches `current`;
6. restarts `hs-arena.service`;
7. waits for direct readiness on port 3101;
8. restores the former `current` automatically when restart/readiness fails;
9. updates `previous` only after a healthy deployment.

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
curl -fsS https://arena.hs-manacost.ru/api/health/ready
```

Do not remove the old workspace `dist` or `server/data` until the new service,
nginx paths, authenticated E2E and one rollback drill have all passed.

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

For a manual restore, first stop the API, verify and decrypt the chosen backup
into an empty protected directory, preserve the current data separately, then
replace `shared/server-data`, `users.sqlite` and `kha-vip-profiles.json` with
their restored copies. Start the API only after SQLite integrity and
`/api/health/ready` both pass. Never restore the `-wal` or `-shm` files.

The local encrypted copy protects confidentiality and operator mistakes but
does not protect against loss of the host filesystem. Replicate encrypted
`.gpg` and `.sha256` files plus an offline copy of the passphrase to a separate
failure domain before considering disaster recovery complete.

## Isolated scraper publishing

The web process never runs Puppeteer or writes scraper snapshots. A dedicated
oneshot service publishes each supported dataset only after structural
validation, using a same-filesystem temporary file, file `fsync`, atomic rename
and directory `fsync`. Empty collections, missing card indexes, invalid dates
and unknown filenames are rejected without replacing the last good snapshot.

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
curl -fsS https://arena.hs-manacost.ru/api/health/data
```

## Verified production drill

The first production drill on 2026-07-11 switched release `bc19b2b` back to
`43c8722`, passed direct liveness with the previous manifest SHA in one second,
then redeployed `bc19b2b`. Both `current` and `previous` remained valid
root-owned read-only releases sharing the same mutable data directory.

## Verification

```bash
readlink -f /var/www/koloda/data/www/hs-arena.ru/current
systemctl is-active hs-arena.service
curl -fsS https://arena.hs-manacost.ru/api/health/live
curl -fsS https://arena.hs-manacost.ru/api/health/ready
curl -fsS https://arena.hs-manacost.ru/api/health/data
curl -fsS https://arena.hs-manacost.ru/api/metrics
sudo systemctl list-timers 'hs-arena-backup*'
sudo systemctl list-timers 'hs-arena-scraper*'
npm run qa:e2e
```

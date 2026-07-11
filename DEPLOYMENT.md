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
3. installs production dependencies into a lockfile-addressed cache;
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

## Verification

```bash
readlink -f /var/www/koloda/data/www/hs-arena.ru/current
systemctl is-active hs-arena.service
curl -fsS https://arena.hs-manacost.ru/api/health/live
curl -fsS https://arena.hs-manacost.ru/api/health/ready
curl -fsS https://arena.hs-manacost.ru/api/health/data
npm run qa:e2e
```

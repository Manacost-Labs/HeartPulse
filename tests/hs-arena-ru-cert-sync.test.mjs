import assert from 'node:assert/strict';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const script = join(root, 'deploy/sync-hs-arena-ru-cert.sh');
const LINEAGE = 'etc/letsencrypt/live/hs-arena.ru';
const COPY = 'etc/nginx/ssl/hs-arena.ru';

function executable(path, body) {
  writeFileSync(path, body);
  chmodSync(path, 0o755);
}

function certificate(directory, days = 30) {
  mkdirSync(directory, { recursive: true });
  const result = spawnSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1',
    '-nodes', '-days', String(days), '-subj', '/CN=hs-arena.ru', '-keyout', join(directory, 'privkey.pem'),
    '-out', join(directory, 'fullchain.pem')], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

// Each fake edge is a directory standing in for its `/`; the fake ssh runs the
// remote command locally with the edge paths moved into it.
function fixture() {
  const base = mkdtempSync(join(tmpdir(), 'hs-arena-cert-sync-'));
  const identity = join(base, 'id');
  writeFileSync(identity, 'key');
  const config = join(base, 'edges.conf');
  writeFileSync(config, `ARENA_STATIC_EDGE_SPECS=("root@moscow|${identity}" "root@novosibirsk|${identity}")\n`);
  const bin = join(base, 'bin');
  mkdirSync(bin);
  executable(join(bin, 'ssh'), `#!/usr/bin/env bash
host=""; while [[ $# -gt 1 ]]; do case "$1" in -i|-o) shift 2 ;; *) host="$1"; shift ;; esac; done
edge="$FAKE_EDGES/\${host#*@}"
[[ -d "$edge" ]] || exit 255
command="$(printf '%s' "$1" | sed -e "s#/etc/#$edge/etc/#g" -e "s#/root/#$edge/root/#g")"
export FAKE_EDGE="$edge"
eval "$command"
`);
  executable(join(bin, 'nginx'), '#!/usr/bin/env bash\n[[ ! -e "$FAKE_EDGE/nginx-t-fails" ]]\n');
  executable(join(bin, 'systemctl'), '#!/usr/bin/env bash\necho "$*" >> "$FAKE_EDGE/systemctl.log"\n');
  const edges = join(base, 'edges');
  certificate(join(edges, 'moscow', LINEAGE));
  certificate(join(edges, 'novosibirsk', 'stale'));
  mkdirSync(join(edges, 'novosibirsk', COPY), { recursive: true });
  for (const name of ['fullchain', 'privkey']) {
    cpSync(join(edges, 'novosibirsk', 'stale', `${name}.pem`), join(edges, 'novosibirsk', COPY, `letsencrypt-${name}.pem`));
  }
  const run = () => spawnSync('bash', [script], { encoding: 'utf8', env: { ...process.env,
    PATH: `${bin}:${process.env.PATH}`, ARENA_STATIC_SYNC_CONFIG: config, FAKE_EDGES: edges,
    HS_ARENA_CERT_SOURCE: 'moscow', HS_ARENA_CERT_TARGETS: 'novosibirsk' } });
  const read = (edge, path) => readFileSync(join(edges, edge, path), 'utf8');
  return { base, edges, run, read };
}

test('the sync stays inside the static-sync topology and ships with the release', () => {
  const source = readFileSync(script, 'utf8');
  assert.match(source, /StrictHostKeyChecking=yes/);
  assert.doesNotMatch(source, /StrictHostKeyChecking=(?:no|accept-new)/);
  assert.match(source, /HS_ARENA_CERT_SOURCE:-194\.67\.92\.242/);
  assert.match(source, /HS_ARENA_CERT_TARGETS:-186\.246\.28\.244/);
  const release = readFileSync(join(root, 'scripts/create-release.mjs'), 'utf8');
  for (const file of ['deploy/sync-hs-arena-ru-cert.sh', 'deploy/systemd/hs-arena-ru-cert-sync.service',
    'deploy/systemd/hs-arena-ru-cert-sync.timer']) assert.ok(release.includes(`'${file}'`), file);
  const service = readFileSync(join(root, 'deploy/systemd/hs-arena-ru-cert-sync.service'), 'utf8');
  assert.match(service, /ExecStart=\/bin\/bash \/var\/www\/koloda\/data\/www\/hs-arena\.ru\/current\/deploy\/sync-hs-arena-ru-cert\.sh/);
  assert.match(service, /ProtectHome=read-only/, 'the Moscow identity lives under /home/debian/.ssh');
  assert.equal(spawnSync('bash', ['-n', script]).status, 0);
});

test('a differing copy is replaced, backed up and reloaded; a current one is left alone', () => {
  const { base, edges, run, read } = fixture();
  try {
    const stale = read('novosibirsk', `${COPY}/letsencrypt-fullchain.pem`);
    const first = run();
    assert.equal(first.status, 0, first.stderr || first.stdout);
    assert.match(first.stdout, /novosibirsk: copying the certificate from moscow/);
    for (const name of ['fullchain', 'privkey']) {
      assert.equal(read('novosibirsk', `${COPY}/letsencrypt-${name}.pem`), read('moscow', `${LINEAGE}/${name}.pem`));
    }
    assert.equal(read('novosibirsk', 'systemctl.log'), 'reload nginx\n');
    const [backup] = readdirSync(join(edges, 'novosibirsk', 'root/hs-arena-cert-backup'));
    assert.equal(read('novosibirsk', `root/hs-arena-cert-backup/${backup}/letsencrypt-fullchain.pem`), stale);
    assert.deepEqual(readdirSync(join(edges, 'novosibirsk', COPY)).sort(),
      ['letsencrypt-fullchain.pem', 'letsencrypt-privkey.pem'], 'no staging directory is left behind');

    const second = run();
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /novosibirsk: current/);
    assert.equal(read('novosibirsk', 'systemctl.log'), 'reload nginx\n', 'a current copy is not reloaded');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('a failed nginx -t restores the previous copy and reloads nothing', () => {
  const { base, edges, run, read } = fixture();
  try {
    const stale = read('novosibirsk', `${COPY}/letsencrypt-fullchain.pem`);
    writeFileSync(join(edges, 'novosibirsk', 'nginx-t-fails'), '');
    const result = run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /previous certificate restored/);
    assert.match(result.stderr, /hs-arena\.ru certificate sync failed: novosibirsk/);
    assert.equal(read('novosibirsk', `${COPY}/letsencrypt-fullchain.pem`), stale);
    assert.equal(existsSync(join(edges, 'novosibirsk', 'systemctl.log')), false);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('a certificate that does not match its key is never installed', () => {
  const { base, edges, run, read } = fixture();
  try {
    const stale = read('novosibirsk', `${COPY}/letsencrypt-fullchain.pem`);
    certificate(join(edges, 'other'));
    cpSync(join(edges, 'other', 'privkey.pem'), join(edges, 'moscow', LINEAGE, 'privkey.pem'));
    const result = run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /does not match its key/);
    assert.equal(read('novosibirsk', `${COPY}/letsencrypt-fullchain.pem`), stale);
    assert.equal(existsSync(join(edges, 'novosibirsk', 'systemctl.log')), false);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('a missing or expired source certificate fails without touching the copy', () => {
  const { base, edges, run, read } = fixture();
  try {
    const stale = read('novosibirsk', `${COPY}/letsencrypt-fullchain.pem`);
    rmSync(join(edges, 'moscow', LINEAGE), { recursive: true });
    const result = run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /The certificate on moscow is missing or expired/);
    assert.equal(read('novosibirsk', `${COPY}/letsencrypt-fullchain.pem`), stale);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

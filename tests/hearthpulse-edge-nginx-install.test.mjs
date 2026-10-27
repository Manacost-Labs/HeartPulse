import assert from 'node:assert/strict';
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync,
  symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const script = join(root, 'deploy/install-hearthpulse-edge-nginx.sh');
const FILES = [
  ['deploy/nginx/arena-edge-cache-path.conf', 'etc/nginx/conf.d/34-arena-edge-cache-path.conf'],
  ['deploy/nginx/hearthpulse-shadow-app.conf', 'etc/nginx/sites-available/hearthpulse-shadow-app.conf'],
  ['deploy/nginx/hearthpulse-shadow-cdn.conf', 'etc/nginx/sites-available/hearthpulse-shadow-cdn.conf'],
  ['deploy/nginx/hearthpulse-legacy-hs-arena.conf', 'etc/nginx/sites-available/hearthpulse-legacy-hs-arena.conf'],
];

function executable(path, body) {
  writeFileSync(path, body);
  chmodSync(path, 0o755);
}

// Each fake edge is a directory standing in for its `/`. The fake ssh runs the
// remote command locally with `/etc/nginx` and `/root/` moved into it.
function fixture() {
  const base = mkdtempSync(join(tmpdir(), 'hearthpulse-edge-nginx-'));
  const release = join(base, 'release');
  for (const [source] of FILES) cpSync(join(root, source), join(release, source));
  const identity = join(base, 'id');
  writeFileSync(identity, 'key');
  const config = join(base, 'edges.conf');
  writeFileSync(config, `ARENA_STATIC_EDGE_SPECS=("root@moscow|${identity}" "debian@novosibirsk|${identity}")\n`);
  const bin = join(base, 'bin');
  mkdirSync(bin);
  executable(join(bin, 'ssh'), `#!/usr/bin/env bash
host=""; while [[ $# -gt 1 ]]; do case "$1" in -i|-o) shift 2 ;; *) host="$1"; shift ;; esac; done
edge="$FAKE_EDGES/\${host#*@}"
command="$(printf '%s' "$1" | sed -e "s#/etc/nginx#$edge/etc/nginx#g" -e "s#/root/#$edge/root/#g")"
sudo() { "$@"; }
export FAKE_EDGE="$edge"
eval "$command"
`);
  executable(join(bin, 'install'), `#!/usr/bin/env bash
args=(); while [[ $# -gt 0 ]]; do case "$1" in -o|-g) shift 2 ;; *) args+=("$1"); shift ;; esac; done
exec /usr/bin/install "\${args[@]}"
`);
  executable(join(bin, 'nginx'), `#!/usr/bin/env bash
if [[ "$1" == -T ]]; then echo "# configuration file $FAKE_EDGE/etc/nginx/sites-enabled/hearthpulse-shadow-app.conf:"; exit 0; fi
if [[ -e "$FAKE_EDGE/nginx-t-conflict" ]]; then
  echo 'nginx: [warn] conflicting server name "hs-arena.ru" on 0.0.0.0:443, ignored' >&2
fi
[[ ! -e "$FAKE_EDGE/nginx-t-fails" ]]
`);
  executable(join(bin, 'systemctl'), `#!/usr/bin/env bash
echo "$*" >> "$FAKE_EDGE/systemctl.log"
`);
  const edges = join(base, 'edges');
  for (const edge of ['moscow', 'novosibirsk']) {
    for (const [source, target] of FILES) cpSync(join(root, source), join(edges, edge, target));
    mkdirSync(join(edges, edge, 'root'), { recursive: true });
    mkdirSync(join(edges, edge, 'etc/nginx/sites-enabled'), { recursive: true });
  }
  const run = (mode, ...edgeNames) => spawnSync('bash', [script, mode, ...edgeNames], { encoding: 'utf8', env: { ...process.env,
    PATH: `${bin}:${process.env.PATH}`, ARENA_STATIC_SYNC_CONFIG: config, HEARTHPULSE_EDGE_NGINX_RELEASE: release,
    FAKE_EDGES: edges } });
  const edgeFile = (edge, index) => join(edges, edge, FILES[index][1]);
  const enabled = (edge, name) => join(edges, edge, 'etc/nginx/sites-enabled', name);
  return { base, release, edges, run, edgeFile, enabled };
}

test('the edge nginx files are listed in the release contract', () => {
  const release = readFileSync(join(root, 'scripts/create-release.mjs'), 'utf8');
  for (const [source, target] of FILES) {
    assert.ok(release.includes(`{ source: '${source}', installPath: '/${target}', roles: ['edge'] }`), source);
  }
  assert.ok(release.includes("'deploy/install-hearthpulse-edge-nginx.sh'"), 'the installer ships with the release');
  assert.doesNotMatch(readFileSync(script, 'utf8'), /StrictHostKeyChecking=(?:no|accept-new)/);
  assert.equal(spawnSync('bash', ['-n', script]).status, 0);
});

test('--check prints the drift of every edge and fails only when a file differs', () => {
  const { base, run, edgeFile } = fixture();
  try {
    const clean = run('--check');
    assert.equal(clean.status, 0, clean.stderr);
    assert.doesNotMatch(clean.stdout, /^---/m);
    writeFileSync(edgeFile('novosibirsk', 1), 'server { add_header X-Proxy-Cache BYPASS always; }\n');
    rmSync(edgeFile('novosibirsk', 2));
    const drifted = run('--check');
    assert.equal(drifted.status, 1);
    assert.match(drifted.stdout, /^--- debian@novosibirsk:\/etc\/nginx\/sites-available\/hearthpulse-shadow-app\.conf$/m);
    assert.match(drifted.stdout, /^-server \{ add_header X-Proxy-Cache BYPASS always; \}$/m);
    assert.match(drifted.stdout, /^--- debian@novosibirsk:\/etc\/nginx\/sites-available\/hearthpulse-shadow-cdn\.conf$/m);
    assert.doesNotMatch(drifted.stdout, /^--- root@moscow/m, 'a current edge prints no diff');
    assert.equal(run('--check', 'moscow').status, 0, 'a selected edge is checked alone');
    assert.equal(run('--check', 'novosibirsk').status, 1);
    assert.equal(run('--check', 'limburg').status, 2, 'an edge outside the topology is refused');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('--install backs up, installs and reloads each edge after nginx -t', () => {
  const { base, release, edges, run, edgeFile } = fixture();
  try {
    writeFileSync(edgeFile('novosibirsk', 1), 'stale vhost\n');
    const result = run('--install');
    assert.equal(result.status, 0, result.stderr || result.stdout);
    for (const edge of ['moscow', 'novosibirsk']) {
      FILES.forEach(([source], index) => assert.equal(readFileSync(edgeFile(edge, index), 'utf8'),
        readFileSync(join(release, source), 'utf8'), `${edge} ${source}`));
      assert.equal(readFileSync(join(edges, edge, 'systemctl.log'), 'utf8'), 'reload nginx\n');
    }
    const [backup] = readdirSync(join(edges, 'novosibirsk', 'root/hearthpulse-nginx-backup'));
    const saved = join(edges, 'novosibirsk', 'root/hearthpulse-nginx-backup', backup);
    assert.equal(readFileSync(join(saved, 'hearthpulse-shadow-app.conf'), 'utf8'), 'stale vhost\n');
    assert.ok(existsSync(join(saved, 'nginx-T.txt')));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('--install with an edge changes only that edge', () => {
  const { base, edges, run, edgeFile } = fixture();
  try {
    writeFileSync(edgeFile('novosibirsk', 1), 'stale vhost\n');
    assert.equal(run('--install', 'moscow').status, 0);
    assert.ok(existsSync(join(edges, 'moscow', 'systemctl.log')));
    assert.equal(readFileSync(edgeFile('novosibirsk', 1), 'utf8'), 'stale vhost\n');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('a failed nginx -t restores that edge, reloads nothing and stops before the next edge', () => {
  const { base, edges, run, edgeFile } = fixture();
  try {
    writeFileSync(edgeFile('moscow', 0), 'old cache path\n');
    rmSync(edgeFile('moscow', 2));
    writeFileSync(edgeFile('novosibirsk', 1), 'stale vhost\n');
    writeFileSync(join(edges, 'moscow', 'nginx-t-fails'), '');
    const result = run('--install');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Install failed on root@moscow; later edges were not changed/);
    assert.equal(readFileSync(edgeFile('moscow', 0), 'utf8'), 'old cache path\n', 'a replaced file is restored');
    assert.equal(existsSync(edgeFile('moscow', 2)), false, 'a file that did not exist is removed again');
    assert.equal(existsSync(join(edges, 'moscow', 'systemctl.log')), false, 'nothing is reloaded');
    assert.equal(readFileSync(edgeFile('novosibirsk', 1), 'utf8'), 'stale vhost\n', 'the next edge is untouched');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('--install enables a vhost once and keeps an existing link under another name', () => {
  const { base, run, edgeFile, enabled } = fixture();
  try {
    rmSync(edgeFile('moscow', 3));
    symlinkSync(edgeFile('moscow', 1), enabled('moscow', 'hearthpulse.net'));
    const result = run('--install', 'moscow');
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(readlinkSync(enabled('moscow', 'hearthpulse-legacy-hs-arena.conf')), edgeFile('moscow', 3));
    assert.equal(existsSync(enabled('moscow', 'hearthpulse-shadow-app.conf')), false,
      'an enabled vhost must not gain a second link');
    assert.ok(lstatSync(enabled('moscow', 'hearthpulse.net')).isSymbolicLink());
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('a second server for a managed name restores that edge and reloads nothing', () => {
  const { base, edges, run, edgeFile, enabled } = fixture();
  try {
    rmSync(edgeFile('moscow', 3));
    writeFileSync(join(edges, 'moscow', 'nginx-t-conflict'), '');
    const result = run('--install');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /another server also declares hs-arena\.ru; disable it before installing/);
    assert.match(result.stderr, /Install failed on root@moscow; later edges were not changed/);
    assert.equal(existsSync(edgeFile('moscow', 3)), false, 'the new vhost is removed again');
    assert.deepEqual(readdirSync(join(edges, 'moscow', 'etc/nginx/sites-enabled')), [], 'every link it added is removed');
    assert.equal(existsSync(join(edges, 'moscow', 'systemctl.log')), false, 'nothing is reloaded');
    assert.equal(existsSync(join(edges, 'novosibirsk', 'systemctl.log')), false, 'the next edge is untouched');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

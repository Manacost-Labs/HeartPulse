import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const source = readFileSync('deploy/deploy-hearthpulse-cert.sh', 'utf8');

assert.match(source, /expected_lineage=\/etc\/letsencrypt\/live\/hearthpulse\.net/);
assert.match(source, /StrictHostKeyChecking=yes/);
assert.match(source, /BatchMode=yes/);
assert.doesNotMatch(source, /StrictHostKeyChecking=(?:no|accept-new)/);
assert.match(source, /194\.67\.92\.242/);
assert.match(source, /186\.246\.28\.244/);
assert.match(source, /debian@57\.129\.183\.118[^\n]+sudo/);
assert.doesNotMatch(source, /162\.19\.220\.14/, 'the offline Limburg edge must not block certificate deploys');
assert.match(source, /if ! \(deploy_edge /,
  'an unreachable edge must not stop the remaining edges from receiving the certificate');
assert.match(source, /mktemp -d \/tmp\/hearthpulse-cert\.XXXXXX'\) \|\| return 1/,
  'without errexit a failed mktemp must not send the key to the edge root directory');
assert.match(source, /\[\[ "\$remote_dir" == \/tmp\/hearthpulse-cert\.\* \]\] \|\| return 1/);
assert.match(source, /install -o root -g root -m 0600/,
  'the private key must remain root-only on every edge');
assert.match(source, /nginx -t/);
assert.match(source, /systemctl reload nginx/);
assert.match(source, /ssh\s+"\$\{options\[@\]\}"\s+"\$target"\s+bash\s+-s/,
  'the remote installer uses Bash syntax and must explicitly run with Bash');
assert.match(source, /\[\[ "\$privilege" != none \]\]/,
  'root targets use a non-empty sentinel so SSH preserves all positional arguments');
assert.match(source, /root@194\.67\.92\.242[^\n']+none/);
assert.match(source, /root@186\.246\.28\.244[^\n]+none/);

const fixtureRoot = mkdtempSync(join(tmpdir(), 'hearthpulse-cert-'));
try {
  const installed = join(fixtureRoot, 'installed');
  const fake = (name, body) => {
    writeFileSync(join(fixtureRoot, name), `#!/usr/bin/env bash\n${body}`);
    chmodSync(join(fixtureRoot, name), 0o755);
  };
  // Moscow is unreachable; the other edges must still receive the certificate.
  fake('ssh', `[[ "$*" != *194.67.92.242* ]] || exit 255
if [[ "$*" == *mktemp* ]]; then echo /tmp/hearthpulse-cert.fixture; exit 0; fi
if [[ "$*" == *" bash -s "* ]]; then cat >/dev/null; printf '%s\\n' "$*" | grep -oE '[a-z]+@[0-9.]+' >>"${installed}"; fi
exit 0
`);
  fake('scp', 'exit 0\n');
  const run = spawnSync('bash', ['deploy/deploy-hearthpulse-cert.sh'], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${fixtureRoot}:${process.env.PATH}` },
  });
  assert.notEqual(run.status, 0, 'a failed edge must fail the hook');
  assert.match(run.stderr, /certificate deploy failed: root@194\.67\.92\.242/);
  assert.deepEqual(readFileSync(installed, 'utf8').trim().split('\n'),
    ['root@186.246.28.244', 'debian@57.129.183.118']);
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}

console.log('HearthPulse certificate deployment contract passed');

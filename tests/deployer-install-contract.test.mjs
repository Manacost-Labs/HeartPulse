import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('privileged deployer installer is explicit, auditable and fail closed', () => {
  const installer = readFileSync('deploy/install-hs-arena-deployer.sh', 'utf8');

  assert.match(installer, /--install/);
  assert.match(installer, /--check/);
  assert.match(installer, /\[\[ \$EUID -eq 0 \]\]/, 'live installation must require root');
  assert.match(installer, /install -o root -g root -m 0755/);
  assert.match(installer, /sha256sum/);
  assert.match(installer, /stat -c ['"]%U:%G['"]/);
  assert.match(installer, /scraper-runtime-probe-v1/);
  assert.match(installer, /require-deployer-capability-v1/);
  assert.match(installer, /hs-arena-deployer-capabilities-v1/);
  assert.match(installer, /printf 'executable=%s\\n'/);
  assert.match(installer, /printf 'version=%s\\n'/);
  assert.match(installer, /printf 'sha256=%s\\n'/);
  assert.match(installer, /printf 'capability=%s\\n'/);
  assert.match(installer, /cmp -s/, 'installation checks must compare the complete expected manifest');
  assert.doesNotMatch(installer, /chmod\s+-R|chown\s+-R/, 'installer must not mutate broad directory trees');
});

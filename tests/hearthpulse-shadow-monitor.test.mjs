import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const fixtureRoot = mkdtempSync(join(tmpdir(), 'hearthpulse-monitor-'));

function installFixture(name, contents) {
  const path = join(fixtureRoot, name);
  writeFileSync(path, contents);
  chmodSync(path, 0o755);
}

installFixture('dig', `#!/usr/bin/env bash
set -euo pipefail
host="\${@: -2:1}"
record_type="\${@: -1}"
if [[ "$record_type" == A ]]; then
  printf '%s\\n' 162.19.220.14 194.67.92.242 186.246.28.244
  [[ -z "\${FAKE_EXTRA_A:-}" ]] || printf '%s\\n' "$FAKE_EXTRA_A"
elif [[ -n "\${FAKE_AAAA:-}" ]]; then
  printf '%s\\n' "$FAKE_AAAA"
fi
`);

installFixture('curl', `#!/usr/bin/env bash
set -euo pipefail
url="\${@: -1}"
if [[ "$*" == *" --head "* ]]; then
  status=200
  [[ -z "\${FAKE_FAIL_WWW:-}" || "$url" != https://www.hearthpulse.net/* ]] || status=502
  printf 'HTTP/2 %s\\r\\n' "$status"
  if [[ "$url" == https://cdn.hearthpulse.net/* ]]; then
    printf 'Content-Type: image/webp\\r\\n'
    printf 'Access-Control-Allow-Origin: *\\r\\n'
  else
    printf 'Strict-Transport-Security: max-age=%s\\r\\n' "\${FAKE_HSTS_MAX_AGE:-300}"
  fi
  printf 'X-Robots-Tag: noindex, nofollow\\r\\n\\r\\n'
elif [[ "$url" == */api/subscription/status ]]; then
  printf 404
else
  printf 200
fi
`);

function runMonitor(extraEnvironment = {}) {
  return spawnSync('bash', ['deploy/monitor-hearthpulse-shadow.sh'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fixtureRoot}:${process.env.PATH}`,
      ...extraEnvironment,
    },
  });
}

try {
  const healthy = runMonitor();
  assert.equal(healthy.status, 0, healthy.stderr || healthy.stdout);
  assert.match(healthy.stdout, /checks passed/);

  const extraIpv4 = runMonitor({ FAKE_EXTRA_A: '203.0.113.10' });
  assert.notEqual(extraIpv4.status, 0);
  assert.match(extraIpv4.stderr, /unsafe IPv4 set/);

  const unexpectedIpv6 = runMonitor({ FAKE_AAAA: '2001:db8::10' });
  assert.notEqual(unexpectedIpv6.status, 0);
  assert.match(unexpectedIpv6.stderr, /unexpectedly exposed IPv6/);

  const brokenWww = runMonitor({ FAKE_FAIL_WWW: '1' });
  assert.notEqual(brokenWww.status, 0);
  assert.match(brokenWww.stderr, /www\.hearthpulse\.net returned HTTP 502/);

  const unsafeHsts = runMonitor({ FAKE_HSTS_MAX_AGE: '31536000' });
  assert.notEqual(unsafeHsts.status, 0);
  assert.match(unsafeHsts.stderr, /unsafe HSTS/);

  console.log('HearthPulse shadow monitor behavior passed');
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}

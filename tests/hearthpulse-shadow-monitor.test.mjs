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
  [[ "$host" != www.hearthpulse.net ]] || printf 'hearthpulse.net.\\n'
  printf '%s\\n' 162.19.220.14
  [[ ",\${FAKE_QUARANTINE:-}," == *,moscow,* ]] || printf '%s\\n' 194.67.92.242
  [[ ",\${FAKE_QUARANTINE:-}," == *,novosibirsk,* ]] || printf '%s\\n' 186.246.28.244
  [[ -z "\${FAKE_EXTRA_A:-}" ]] || printf '%s\\n' "$FAKE_EXTRA_A"
elif [[ -n "\${FAKE_AAAA:-}" ]]; then
  printf '%s\\n' "$FAKE_AAAA"
fi
`);

installFixture('curl', `#!/usr/bin/env bash
set -euo pipefail
if [[ -n "\${FAKE_FAIL_NOVOSIBIRSK:-}" && "$*" == *186.246.28.244* ]]; then
  exit 28
fi
if [[ -n "\${FAKE_FAIL_MOSCOW:-}" && "$*" == *194.67.92.242* ]]; then
  exit 28
fi
url="\${@: -1}"
if [[ "$*" == *" --head "* ]]; then
  status=200
  if [[ -n "\${FAKE_FAIL_WWW:-}" && "$url" == https://www.hearthpulse.net/* ]]; then
    status=502
  elif [[ "$url" == https://www.hearthpulse.net/* || "$url" == https://arena.hs-manacost.ru/* || "$url" == https://cdn.arena.hs-manacost.ru/* ]]; then
    status=301
  fi
  printf 'HTTP/2 %s\\r\\n' "$status"
  if [[ "$url" == https://cdn.hearthpulse.net/* ]]; then
    printf 'Content-Type: image/webp\\r\\n'
    printf 'Access-Control-Allow-Origin: *\\r\\n'
  elif [[ "$url" == https://www.hearthpulse.net/* ]]; then
    printf 'Location: https://hearthpulse.net%s\\r\\n' "\${url#https://www.hearthpulse.net}"
  elif [[ "$url" == https://cdn.arena.hs-manacost.ru/* ]]; then
    printf 'Location: https://cdn.hearthpulse.net%s\\r\\n' "\${url#https://cdn.arena.hs-manacost.ru}"
  elif [[ "$url" == https://arena.hs-manacost.ru/* ]]; then
    printf 'Location: https://hearthpulse.net%s\\r\\n' "\${url#https://arena.hs-manacost.ru}"
  else
    printf 'Strict-Transport-Security: max-age=%s\\r\\n' "\${FAKE_HSTS_MAX_AGE:-31536000}"
  fi
  printf '\\r\\n'
elif [[ "$url" == */api/subscription/status ]]; then
  printf 404
elif [[ -n "\${FAKE_FAIL_FANOUT:-}" && "$url" == https://hearthpulse.net/articles/ ]]; then
  printf 502
elif [[ "$url" == */robots.txt ]]; then
  printf 'Sitemap: https://hearthpulse.net/sitemap.xml\\n'
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

  const quarantined = runMonitor({
    FAKE_QUARANTINE: 'novosibirsk',
    FAKE_FAIL_NOVOSIBIRSK: '1',
    HEARTHPULSE_MONITOR_QUARANTINED_REGION: 'novosibirsk',
  });
  assert.equal(quarantined.status, 0, quarantined.stderr || quarantined.stdout);
  assert.match(quarantined.stdout, /quarantined regions: novosibirsk/);

  const twoQuarantined = runMonitor({
    FAKE_QUARANTINE: 'moscow,novosibirsk',
    FAKE_FAIL_MOSCOW: '1',
    FAKE_FAIL_NOVOSIBIRSK: '1',
    HEARTHPULSE_MONITOR_QUARANTINED_REGIONS: 'moscow,novosibirsk',
  });
  assert.equal(twoQuarantined.status, 0, twoQuarantined.stderr || twoQuarantined.stdout);
  assert.match(twoQuarantined.stdout, /quarantined regions: moscow,novosibirsk/);

  const unexpectedSecondEdge = runMonitor({ HEARTHPULSE_MONITOR_QUARANTINED_REGIONS: 'moscow,novosibirsk' });
  assert.notEqual(unexpectedSecondEdge.status, 0);
  assert.match(unexpectedSecondEdge.stderr, /unsafe IPv4 set/);

  const duplicateRegion = runMonitor({ HEARTHPULSE_MONITOR_QUARANTINED_REGIONS: 'moscow,moscow' });
  assert.notEqual(duplicateRegion.status, 0);
  assert.match(duplicateRegion.stderr, /unsupported quarantined regions/);

  const unconfiguredQuarantine = runMonitor({ FAKE_QUARANTINE: 'novosibirsk' });
  assert.notEqual(unconfiguredQuarantine.status, 0);
  assert.match(unconfiguredQuarantine.stderr, /unsafe IPv4 set/);

  const advertisedBadEdge = runMonitor({ HEARTHPULSE_MONITOR_QUARANTINED_REGION: 'novosibirsk' });
  assert.notEqual(advertisedBadEdge.status, 0);
  assert.match(advertisedBadEdge.stderr, /unsafe IPv4 set/);

  const unknownRegion = runMonitor({ HEARTHPULSE_MONITOR_QUARANTINED_REGION: 'unknown' });
  assert.notEqual(unknownRegion.status, 0);
  assert.match(unknownRegion.stderr, /unsupported quarantined region/);

  const brokenConcurrentPage = runMonitor({ FAKE_FAIL_FANOUT: '1' });
  assert.notEqual(brokenConcurrentPage.status, 0);
  assert.match(brokenConcurrentPage.stderr, /parallel application \/articles\/ returned HTTP 502/);

  const extraIpv4 = runMonitor({ FAKE_EXTRA_A: '203.0.113.10' });
  assert.notEqual(extraIpv4.status, 0);
  assert.match(extraIpv4.stderr, /unsafe IPv4 set/);

  const unexpectedIpv6 = runMonitor({ FAKE_AAAA: '2001:db8::10' });
  assert.notEqual(unexpectedIpv6.status, 0);
  assert.match(unexpectedIpv6.stderr, /unexpectedly exposed IPv6/);

  const brokenWww = runMonitor({ FAKE_FAIL_WWW: '1' });
  assert.notEqual(brokenWww.status, 0);
  assert.match(brokenWww.stderr, /www returned HTTP 502/);

  const unsafeHsts = runMonitor({ FAKE_HSTS_MAX_AGE: '300' });
  assert.notEqual(unsafeHsts.status, 0);
  assert.match(unsafeHsts.stderr, /unsafe HSTS/);

  console.log('HearthPulse canonical monitor behavior passed');
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}

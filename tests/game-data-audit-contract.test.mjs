import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const manifest = JSON.parse(readFileSync('config/game-data-audit.json', 'utf8'));
const service = readFileSync('deploy/systemd/hs-arena-game-data-audit.service', 'utf8');
const timer = readFileSync('deploy/systemd/hs-arena-game-data-audit.timer', 'utf8');

test('manifest covers patch signals, constructed formats and Battlegrounds surfaces', () => {
  const ids = new Set(manifest.sources.map(source => source.id));
  for (const id of [
    'hearthstonejson-cards', 'blizzard-patch-notes', 'hearthstone-wiki-recent-changes',
    'constructed-cards-standard', 'constructed-cards-wild', 'battleground-cards',
    'battleground-heroes', 'battleground-trinkets', 'battleground-dark-gifts',
    'arena-data-health', 'statistics-parser-control', 'statistics-data-health',
  ]) assert.equal(ids.has(id), true, `missing audit source ${id}`);
  assert.equal(manifest.normalIntervalHours, 6);
  assert.equal(manifest.fastIntervalHours, 1);
  assert.equal(manifest.fastModeHours, 72);
  assert.equal(manifest.sources.find(source => source.id === 'battleground-dark-gifts')?.expectedRecords, 43);
});

test('systemd audit is read-only, bounded and writes only to shared audit state', () => {
  assert.match(service, /^User=koloda$/m);
  assert.match(service, /^NoNewPrivileges=true$/m);
  assert.match(service, /^ProtectSystem=strict$/m);
  assert.match(service, /^ProtectHome=true$/m);
  assert.match(service, /^ReadWritePaths=.*shared\/server-data\/game-data-audit$/m);
  assert.match(service, /^TimeoutStartSec=30m$/m);
  assert.match(service, /cli\.js --scheduled/);
  assert.match(service, /^Environment=GAME_DATA_AUDIT_CODEX_ENABLED=auto$/m);
  assert.doesNotMatch(service, /deploy|git\s+push|docker/);
  assert.match(timer, /^OnCalendar=hourly$/m);
  assert.match(timer, /^AccuracySec=1m$/m);
  assert.doesNotMatch(timer, /^RandomizedDelaySec=/m);
  assert.match(timer, /^Persistent=true$/m);
});

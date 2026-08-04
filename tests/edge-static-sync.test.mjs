import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const sync = readFileSync(join(root, 'deploy/arena-static-sync.sh'), 'utf8');
const activate = readFileSync(join(root, 'deploy/activate-arena-static.sh'), 'utf8');
const service = readFileSync(join(root, 'deploy/systemd/arena-static-sync.service'), 'utf8');
const timer = readFileSync(join(root, 'deploy/systemd/arena-static-sync.timer'), 'utf8');

assert.match(sync, /\^\[a-f0-9\]\{40\}\$/,
  'only immutable full release SHAs may be synchronized');
assert.match(sync, /readlink -f '\$remote_root\/current'/,
  'the current edge release must be checked before starting rsync');
assert.match(sync, /Static assets already current/,
  'an already-current edge must exit its iteration without a full tree scan');
assert.match(sync, /--link-dest="\$remote_root\/current"/,
  'new edge versions must hard-link unchanged files from the active version');
assert.match(sync, /--delay-updates/,
  'changed files must only become visible in the inactive version after transfer');
assert.match(sync, /activate-arena-static activate/,
  'a completed inactive version must use the guarded atomic activator');
assert.doesNotMatch(sync, /StrictHostKeyChecking=(?:no|accept-new)/,
  'edge synchronization must never weaken SSH host verification');

assert.match(activate, /test -s "\$dist\/index\.html"/,
  'activation must require the release entry document');
assert.match(activate, /files < 5000 \|\| bytes < 100000000/,
  'activation must reject an incomplete static tree');
assert.match(activate, /mv -Tf "\$temporary_link" "\$root\/current"/,
  'the active static version must switch atomically');
assert.match(activate, /nginx -t/,
  'the activated release must preserve a valid nginx configuration');

assert.match(service, /ExecStart=\/usr\/local\/sbin\/sync-arena-static/);
assert.match(service, /IOSchedulingClass=best-effort/,
  'background synchronization must not compete with visitor traffic');
assert.match(timer, /OnUnitActiveSec=3m/,
  'regional convergence must remain bounded to a few minutes');
assert.match(timer, /RandomizedDelaySec=30s/,
  'regional synchronization must avoid a fixed thundering-herd schedule');

console.log('edge static delta synchronization contracts passed');

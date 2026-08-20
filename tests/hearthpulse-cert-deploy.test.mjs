import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('deploy/deploy-hearthpulse-cert.sh', 'utf8');

assert.match(source, /expected_lineage=\/etc\/letsencrypt\/live\/hearthpulse\.net/);
assert.match(source, /StrictHostKeyChecking=yes/);
assert.match(source, /BatchMode=yes/);
assert.doesNotMatch(source, /StrictHostKeyChecking=(?:no|accept-new)/);
assert.match(source, /194\.67\.92\.242/);
assert.match(source, /186\.246\.28\.244/);
assert.match(source, /162\.19\.220\.14/);
assert.match(source, /install -o root -g root -m 0600/,
  'the private key must remain root-only on every edge');
assert.match(source, /nginx -t/);
assert.match(source, /systemctl reload nginx/);
assert.match(source, /ssh\s+"\$\{options\[@\]\}"\s+"\$target"\s+bash\s+-s/,
  'the remote installer uses Bash syntax and must explicitly run with Bash');
assert.match(source, /\[\[ "\$privilege" != none \]\]/,
  'root targets use a non-empty sentinel so SSH preserves all positional arguments');
assert.match(source, /root@194\.67\.92\.242[^\n]+none/);
assert.match(source, /root@186\.246\.28\.244[^\n]+none/);

console.log('HearthPulse certificate deployment contract passed');

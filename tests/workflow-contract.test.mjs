import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/scrape.yml', 'utf8');
const deployment = readFileSync('DEPLOYMENT.md', 'utf8');

assert.match(workflow, /name:\s*Validate scraper manually/);
assert.match(workflow, /workflow_dispatch:/);
assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
assert.match(workflow, /hs-arena-scraper\.timer/);
assert.doesNotMatch(workflow, /^\s*schedule:/m);
assert.doesNotMatch(workflow, /\bgit\s+(?:add|commit|push)\b/);
assert.doesNotMatch(workflow, /contents:\s*write/);

assert.match(deployment, /shared\/server-data/);
assert.match(deployment, /hs-arena-scraper\.timer/);

console.log('scraper workflow ownership contract passed');

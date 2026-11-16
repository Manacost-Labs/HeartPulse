import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { createPublicSeoModel } from '../scripts/lib/public-seo-model.mjs';

const projectRoot = resolve(import.meta.dirname, '..');
const ORIGIN = 'https://hearthpulse.net';

/** A copy of what the model reads, so a test can edit a page's sources without touching the repository. */
function copyOfPublicSeoInputs() {
  const root = mkdtempSync(join(tmpdir(), 'hearthpulse-seo-fingerprints-'));
  for (const path of ['config/public-seo-pages.json', 'src/shared/seo/publicRouteInventory.json',
    'src/modules/helpCenter', 'src/modules/legalPages', 'src/modules/developerApi']) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    cpSync(join(projectRoot, path), join(root, path), { recursive: true });
  }
  return root;
}

const fingerprintsOf = root => createPublicSeoModel(root).staticPageFingerprints();
const changedPages = (before, after) => Object.keys(before).filter(url => before[url] !== after[url]).sort();

test('a rebuild of unchanged content gives the same fingerprints, in another directory and at another time', () => {
  const first = copyOfPublicSeoInputs();
  const second = copyOfPublicSeoInputs();
  try {
    assert.deepEqual(fingerprintsOf(first), fingerprintsOf(second));
    assert.ok(Object.keys(fingerprintsOf(first)).includes(`${ORIGIN}/faq/`));
  } finally {
    rmSync(first, { recursive: true, force: true });
    rmSync(second, { recursive: true, force: true });
  }
});

test('a page text change moves the fingerprint of that page only', () => {
  const root = copyOfPublicSeoInputs();
  try {
    const before = fingerprintsOf(root);
    const faqFile = join(root, 'src/modules/helpCenter/public.ts');
    writeFileSync(faqFile, `${readFileSync(faqFile, 'utf8')}\n// text edit\n`);
    const afterFaq = fingerprintsOf(root);
    assert.deepEqual(changedPages(before, afterFaq), [`${ORIGIN}/faq/`]);

    const legalFile = join(root, 'src/modules/legalPages/content.json');
    writeFileSync(legalFile, `${readFileSync(legalFile, 'utf8').trimEnd()}\n\n`);
    assert.deepEqual(changedPages(afterFaq, fingerprintsOf(root)), [`${ORIGIN}/privacy/`, `${ORIGIN}/terms/`],
      'the legal texts share one source: an edit of it dates both pages');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a change of the registry record moves the fingerprint of that page only', () => {
  const root = copyOfPublicSeoInputs();
  try {
    const before = fingerprintsOf(root);
    const registryFile = join(root, 'config/public-seo-pages.json');
    const registry = JSON.parse(readFileSync(registryFile, 'utf8'));
    registry.pages['/tierlist'].description = `${registry.pages['/tierlist'].description} Дополнено.`;
    writeFileSync(registryFile, JSON.stringify(registry));
    assert.deepEqual(changedPages(before, fingerprintsOf(root)), [`${ORIGIN}/tierlist/`]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

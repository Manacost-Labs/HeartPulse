import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { renderPublicPageTexts } from '../scripts/lib/public-page-texts.mjs';
import { createPublicSeoModel } from '../scripts/lib/public-seo-model.mjs';

const projectRoot = resolve(import.meta.dirname, '..');
const ORIGIN = 'https://hearthpulse.net';
const PAGE_MODULES = ['helpCenter', 'legalPages', 'developerApi'];

/**
 * A tree the page renderer can run in: the page modules and the registry are
 * copies a test can edit; everything they import is the repository's own.
 */
function copyOfPublicSeoInputs() {
  const root = mkdtempSync(join(tmpdir(), 'hearthpulse-seo-fingerprints-'));
  for (const path of ['config/public-seo-pages.json', 'tsconfig.json', 'package.json']) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    cpSync(join(projectRoot, path), join(root, path));
  }
  for (const path of ['node_modules', 'shared']) symlinkSync(join(projectRoot, path), join(root, path));
  mkdirSync(join(root, 'src/modules'), { recursive: true });
  for (const entry of readdirSync(join(projectRoot, 'src'))) {
    if (entry !== 'modules') symlinkSync(join(projectRoot, 'src', entry), join(root, 'src', entry));
  }
  for (const entry of readdirSync(join(projectRoot, 'src/modules'))) {
    const source = join(projectRoot, 'src/modules', entry);
    if (PAGE_MODULES.includes(entry)) cpSync(source, join(root, 'src/modules', entry), { recursive: true });
    else symlinkSync(source, join(root, 'src/modules', entry));
  }
  return root;
}

/** Applies `edit` to a file of the copy; the edit must change it. */
function editFile(root, path, edit) {
  const file = join(root, path);
  const before = readFileSync(file, 'utf8');
  const after = edit(before);
  assert.notEqual(after, before, `the edit of ${path} changed nothing`);
  writeFileSync(file, after);
}

const fingerprintsOf = root => createPublicSeoModel(root).staticPageFingerprints(renderPublicPageTexts(root));
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

test('an edit that leaves the visible text alone does not move any fingerprint', () => {
  const root = copyOfPublicSeoInputs();
  try {
    const before = fingerprintsOf(root);
    editFile(root, 'src/modules/helpCenter/model/accountHelp.ts', source => `// A note for maintainers.\n${source.replace(
      "{ id: 'register',", "{\n        id: 'register', /* kept in step with the form */")}`);
    editFile(root, 'src/modules/legalPages/content.json', source => JSON.stringify(JSON.parse(source), null, 4));
    editFile(root, 'src/modules/developerApi/ui/DeveloperApiPage.tsx', source => `/** Unused note. */\n${source.replace('export function', '\n\nexport function')}`);
    assert.deepEqual(changedPages(before, fingerprintsOf(root)), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a change of the visible text moves the fingerprint of that page only', () => {
  const root = copyOfPublicSeoInputs();
  try {
    const before = fingerprintsOf(root);
    editFile(root, 'src/modules/helpCenter/model/accountHelp.ts',
      source => source.replace("question: 'Как зарегистрироваться?'", "question: 'Как создать аккаунт?'"));
    const afterFaq = fingerprintsOf(root);
    assert.deepEqual(changedPages(before, afterFaq), [`${ORIGIN}/faq/`]);

    editFile(root, 'src/modules/legalPages/content.json',
      source => source.replace('Политика объясняет, какие данные', 'Политика объясняет, какие сведения'));
    const afterLegal = fingerprintsOf(root);
    assert.deepEqual(changedPages(afterFaq, afterLegal), [`${ORIGIN}/privacy/`],
      'a paragraph of the privacy policy is not on the terms page');

    editFile(root, 'src/modules/developerApi/ui/DeveloperApiPage.tsx',
      source => source.replace('Версионированный доступ', 'Стабильный доступ'));
    assert.deepEqual(changedPages(afterLegal, fingerprintsOf(root)), [`${ORIGIN}/developers/api/`]);
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

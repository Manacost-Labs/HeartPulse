import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(path, 'utf8');

test('Storybook scripts and development dependencies are pinned', () => {
  const packageJson = JSON.parse(read('package.json'));

  assert.equal(
    packageJson.scripts.storybook,
    'STORYBOOK_DISABLE_TELEMETRY=1 storybook dev -p 6006 --no-open',
  );
  assert.equal(
    packageJson.scripts['build-storybook'],
    'STORYBOOK_DISABLE_TELEMETRY=1 storybook build',
  );
  assert.equal(
    packageJson.scripts['test:storybook'],
    'node --test tests/storybook-mcp-contract.test.mjs',
  );
  assert.match(
    packageJson.scripts['verify:ci'],
    /npm run test:storybook && npm run build-storybook/,
  );

  for (const dependency of [
    'storybook',
    '@storybook/react-vite',
    '@storybook/addon-a11y',
    '@storybook/addon-docs',
    '@storybook/addon-mcp',
  ]) {
    assert.match(packageJson.devDependencies[dependency], /^\d+\.\d+\.\d+$/);
  }
});

test('Storybook uses the React Vite framework and official MCP addon', () => {
  const main = read('.storybook/main.ts');
  const preview = read('.storybook/preview.tsx');

  assert.match(main, /framework:\s*['"]@storybook\/react-vite['"]/);
  assert.match(main, /['"]@storybook\/addon-docs['"]/);
  assert.match(main, /['"]@storybook\/addon-a11y['"]/);
  assert.match(main, /['"]@storybook\/addon-mcp['"]/);
  assert.match(main, /staticDirs:\s*\[['"]\.\.\/public['"]\]/);
  assert.match(main, /test:\s*false/);
  assert.match(preview, /import ['"]\.\.\/src\/index\.css['"]/);
});

test('project MCP configuration registers the local Storybook endpoint', () => {
  const config = JSON.parse(read('.mcp.json'));

  assert.deepEqual(config.mcpServers.storybook, {
    type: 'http',
    url: 'http://127.0.0.1:6006/mcp',
  });
});

test('at least one authored component story is colocated with its component', () => {
  assert.equal(existsSync('src/components/FAQSection.stories.tsx'), true);
  assert.match(read('knip.json'), /\.storybook\/\*\*\/\*\.\{ts,tsx\}/);
});

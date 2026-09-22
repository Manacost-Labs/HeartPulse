import assert from 'node:assert/strict';
import test from 'node:test';
import { auditAdminWorkspaceAssets } from '../scripts/lib/initial-asset-audit.mjs';

test('detects administrator shell leaks through transitive eager assets', () => {
  const manifest = {
    'index.html': {
      file: 'assets/index-main.js',
      src: 'index.html',
      isEntry: true,
      imports: ['_vendor.js', '_eager-admin.js'],
      dynamicImports: ['src/modules/adminWorkspace/AdminWorkspaceShell.lazy.ts'],
      css: ['assets/index-main.css'],
    },
    '_vendor.js': {
      file: 'assets/vendor-react.js',
    },
    '_eager-admin.js': {
      file: 'assets/admin-eager.js',
      imports: ['_eager-admin-styles.js'],
    },
    '_eager-admin-styles.js': {
      file: 'assets/admin-styles.js',
      css: ['assets/admin-eager.css'],
    },
    'src/modules/adminWorkspace/AdminWorkspaceShell.lazy.ts': {
      file: 'assets/AdminWorkspaceShell.lazy.js',
      src: 'src/modules/adminWorkspace/AdminWorkspaceShell.lazy.ts',
      isDynamicEntry: true,
      css: ['assets/AdminWorkspaceShell.css'],
    },
  };
  const html = [
    '<script type="module" src="/assets/index-main.js"></script>',
    '<link rel="modulepreload" href="/assets/vendor-react.js">',
    '<link rel="stylesheet" href="/assets/manual-admin.css">',
  ].join('');
  const sources = new Map([
    ['assets/index-main.js', 'const application = true;'],
    ['assets/vendor-react.js', 'const react = true;'],
    ['assets/admin-eager.js', 'const landmark = "admin-primary-navigation";'],
    ['assets/admin-styles.js', 'const styles = true;'],
    ['assets/index-main.css', ':root{color-scheme:dark}'],
    ['assets/admin-eager.css', '.shell{--admin-nav-w:280px}'],
    ['assets/manual-admin.css', '.manual{--admin-nav-w:280px}'],
  ]);

  const result = auditAdminWorkspaceAssets({
    manifest,
    html,
    readAsset: asset => sources.get(asset) ?? assert.fail(`unexpected asset ${asset}`),
  });

  assert.deepEqual(result.leaks.js, ['assets/admin-eager.js']);
  assert.deepEqual(result.leaks.css, [
    'assets/admin-eager.css',
    'assets/manual-admin.css',
  ]);
  assert.ok(!result.initial.js.includes('assets/AdminWorkspaceShell.lazy.js'));
  assert.ok(!result.initial.css.includes('assets/AdminWorkspaceShell.css'));
  assert.deepEqual(result.shell, {
    js: ['assets/AdminWorkspaceShell.lazy.js'],
    css: ['assets/AdminWorkspaceShell.css'],
  });
});

test('fails closed when a static manifest import is missing', () => {
  assert.throws(
    () => auditAdminWorkspaceAssets({
      manifest: {
        'index.html': {
          file: 'assets/index.js',
          src: 'index.html',
          isEntry: true,
          imports: ['_missing.js'],
        },
      },
      html: '',
      readAsset: () => '',
    }),
    /missing static import/i,
  );
});

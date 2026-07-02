import { readdirSync, statSync } from 'fs';
import { join } from 'path';

const distAssets = join(process.cwd(), 'dist', 'assets');

const budgets = {
  mainJs: Number(process.env.BUDGET_MAIN_JS_BYTES || 250_000),
  routeJs: Number(process.env.BUDGET_ROUTE_JS_BYTES || 180_000),
  css: Number(process.env.BUDGET_CSS_BYTES || 95_000),
};

const files = readdirSync(distAssets)
  .map(name => ({ name, bytes: statSync(join(distAssets, name)).size }))
  .sort((a, b) => b.bytes - a.bytes);

const mainJs = files.find(file =>
  /^index-.*\.js$/.test(file.name)
  && !file.name.startsWith('vendor-')
);
const routeJs = files.filter(file =>
  /\.js$/.test(file.name)
  && !/^index-/.test(file.name)
  && !file.name.startsWith('vendor-')
);
const css = files.find(file => /^index-.*\.css$/.test(file.name));

const checks = [
  ['initial JS', mainJs, budgets.mainJs],
  ['largest route JS', routeJs[0], budgets.routeJs],
  ['CSS', css, budgets.css],
];

let failed = false;
for (const [label, file, budget] of checks) {
  if (!file) {
    console.error(`[budget] missing ${label} asset`);
    failed = true;
    continue;
  }
  const ok = file.bytes <= budget;
  const status = ok ? 'ok' : 'over';
  console.log(`[budget] ${status} ${label}: ${file.name} ${file.bytes} / ${budget} bytes`);
  if (!ok) failed = true;
}

console.log('[budget] target note: initial public JS goal is 180-220 KB raw after the next data-hook extraction pass.');

if (failed) process.exit(1);

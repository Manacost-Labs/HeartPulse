import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const moduleBudgets = [
  {
    path: 'scripts/check-module-boundaries.mjs',
    maxLines: 284,
    owner: 'module-boundary analysis and CLI facade',
  },
  {
    path: 'scripts/lib/diagnostic-text-policy.mjs',
    maxLines: 19,
    owner: 'single-line diagnostic text policy',
  },
  {
    path: 'scripts/lib/module-boundary-contracts.mjs',
    maxLines: 16,
    owner: 'module boundary canonical contracts',
  },
  {
    path: 'scripts/lib/module-boundary-edges.mjs',
    maxLines: 20,
    owner: 'module boundary stable edge identities',
  },
  {
    path: 'scripts/lib/repository-path-policy.mjs',
    maxLines: 147,
    owner: 'repository path and realpath safety',
  },
  {
    path: 'scripts/lib/module-inventory.mjs',
    maxLines: 275,
    owner: 'module inventory loading and ownership selection',
  },
  {
    path: 'scripts/lib/module-boundary-exceptions.mjs',
    maxLines: 173,
    owner: 'module boundary exception policy',
  },
  {
    path: 'scripts/lib/module-inventory-validation.mjs',
    maxLines: 588,
    owner: 'module inventory metadata validation',
  },
  {
    path: 'scripts/lib/module-import-graph.mjs',
    maxLines: 241,
    owner: 'module import resolution graph',
  },
  {
    path: 'scripts/lib/module-import-parser.mjs',
    maxLines: 123,
    owner: 'module import parser',
  },
  {
    path: 'scripts/lib/module-boundary-source-scan.mjs',
    maxLines: 99,
    owner: 'module boundary source scanners',
  },
  {
    path: 'scripts/lib/module-boundary-graph.mjs',
    maxLines: 76,
    owner: 'module boundary cycle graph',
  },
  {
    path: 'scripts/lib/module-boundary-report.mjs',
    maxLines: 22,
    owner: 'module boundary report formatter',
  },
  {
    path: 'server/index.ts',
    maxLines: 9_752,
    owner: 'server composition root',
  },
  {
    path: 'src/features/DeferredRoutes.tsx',
    maxLines: 3_226,
    owner: 'Arena route bundle',
  },
  {
    path: 'src/modules/identity/ui/LoginPanel.tsx',
    maxLines: 1_071,
    owner: 'identity platform',
  },
  {
    path: 'src/features/Contests.tsx',
    maxLines: 1_700,
    owner: 'administrator workspace composition',
  },
  {
    path: 'src/features/Battlegrounds.tsx',
    maxLines: 4_343,
    owner: 'Battlegrounds routes',
  },
  {
    path: 'src/App.tsx',
    maxLines: 1_690,
    owner: 'application shell',
  },
  {
    path: 'server/constructedCardRoutes.ts',
    maxLines: 1_234,
    owner: 'constructed-card API',
  },
  {
    path: 'src/features/StandardCards.tsx',
    maxLines: 1_560,
    owner: 'constructed-card UI',
  },
];

let failed = false;

for (const budget of moduleBudgets) {
  const source = readFileSync(resolve(process.cwd(), budget.path), 'utf8');
  const lines = source.endsWith('\n')
    ? source.slice(0, -1).split('\n').length
    : source.split('\n').length;
  const status = lines <= budget.maxLines ? 'ok' : 'over';
  console.log(
    `[module-size] ${status} ${budget.path}: ${lines} / ${budget.maxLines} lines (${budget.owner})`,
  );
  if (lines > budget.maxLines) failed = true;
}

if (failed) {
  console.error(
    '[module-size] A ratcheted architecture hotspot grew. Extract a focused unit or deliberately revise the owning boundary before merging.',
  );
  process.exit(1);
}

console.log('[module-size] hotspot budgets are ratcheted at or below the production baseline.');

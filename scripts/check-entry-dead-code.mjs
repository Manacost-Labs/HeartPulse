import { relative, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists, 'tsconfig.json');
if (!configPath) throw new Error('tsconfig.json not found');

const config = ts.readConfigFile(configPath, ts.sys.readFile);
if (config.error) {
  throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
}

const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd(), {
  noEmit: true,
  noUnusedLocals: true,
  noUnusedParameters: true,
});
const program = ts.createProgram(parsed.fileNames, parsed.options);
const entryFiles = new Set([
  'src/App.tsx',
  'src/main.tsx',
  'src/routes.ts',
  'src/features/Home.tsx',
  'src/components/AuthAvatar.tsx',
  'src/hooks/usePageScrollLock.ts',
]);
const unusedCodes = new Set([6133, 6196]);
const diagnostics = ts.getPreEmitDiagnostics(program).filter(diagnostic => {
  if (!diagnostic.file || !unusedCodes.has(diagnostic.code)) return false;
  const file = relative(process.cwd(), resolve(diagnostic.file.fileName)).replaceAll('\\', '/');
  return entryFiles.has(file);
});

if (diagnostics.length) {
  const host = {
    getCanonicalFileName: fileName => fileName,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n',
  };
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, host));
  process.exit(1);
}

const deferredRoutesSource = readFileSync('src/features/DeferredRoutes.tsx', 'utf8');
if (/export\s+function\s+AdminPanel\b/.test(deferredRoutesSource)) {
  console.error('[entry-dead-code] retired DeferredRoutes.AdminPanel export returned to the production graph');
  process.exit(1);
}

console.log(`[entry-dead-code] ${entryFiles.size} initial-shell modules have no unused declarations or parameters; retired lazy AdminPanel export is absent`);

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
const retiredDeferredAdminSymbols = [
  'AdminForm',
  'AdminSectionId',
  'AdminUserListItem',
  'BoostySubscriberRow',
  'BoostySubscribersPayload',
  'BoostyAdminStatus',
  'EMPTY_FORM',
  'ADMIN_SECTIONS',
  'getInitialAdminSection',
  'ADMIN_INPUT',
  'AdminStatCard',
  'AdminArticleRow',
  'AdminPanel',
];
const returnedAdminSymbols = retiredDeferredAdminSymbols.filter(symbol => (
  new RegExp(`\\b(?:const|function|interface|type)\\s+${symbol}\\b`).test(deferredRoutesSource)
));

if (returnedAdminSymbols.length > 0) {
  console.error(`[entry-dead-code] retired DeferredRoutes admin declarations returned: ${returnedAdminSymbols.join(', ')}`);
  process.exit(1);
}

const appSource = readFileSync('src/App.tsx', 'utf8');
const contestsSource = readFileSync('src/features/Contests.tsx', 'utf8');
if (!/module\.ContestAdminPanel\b/.test(appSource) || !/export\s+function\s+ContestAdminPanel\b/.test(contestsSource)) {
  console.error('[entry-dead-code] live ContestAdminPanel route contract is missing');
  process.exit(1);
}

console.log(`[entry-dead-code] ${entryFiles.size} initial-shell modules have no unused declarations or parameters; retired deferred admin code is absent and ContestAdminPanel remains wired`);

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { analyzeModuleBoundaries } from '../scripts/check-module-boundaries.mjs';
import type {
  BattlegroundHeroMmr,
  BattlegroundHeroMode,
  BattlegroundHeroRelatedCard,
  BattlegroundHeroSortDirection,
  BattlegroundHeroSortKey,
  BattlegroundHeroTierEntry,
  BattlegroundHeroTierSection,
} from '../src/modules/battlegrounds/public';

type Same<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? (<Value>() => Value extends Right ? 1 : 2) extends
      (<Value>() => Value extends Left ? 1 : 2)
      ? true
      : false
    : false;
type Expect<Condition extends true> = Condition;

type ExpectedHeroRelatedCard = {
  dbf?: number | null;
  name: string;
  text?: string;
  image?: string | null;
  imageGold?: string | null;
  cropImage?: string | null;
};
type ExpectedHeroTierEntry = {
  name: string;
  originalName?: string;
  popularity?: string;
  averagePlace?: string;
  image: string;
  dbfId?: number;
  placementDistribution?: string[];
  bestComposition?: string;
  bestCompositionId?: number;
  sourceId?: string;
  heroPower?: ExpectedHeroRelatedCard | null;
};
type ExpectedHeroTierSection = {
  tier: string;
  title?: string;
  heroes: ExpectedHeroTierEntry[];
};

type HeroModeContract = Expect<Same<BattlegroundHeroMode, 'solo' | 'duos'>>;
type HeroMmrContract = Expect<Same<
  BattlegroundHeroMmr,
  'TOP_50_PERCENT' | 'TOP_20_PERCENT' | 'TOP_5_PERCENT' | 'TOP_1_PERCENT'
>>;
type HeroSortKeyContract = Expect<Same<
  BattlegroundHeroSortKey,
  'tier' | 'pickRate' | 'averagePlace'
>>;
type HeroSortDirectionContract = Expect<Same<BattlegroundHeroSortDirection, 'asc' | 'desc'>>;
type HeroRelatedCardContract = Expect<Same<BattlegroundHeroRelatedCard, ExpectedHeroRelatedCard>>;
type HeroTierEntryContract = Expect<Same<BattlegroundHeroTierEntry, ExpectedHeroTierEntry>>;
type HeroTierSectionContract = Expect<Same<BattlegroundHeroTierSection, ExpectedHeroTierSection>>;

const CONTRACT_NAMES = [
  'BattlegroundHeroMmr',
  'BattlegroundHeroMode',
  'BattlegroundHeroRelatedCard',
  'BattlegroundHeroSortDirection',
  'BattlegroundHeroSortKey',
  'BattlegroundHeroTierEntry',
  'BattlegroundHeroTierSection',
] as const;
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parsedSource(relativePath: string, scriptKind: ts.ScriptKind): ts.SourceFile {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  return ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, scriptKind);
}

const publicEntry = parsedSource('../src/modules/battlegrounds/public.ts', ts.ScriptKind.TS);
const publicNames: string[] = [];
for (const statement of publicEntry.statements) {
  assert.ok(
    ts.isExportDeclaration(statement)
      && statement.isTypeOnly
      && statement.exportClause
      && ts.isNamedExports(statement.exportClause),
    'the Battlegrounds public entry must contain named type-only exports and no runtime statements',
  );
  publicNames.push(...statement.exportClause.elements.map(element => element.name.text));
}
assert.deepEqual(publicNames.sort(), [...CONTRACT_NAMES],
  'the Battlegrounds public entry must expose exactly the seven hero catalog contracts');

const heroCatalogModel = parsedSource(
  '../src/modules/battlegrounds/model/heroCatalog.ts',
  ts.ScriptKind.TS,
);
const modelNames: string[] = [];
for (const statement of heroCatalogModel.statements) {
  assert.ok(
    ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement),
    'the hero catalog model must contain only type declarations',
  );
  assert.ok(
    statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword),
    'every hero catalog declaration must be exported through the module contract',
  );
  modelNames.push(statement.name.text);
}
assert.deepEqual(modelNames.sort(), [...CONTRACT_NAMES],
  'the hero catalog model must own exactly the seven public contracts');

function assertConsumerImports(
  relativePath: string,
  expectedNames: readonly string[],
): ts.SourceFile {
  const sourceFile = parsedSource(relativePath, ts.ScriptKind.TSX);
  const importedNames: string[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)
      || !ts.isStringLiteral(statement.moduleSpecifier)
      || statement.moduleSpecifier.text !== '../modules/battlegrounds/public') continue;

    assert.ok(statement.importClause?.isTypeOnly,
      `${relativePath} must use a type-only Battlegrounds public import`);
    assert.ok(statement.importClause.namedBindings
      && ts.isNamedImports(statement.importClause.namedBindings),
    `${relativePath} must name every consumed Battlegrounds contract`);
    importedNames.push(...statement.importClause.namedBindings.elements.map(element => element.name.text));
  }

  assert.deepEqual(importedNames.sort(), [...expectedNames].sort(),
    `${relativePath} must consume the exact Battlegrounds contracts it needs`);

  const localContractNames: string[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node))
      && CONTRACT_NAMES.includes(node.name.text as typeof CONTRACT_NAMES[number])) {
      localContractNames.push(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  assert.deepEqual(localContractNames, [],
    `${relativePath} must not redeclare module-owned Battlegrounds contracts`);

  return sourceFile;
}

assertConsumerImports('../src/features/Battlegrounds.tsx', CONTRACT_NAMES);
const ledgerSource = assertConsumerImports(
  '../src/features/BattlegroundHeroLedger.tsx',
  CONTRACT_NAMES.filter(name => name !== 'BattlegroundHeroRelatedCard'),
);
assert.equal(
  ledgerSource.statements.some(statement => (
    ts.isImportDeclaration(statement)
      && ts.isStringLiteral(statement.moduleSpecifier)
      && statement.moduleSpecifier.text === './Battlegrounds'
  )),
  false,
  'the hero ledger must not import back from its runtime owner',
);

const battlegroundPublicEdges = analyzeModuleBoundaries({ rootDir: PROJECT_ROOT }).edges
  .filter(edge => edge.target === 'src/modules/battlegrounds/public.ts')
  .map(({ source, target, kind }) => ({ source, target, kind }));
assert.deepEqual(battlegroundPublicEdges, [
  {
    source: 'src/features/BattlegroundHeroLedger.tsx',
    target: 'src/modules/battlegrounds/public.ts',
    kind: 'type',
  },
  {
    source: 'src/features/Battlegrounds.tsx',
    target: 'src/modules/battlegrounds/public.ts',
    kind: 'type',
  },
], 'the canonical module graph must contain only the two intended type edges to the public entry');

console.log('Battleground hero catalog contracts passed');

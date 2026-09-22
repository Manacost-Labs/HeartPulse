import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { analyzeModuleBoundaries } from '../scripts/check-module-boundaries.mjs';
import {
  battlegroundHeroRosterBridgeV1,
  type BattlegroundHeroMmr,
  type BattlegroundHeroMode,
  type BattlegroundHeroRelatedCard,
  type BattlegroundHeroSortDirection,
  type BattlegroundHeroSortKey,
  type BattlegroundHeroTierEntry,
  type BattlegroundHeroTierSection,
} from '../src/modules/battlegrounds/public';
import type {
  BattlegroundHeroRosterResolution,
  BattlegroundHeroRosterResolverInput,
} from '../src/modules/battlegrounds/model/heroRosterResolver';

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
const RUNTIME_CONTRACT_NAMES = [
  'battlegroundFullCardImage',
  'battlegroundHeroCardImage',
  'battlegroundHeroRosterBridgeV1',
  'preferredBattlegroundGoldenBuddyImage',
  'preferredBattlegroundHeroImage',
] as const;
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parsedSource(relativePath: string, scriptKind: ts.ScriptKind): ts.SourceFile {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  return ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, scriptKind);
}

const publicEntry = parsedSource('../src/modules/battlegrounds/public.ts', ts.ScriptKind.TS);
const publicTypeNames: string[] = [];
const publicRuntimeNames: string[] = [];
for (const statement of publicEntry.statements) {
  assert.ok(
    ts.isExportDeclaration(statement)
      && statement.exportClause
      && ts.isNamedExports(statement.exportClause),
    'the Battlegrounds public entry must contain only explicit named exports',
  );
  const destination = statement.isTypeOnly ? publicTypeNames : publicRuntimeNames;
  destination.push(...statement.exportClause.elements.map(element => element.name.text));
}
assert.deepEqual(publicTypeNames.sort(), [...CONTRACT_NAMES],
  'the Battlegrounds public entry must expose exactly the seven hero catalog contracts');
assert.deepEqual(publicRuntimeNames.sort(), [...RUNTIME_CONTRACT_NAMES],
  'the Battlegrounds public entry must expose exactly the hero image policy and legacy bridge');

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
  expectedTypeNames: readonly string[],
  expectedRuntimeNames: readonly string[] = [],
): ts.SourceFile {
  const sourceFile = parsedSource(relativePath, ts.ScriptKind.TSX);
  const importedTypeNames: string[] = [];
  const importedRuntimeNames: string[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)
      || !ts.isStringLiteral(statement.moduleSpecifier)
      || statement.moduleSpecifier.text !== '../modules/battlegrounds/public') continue;

    assert.ok(statement.importClause.namedBindings
      && ts.isNamedImports(statement.importClause.namedBindings),
    `${relativePath} must name every consumed Battlegrounds contract`);
    for (const element of statement.importClause.namedBindings.elements) {
      const destination = statement.importClause.isTypeOnly || element.isTypeOnly
        ? importedTypeNames
        : importedRuntimeNames;
      destination.push(element.name.text);
    }
  }

  assert.deepEqual(importedTypeNames.sort(), [...expectedTypeNames].sort(),
    `${relativePath} must consume the exact Battlegrounds type contracts it needs`);
  assert.deepEqual(importedRuntimeNames.sort(), [...expectedRuntimeNames].sort(),
    `${relativePath} must consume the exact Battlegrounds runtime contracts it needs`);

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

assertConsumerImports('../src/features/Battlegrounds.tsx', CONTRACT_NAMES, RUNTIME_CONTRACT_NAMES);
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
    kind: 'runtime',
  },
], 'the canonical module graph must contain only the two intended edges to the public entry');

function statsHeroes(count: number): unknown {
  return {
    ok: true,
    view: {
      heroes: Array.from({ length: count }, (_, index) => ({
        dbfId: index + 1,
        hero: `Current hero ${index + 1}`,
        tier: index % 2 === 0 ? 'S' : 'A',
        avg_placement: String(4 + index / 100),
        image: `/current-${index + 1}.png`,
      })),
    },
  };
}

function fallbackHeroes(count: number): BattlegroundHeroTierSection[] {
  return [{
    tier: 'D',
    title: 'D Тир',
    heroes: Array.from({ length: count }, (_, index) => ({
      name: `Fallback hero ${index + 1}`,
      image: `/fallback-${index + 1}.png`,
    })),
  }];
}

type InstalledHeroRosterBridge = Readonly<{
  version: 1;
  publicResourceUrl: (value: unknown) => string;
  resolve: (
    input: Omit<BattlegroundHeroRosterResolverInput, 'publicResourceUrl'>,
  ) => BattlegroundHeroRosterResolution;
}>;

assert.equal(battlegroundHeroRosterBridgeV1.version, 1);
assert.ok(Object.isFrozen(battlegroundHeroRosterBridgeV1));
const bridgeTarget: Record<string, unknown> = {};
const testPublicResourceUrl = (value: unknown) => String(value || '').replace(
  'https://hearthstone.wiki.gg',
  '/api/public-resource/wiki',
);
battlegroundHeroRosterBridgeV1.install(bridgeTarget, {
  publicResourceUrl: testPublicResourceUrl,
});
const installedBridge = bridgeTarget
  .__hsArenaBattlegroundHeroRosterBridgeV1 as InstalledHeroRosterBridge;
assert.equal(installedBridge.version, 1);
assert.ok(Object.isFrozen(installedBridge), 'the installed V1 port must be immutable');
assert.deepEqual(
  Object.keys(installedBridge).sort(),
  ['publicResourceUrl', 'resolve', 'version'],
  'the installed V1 port must expose only the operations consumed by classic builders',
);
assert.equal(installedBridge.publicResourceUrl, testPublicResourceUrl);

for (const scenario of [
  { fallbackCount: 0, currentCount: 0, status: 'fallback', minimumCount: 1 },
  { fallbackCount: 0, currentCount: 1, status: 'accepted', minimumCount: 1 },
  { fallbackCount: 19, currentCount: 1, status: 'accepted', minimumCount: 1 },
  { fallbackCount: 20, currentCount: 14, status: 'fallback', minimumCount: 15 },
  { fallbackCount: 20, currentCount: 15, status: 'accepted', minimumCount: 15 },
  { fallbackCount: 101, currentCount: 75, status: 'fallback', minimumCount: 76 },
  { fallbackCount: 101, currentCount: 76, status: 'accepted', minimumCount: 76 },
] as const) {
  const fallback = fallbackHeroes(scenario.fallbackCount);
  const resolution = installedBridge.resolve({
    statsPayload: statsHeroes(scenario.currentCount),
    libraryPayload: { data: [] },
    fallbackSections: fallback,
  });
  assert.equal(resolution.status, scenario.status,
    `${scenario.currentCount}/${scenario.fallbackCount} must preserve the legacy truncation decision`);
  assert.equal(resolution.minimumCount, scenario.minimumCount);
  assert.equal(resolution.currentCount, scenario.currentCount);
  assert.equal(resolution.fallbackCount, scenario.fallbackCount);
  if (resolution.status === 'fallback') assert.equal(resolution.tiers, fallback);
}

const localizedResolution = installedBridge.resolve({
  statsPayload: {
    heroes: [{
      dbfId: 132608,
      hero: 'Nightmare Lord Xavius',
      tier: 's',
      pick_rate: '88.64%',
      avg_placement: '3.58',
      image: 'https://hearthstone.wiki.gg/images/BG36_HERO_105.png?f657db',
    }],
  },
  libraryPayload: {
    data: [{
      dbf: 132608,
      card_id: 'BG36_HERO_105',
      name: { ru: 'Повелитель кошмаров Ксавий', en: 'Nightmare Lord Xavius' },
      images: { hero: 'https://hearthstone.wiki.gg/images/BG36_HERO_105.png?f657db' },
    }],
  },
  fallbackSections: [],
});
assert.equal(localizedResolution.status, 'accepted');
assert.deepEqual(localizedResolution.tiers, [{
  tier: 'S',
  title: 'S Тир',
  heroes: [{
    name: 'Повелитель кошмаров Ксавий',
    englishName: 'Nightmare Lord Xavius',
    popularity: '88.64%',
    averagePlace: '3.58',
    image: '/api/public-resource/wiki/images/BG36_HERO_105.png?f657db',
    dbfId: 132608,
    cardId: 'BG36_HERO_105',
  }],
}]);

const firstInstalledBridge = installedBridge;
battlegroundHeroRosterBridgeV1.install(bridgeTarget, {
  publicResourceUrl: testPublicResourceUrl,
});
assert.equal(
  bridgeTarget.__hsArenaBattlegroundHeroRosterBridgeV1,
  firstInstalledBridge,
  'both builder owners must reuse the same process-lifetime port',
);

console.log('Battleground hero catalog contracts passed');

import { shortPatchVersion, type PatchNotesDetail, type PatchNotesEntry, type PatchNotesSummary } from './contract.js';
import { cleanArticleText, parsePatchArticle, type PatchCardResolver } from './parser.js';
import { createBattlegroundNameResolver, type BattlegroundCatalogCard } from './battlegroundCatalog.js';

type Row = Record<string, unknown>;
type CardName = { name?: unknown; playerClass?: unknown; type?: unknown };

export type PatchNotesServiceDependencies = {
  /** Reads hs-data-api `/api/patches?include_content=1`. */
  fetchJson: (url: string) => Promise<unknown>;
  patchesUrl: string;
  /** Russian collectible card names; an empty map leaves entries without pictures. */
  loadCardNames: () => Promise<Record<string, CardName>>;
  /** Battlegrounds catalog; without it Battlegrounds entries keep the article's names and no pictures. */
  loadBattlegroundCards?: () => Promise<BattlegroundCatalogCard[]>;
  /** Ids of today's Standard cards; without them Constructed entries have no format. */
  loadStandardCardIds?: () => Promise<Iterable<string>>;
  ttlMs: number;
  now?: () => number;
};

export type PatchNotesSnapshot = {
  patches: PatchNotesDetail[];
  updatedAt: string;
};

const text = (value: unknown) => {
  const result = String(value ?? '').trim();
  return result || null;
};

/** Only absolute http(s) links reach an `href`. */
const httpUrl = (value: unknown) => {
  const url = text(value);
  return url && /^https?:\/\//i.test(url) ? url : null;
};

const nameKey = (value: string) => value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[’‘`]/g, "'")
  .replace(/\s+/g, ' ').trim();

/** A name that belongs to cards of two classes is ambiguous and stays unresolved. */
export function createCardNameResolver(cards: Record<string, CardName>): PatchCardResolver {
  const byName = new Map<string, { id: string; cardClass: string | null; cardType: string | null } | null>();
  for (const [id, card] of Object.entries(cards)) {
    const name = typeof card?.name === 'string' ? nameKey(card.name) : '';
    if (!name) continue;
    const cardClass = typeof card.playerClass === 'string' ? card.playerClass : null;
    const cardType = typeof card.type === 'string' ? card.type.toLowerCase() : null;
    const known = byName.get(name);
    if (known === undefined) byName.set(name, { id, cardClass, cardType });
    else if (known && known.cardClass !== cardClass) byName.set(name, null);
    // Reprints share a name and class; the original set id keeps its art.
    else if (known && known.id.startsWith('CORE_') && !id.startsWith('CORE_')) byName.set(name, { id, cardClass, cardType });
  }
  return name => byName.get(nameKey(name)) ?? null;
}

/** Battlegrounds names resolve against the Battlegrounds catalog, every other mode against collectible cards. */
export function createPatchCardResolver(cards: Record<string, CardName>, battlegrounds: BattlegroundCatalogCard[]): PatchCardResolver {
  const collectible = createCardNameResolver(cards);
  const battleground = createBattlegroundNameResolver(battlegrounds);
  return (name, context) => (context?.mode === 'battlegrounds' ? battleground(name, context) : collectible(name, context));
}

function sections(value: unknown): { level?: unknown; title?: unknown }[] {
  return Array.isArray(value) ? value.filter(item => item && typeof item === 'object') : [];
}

function buildNumber(value: unknown): number {
  const match = String(value ?? '').match(/\d+\.\d+\.\d+\.(\d+)/);
  return match ? Number(match[1]) : 0;
}

function publishedAt(row: Row): string | null {
  return text(row.official_published_at) ?? text(row.published_at);
}

const titleVersions = (row: Row) => [...String(row.title ?? '').matchAll(/\d{1,3}\.\d{1,3}(?:\.\d{1,3})?/g)]
  .map(match => shortPatchVersion(match[0]));

/**
 * hs-data-api has matched some pre-release builds (2.3.0.8108) to a modern
 * article, which then shows up twice in the archive under a bogus version.
 * When builds of different versions share one article, the article belongs
 * to the version its title names, else to the highest version.
 */
export function dropForeignArticleBuilds(rows: Row[]): Row[] {
  const byArticle = new Map<string, Row[]>();
  for (const row of rows) {
    const url = text(row.source_url);
    if (url && row.match_state === 'matched') byArticle.set(url, [...(byArticle.get(url) ?? []), row]);
  }
  const foreign = new Set<Row>();
  for (const group of byArticle.values()) {
    if (new Set(group.map(row => shortPatchVersion(row.version))).size < 2) continue;
    const named = group.filter(row => titleVersions(row).includes(shortPatchVersion(row.version)));
    const owners = named.length ? named : [group.reduce((best, row) => (compareVersions(row.version, best.version) > 0 ? row : best))];
    for (const row of group) if (!owners.includes(row)) foreign.add(row);
  }
  return rows.filter(row => !foreign.has(row));
}

function compareVersions(left: unknown, right: unknown): number {
  const parts = (value: unknown) => (String(value ?? '').match(/\d+/g) ?? []).map(Number);
  const [a, b] = [parts(left), parts(right)];
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

/** A reprint resolves to its original id while the Standard catalog may list the `CORE_` copy. */
function withFormat(entry: PatchNotesEntry, standard: ReadonlySet<string>): PatchNotesEntry {
  if (entry.mode !== 'constructed' || !entry.cardId || standard.size === 0) return entry;
  const id = entry.cardId;
  return { ...entry, format: standard.has(id) || standard.has(`CORE_${id}`) || standard.has(id.replace(/^CORE_/, '')) ? 'standard' : 'wild' };
}

/** Parses every stored article once per refresh; the newest build of a version wins. */
export function buildPatchNotesSnapshot(
  rows: Row[], resolve: PatchCardResolver, updatedAt: string, standard: ReadonlySet<string> = new Set(),
): PatchNotesSnapshot {
  const newest = new Map<string, Row>();
  for (const row of dropForeignArticleBuilds(rows)) {
    const key = shortPatchVersion(row.version) || shortPatchVersion(row.hs_manacost_version);
    if (!key) continue;
    const known = newest.get(key);
    if (!known || buildNumber(row.version) > buildNumber(known.version)) newest.set(key, row);
  }
  const patches = [...newest.entries()].map(([version, row]): PatchNotesDetail => {
    const content = row.match_state === 'matched' ? String(row.content_text ?? '') : '';
    const parsed = content
      ? parsePatchArticle(content, sections(row.sections), resolve)
      : { entries: [], missingBefore: 0, pictureSections: [], generalChanges: [] };
    return {
      version,
      build: text(row.version) ?? version,
      title: text(row.title) ?? text(row.official_title) ?? `Обновление ${version}`,
      publishedAt: publishedAt(row),
      sourceUrl: httpUrl(row.source_url),
      officialUrl: httpUrl(row.official_url),
      changeCount: parsed.entries.length,
      // The stored summary runs on into the first heading; its first paragraph is the lead.
      summary: text(cleanArticleText(String(row.summary ?? '').split('\n').find(line => line.trim()) ?? '')),
      entries: parsed.entries.map(entry => withFormat(entry, standard)),
      missingBefore: parsed.missingBefore,
      pictureSections: parsed.pictureSections,
      generalChanges: parsed.generalChanges,
    };
  });
  // Undated patches sort last; NaN would make the comparator inconsistent.
  const time = (patch: PatchNotesDetail) => Date.parse(patch.publishedAt ?? '') || 0;
  patches.sort((left, right) => time(right) - time(left) || buildNumber(right.build) - buildNumber(left.build));
  return { patches, updatedAt };
}

export function patchNotesSummary(patch: PatchNotesDetail): PatchNotesSummary {
  const { version, build, title, publishedAt: date, sourceUrl, officialUrl, changeCount } = patch;
  return { version, build, title, publishedAt: date, sourceUrl, officialUrl, changeCount };
}

/**
 * Keeps one parsed snapshot for `ttlMs`. An expired snapshot is served at once
 * while one background refresh runs; a failed refresh is retried after
 * `retryMs`, not on every request. Only the very first read waits upstream.
 */
export function createPatchNotesService(dependencies: PatchNotesServiceDependencies & { retryMs?: number }) {
  const now = dependencies.now ?? Date.now;
  const retryMs = dependencies.retryMs ?? 60_000;
  let snapshot: { value: PatchNotesSnapshot; expiresAt: number } | null = null;
  let pending: Promise<PatchNotesSnapshot> | null = null;

  const refresh = async () => {
    const [payload, cards, battlegrounds, standard] = await Promise.all([
      dependencies.fetchJson(dependencies.patchesUrl),
      dependencies.loadCardNames().catch(() => ({})),
      (dependencies.loadBattlegroundCards?.() ?? Promise.resolve([])).catch(() => []),
      (dependencies.loadStandardCardIds?.() ?? Promise.resolve([])).catch(() => []),
    ]);
    const rows = (payload as { patches?: unknown })?.patches;
    if (!Array.isArray(rows)) throw new Error('Patch archive payload has no patches');
    const value = buildPatchNotesSnapshot(rows as Row[], createPatchCardResolver(cards, battlegrounds), new Date(now()).toISOString(),
      new Set(standard));
    snapshot = { value, expiresAt: now() + dependencies.ttlMs };
    return value;
  };
  const start = () => {
    pending ??= refresh().catch(error => {
      if (snapshot) snapshot = { ...snapshot, expiresAt: now() + retryMs };
      throw error;
    }).finally(() => { pending = null; });
    return pending;
  };

  return {
    async load(): Promise<PatchNotesSnapshot> {
      if (snapshot && snapshot.expiresAt > now()) return snapshot.value;
      if (snapshot) {
        start().catch(() => undefined);
        return snapshot.value;
      }
      return start();
    },
  };
}

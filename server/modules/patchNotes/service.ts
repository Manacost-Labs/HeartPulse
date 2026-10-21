import { shortPatchVersion, type PatchNotesDetail, type PatchNotesSummary } from './contract.js';
import { parsePatchArticle, type PatchCardResolver } from './parser.js';

type Row = Record<string, unknown>;

export type PatchNotesServiceDependencies = {
  /** Reads hs-data-api `/api/patches?include_content=1`. */
  fetchJson: (url: string) => Promise<unknown>;
  patchesUrl: string;
  /** Russian collectible card names; an empty map leaves entries without pictures. */
  loadCardNames: () => Promise<Record<string, { name?: unknown; playerClass?: unknown }>>;
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
export function createCardNameResolver(cards: Record<string, { name?: unknown; playerClass?: unknown }>): PatchCardResolver {
  const byName = new Map<string, { id: string; cardClass: string | null } | null>();
  for (const [id, card] of Object.entries(cards)) {
    const name = typeof card?.name === 'string' ? nameKey(card.name) : '';
    if (!name) continue;
    const cardClass = typeof card.playerClass === 'string' ? card.playerClass : null;
    const known = byName.get(name);
    if (known === undefined) byName.set(name, { id, cardClass });
    else if (known && known.cardClass !== cardClass) byName.set(name, null);
    // Reprints share a name and class; the original set id keeps its art.
    else if (known && known.id.startsWith('CORE_') && !id.startsWith('CORE_')) byName.set(name, { id, cardClass });
  }
  return name => byName.get(nameKey(name)) ?? null;
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

/** Parses every stored article once per refresh; the newest build of a version wins. */
export function buildPatchNotesSnapshot(rows: Row[], resolve: PatchCardResolver, updatedAt: string): PatchNotesSnapshot {
  const newest = new Map<string, Row>();
  for (const row of rows) {
    const key = shortPatchVersion(row.version) || shortPatchVersion(row.hs_manacost_version);
    if (!key) continue;
    const known = newest.get(key);
    if (!known || buildNumber(row.version) > buildNumber(known.version)) newest.set(key, row);
  }
  const patches = [...newest.entries()].map(([version, row]): PatchNotesDetail => {
    const content = row.match_state === 'matched' ? String(row.content_text ?? '') : '';
    const parsed = content ? parsePatchArticle(content, sections(row.sections), resolve) : { entries: [], missingBefore: 0 };
    return {
      version,
      build: text(row.version) ?? version,
      title: text(row.title) ?? text(row.official_title) ?? `Обновление ${version}`,
      publishedAt: publishedAt(row),
      sourceUrl: httpUrl(row.source_url),
      officialUrl: httpUrl(row.official_url),
      changeCount: parsed.entries.length,
      summary: text(row.summary),
      entries: parsed.entries,
      missingBefore: parsed.missingBefore,
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
    const [payload, cards] = await Promise.all([
      dependencies.fetchJson(dependencies.patchesUrl),
      dependencies.loadCardNames().catch(() => ({})),
    ]);
    const rows = (payload as { patches?: unknown })?.patches;
    if (!Array.isArray(rows)) throw new Error('Patch archive payload has no patches');
    const value = buildPatchNotesSnapshot(rows as Row[], createCardNameResolver(cards), new Date(now()).toISOString());
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

import { Router, type RequestHandler, type Response } from 'express';

export type AdminArchetypeRow = {
  id: number | null;
  nameEn: string;
  nameRu: string;
  sourceNameEn?: string;
  identitySource?: 'hsguru' | 'local-deck-match' | 'hsreplay';
  identityConfidence?: number;
  translated: boolean;
  classKey: string;
  classLabel: string;
  url: string | null;
  standard: boolean;
  wild: boolean;
  stats?: {
    winRate: number | null;
    popularity: number | null;
    games: number | null;
    turns: number | null;
    durationMinutes: number | null;
    climbingSpeed: number | null;
  };
};

export type AdminArchetypesRouterDependencies = {
  adminGuard: RequestHandler;
  setPrivateNoStore: (response: Response) => void;
  loadArchetypes: () => Promise<Array<{
    id?: number | null;
    name?: string | null;
    class?: string | null;
    url?: string | null;
    standard?: boolean | null;
    wild?: boolean | null;
  }>>;
  loadStandardSnapshots: () => Promise<Array<{
    archetype_id?: number | null;
    name?: string | null;
    player_class?: string | null;
    url?: string | null;
    win_rate?: number | null;
    pct_of_total?: number | null;
    total_games?: number | null;
    avg_num_player_turns?: number | null;
  }>>;
  loadWildMeta: () => Promise<Array<{
    archetype?: string | null;
    winrate?: number | null;
    popularity?: number | null;
    games?: number | null;
    turns?: number | null;
    duration_minutes?: number | null;
    climbing_speed?: number | null;
  }>>;
  loadWildDecks: (archetype: string) => Promise<unknown>;
  loadDetail: (archetypeId: number) => Promise<{ status: number; payload: unknown }>;
  translateArchetype: (name: string) => Promise<string> | string;
  resolveCanonicalArchetype?: (input: {
    archetypeId: number;
    sourceNameEn: string;
    detail: unknown;
  }) => Promise<{
    sourceNameEn: string;
    canonicalNameEn: string;
    canonicalNameRu: string;
    identitySource: 'hsguru' | 'local-deck-match' | 'hsreplay';
    identityConfidence: number;
  } | null>;
  loadCanonicalMatchups?: (canonicalNameEn: string) => Promise<Array<{
    opponent_archetype_id: number;
    opponent_name: string;
    opponent_name_en?: string;
    opponent_class?: string | null;
    win_rate: number | null;
    total_games: number | null;
  }> | null>;
  classLabel?: (classKey: string) => string;
};

const CLASS_LABEL_RU: Record<string, string> = {
  DEATHKNIGHT: 'Рыцарь смерти',
  DEMONHUNTER: 'Охотник на демонов',
  DRUID: 'Друид',
  HUNTER: 'Охотник',
  MAGE: 'Маг',
  PALADIN: 'Паладин',
  PRIEST: 'Жрец',
  ROGUE: 'Разбойник',
  SHAMAN: 'Шаман',
  WARLOCK: 'Чернокнижник',
  WARRIOR: 'Воин',
  NEUTRAL: 'Нейтральный',
  WHIZBANG: 'Whizbang',
};

function defaultClassLabel(classKey: string): string {
  const key = String(classKey || '').trim().toUpperCase();
  return CLASS_LABEL_RU[key] || classKey || 'Без класса';
}

function classFromArchetypeName(name: string): string {
  const normalized = ` ${name.toUpperCase()} `;
  const aliases: Array<[string, string]> = [
    ['DEATH KNIGHT', 'DEATHKNIGHT'],
    ['DEMON HUNTER', 'DEMONHUNTER'],
    ['DEATHKNIGHT', 'DEATHKNIGHT'],
    ['DEMONHUNTER', 'DEMONHUNTER'],
    ['DRUID', 'DRUID'], ['HUNTER', 'HUNTER'], ['MAGE', 'MAGE'],
    ['PALADIN', 'PALADIN'], ['PRIEST', 'PRIEST'], ['ROGUE', 'ROGUE'],
    ['SHAMAN', 'SHAMAN'], ['WARLOCK', 'WARLOCK'], ['WARRIOR', 'WARRIOR'],
  ];
  return aliases.find(([label]) => normalized.includes(` ${label} `))?.[1] || 'UNKNOWN';
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

export function createAdminArchetypesRouter(deps: AdminArchetypesRouterDependencies) {
  const router = Router();
  const resolveClassLabel = deps.classLabel || defaultClassLabel;
  // The upstream dictionary is Cloudflare-protected and has ~760 rows. Cache
  // the already translated admin response so a format switch never repeats
  // the remote request or translation work.
  let catalogCache: { expiresAt: number; payload: { count: number; translated: number; items: AdminArchetypeRow[] } } | null = null;
  let wildCatalogCache: { expiresAt: number; payload: { count: number; translated: number; items: AdminArchetypeRow[] } } | null = null;

  router.get('/admin/archetypes', deps.adminGuard, async (req, res) => {
    deps.setPrivateNoStore(res);
    try {
      const format = String(req.query.format || 'standard').toLowerCase();
      if (format === 'wild') {
        if (wildCatalogCache && wildCatalogCache.expiresAt > Date.now()) return res.json(wildCatalogCache.payload);
        const rows = await deps.loadWildMeta();
        const items = (await Promise.all(rows.map(async (row, index): Promise<AdminArchetypeRow | null> => {
          const nameEn = String(row.archetype || '').trim();
          if (!nameEn) return null;
          const nameRu = String(await deps.translateArchetype(nameEn) || nameEn).trim() || nameEn;
          const classKey = classFromArchetypeName(nameEn);
          return {
            id: null,
            nameEn,
            nameRu,
            translated: nameRu !== nameEn,
            classKey,
            classLabel: resolveClassLabel(classKey),
            url: 'https://www.hsguru.com/meta?format=1&min_games=100',
            standard: false,
            wild: true,
            stats: {
              winRate: typeof row.winrate === 'number' ? row.winrate : null,
              popularity: typeof row.popularity === 'number' ? row.popularity : null,
              games: typeof row.games === 'number' ? row.games : null,
              turns: typeof row.turns === 'number' ? row.turns : null,
              durationMinutes: typeof row.duration_minutes === 'number' ? row.duration_minutes : null,
              climbingSpeed: typeof row.climbing_speed === 'number' ? row.climbing_speed : null,
            },
          };
        }))).filter((item): item is AdminArchetypeRow => item !== null);
        items.sort((a, b) => (b.stats?.winRate || 0) - (a.stats?.winRate || 0) || a.nameRu.localeCompare(b.nameRu, 'ru'));
        const payload = { count: items.length, translated: items.filter(item => item.translated).length, items };
        wildCatalogCache = { expiresAt: Date.now() + 5 * 60_000, payload };
        return res.json(payload);
      }
      if (format !== 'standard') return res.status(400).json({ error: 'Неизвестный формат' });
      if (catalogCache && catalogCache.expiresAt > Date.now()) return res.json(catalogCache.payload);
      /*
       * Data ownership:
       * - `loadArchetypes` is the live HSReplay reference dictionary supplied
       *   by hs-data-api. It intentionally remains behind the Arena server:
       *   HSReplay requires the server-side authenticated/proxy fetch layer.
       * - `translateArchetype` is owned by Arena and resolves approved
       *   Russian labels from archetype_translations, then its local fallback
       *   map. Never write translations during this GET request.
       *
       * This route is admin-only because the complete raw dictionary is an
       * editorial/translation work queue, not a public product dataset.
       */
      // The Standard directory is intentionally the current snapshot set:
      // every row has a real detail page, instead of linking 700+ historical
      // dictionary entries to an empty state.
      const rows = await deps.loadStandardSnapshots();
      const items = (await mapWithConcurrency(rows, 6, async (row): Promise<AdminArchetypeRow | null> => {
        const sourceNameEn = String(row?.name || '').trim();
        if (!sourceNameEn) return null;
        const archetypeId = typeof row?.archetype_id === 'number' ? row.archetype_id : Number(row?.archetype_id) || null;
        let identity: Awaited<ReturnType<NonNullable<typeof deps.resolveCanonicalArchetype>>> = null;
        if (archetypeId && deps.resolveCanonicalArchetype) {
          try {
            const detailResponse = await deps.loadDetail(archetypeId);
            if (detailResponse.status >= 200 && detailResponse.status < 300 && detailResponse.payload) {
              identity = await deps.resolveCanonicalArchetype({
                archetypeId,
                sourceNameEn,
                detail: detailResponse.payload,
              });
            }
          } catch {
            // One unresolved deck must not make the whole admin catalogue fail.
          }
        }
        const nameEn = String(identity?.canonicalNameEn || sourceNameEn).trim() || sourceNameEn;
        const nameRu = String(
          identity?.canonicalNameRu
          || await deps.translateArchetype(nameEn)
          || nameEn,
        ).trim() || nameEn;
        const classKey = String(row?.player_class || '').trim().toUpperCase() || 'UNKNOWN';
        return {
          id: archetypeId,
          nameEn,
          nameRu,
          sourceNameEn,
          identitySource: identity?.identitySource || 'hsreplay',
          identityConfidence: identity?.identityConfidence || 0,
          translated: nameRu !== nameEn,
          classKey,
          classLabel: resolveClassLabel(classKey),
          url: row?.url ? String(row.url) : null,
          standard: true,
          wild: false,
          stats: {
            winRate: typeof row.win_rate === 'number' ? row.win_rate : null,
            popularity: typeof row.pct_of_total === 'number' ? row.pct_of_total : null,
            games: typeof row.total_games === 'number' ? row.total_games : null,
            turns: typeof row.avg_num_player_turns === 'number' ? row.avg_num_player_turns : null,
            durationMinutes: null,
            climbingSpeed: null,
          },
        };
      })).filter((item): item is AdminArchetypeRow => item !== null);
      items.sort((a, b) => {
        const classCmp = a.classLabel.localeCompare(b.classLabel, 'ru');
        if (classCmp !== 0) return classCmp;
        const nameCmp = a.nameRu.localeCompare(b.nameRu, 'ru');
        if (nameCmp !== 0) return nameCmp;
        return (a.id || 0) - (b.id || 0);
      });
      const payload = {
        count: items.length,
        translated: items.filter(item => item.translated).length,
        items,
      };
      catalogCache = { expiresAt: Date.now() + 5 * 60_000, payload };
      return res.json(payload);
    } catch (error: any) {
      console.error('[api/admin/archetypes] failed:', error?.message ?? error);
      return res.status(502).json({ error: 'Не удалось загрузить архетипы' });
    }
  });

  router.get('/admin/archetypes/wild/decks', deps.adminGuard, async (req, res) => {
    deps.setPrivateNoStore(res);
    const archetype = String(req.query.archetype || '').trim();
    if (!archetype || archetype.length > 120) {
      return res.status(400).json({ error: 'Укажите название архетипа' });
    }
    try {
      const payload = await deps.loadWildDecks(archetype);
      return res.json({ format: 'wild', archetype, decks: payload });
    } catch (error: any) {
      console.error('[api/admin/archetypes/wild/decks] failed:', error?.message ?? error);
      return res.status(502).json({ error: 'Не удалось загрузить сборки Вольного формата' });
    }
  });

  router.get('/admin/archetypes/:archetypeId', deps.adminGuard, async (req, res) => {
    deps.setPrivateNoStore(res);
    const archetypeId = Number(req.params.archetypeId);
    const format = String(req.query.format || 'standard').toLowerCase();
    if (!Number.isSafeInteger(archetypeId) || archetypeId <= 0) {
      return res.status(400).json({ error: 'Некорректный идентификатор архетипа' });
    }
    if (format === 'wild') {
      /*
       * HSReplay currently exposes Wild deck lists, but returns HTTP 400 for
       * its per-archetype popularity, matchup, mulligan and history queries.
       * Do not fabricate equivalent values from Standard; the client renders
       * this explicit source limitation instead.
       */
      return res.json({
        format,
        available: false,
        reason: 'HSReplay не предоставляет статистику архетипов для Вольного формата через используемые API-запросы.',
      });
    }
    if (format !== 'standard') return res.status(400).json({ error: 'Неизвестный формат' });
    try {
      const { status, payload } = await deps.loadDetail(archetypeId);
      if (status === 404) return res.status(404).json({ error: 'Для этого архетипа пока нет актуального снимка статистики.' });
      if (status < 200 || status >= 300) throw new Error(`HS data API detail HTTP ${status}`);
      if (payload && typeof payload === 'object' && (payload as any).snapshot) {
        const snapshot = (payload as any).snapshot;
        const nameEn = String(snapshot?.name || '').trim();
        if (nameEn) {
          snapshot.nameRu = String(await deps.translateArchetype(nameEn) || nameEn).trim() || nameEn;
          const identity = deps.resolveCanonicalArchetype
            ? await deps.resolveCanonicalArchetype({
              archetypeId,
              sourceNameEn: nameEn,
              detail: payload,
            }).catch(() => null)
            : null;
          snapshot.canonicalNameEn = identity?.canonicalNameEn || nameEn;
          snapshot.canonicalNameRu = identity?.canonicalNameRu || snapshot.nameRu;
          snapshot.identitySource = identity?.identitySource || 'hsreplay';
          snapshot.identityConfidence = identity?.identityConfidence || 0;
          if (deps.loadCanonicalMatchups && snapshot.canonicalNameEn) {
            const canonicalMatchups = await deps.loadCanonicalMatchups(snapshot.canonicalNameEn)
              .catch(() => null);
            if (canonicalMatchups?.length) {
              (payload as any).matchups = canonicalMatchups;
              (payload as any).matchupsSource = 'hsguru';
            }
          }
        }
      }
      return res.json({ format, available: true, data: payload });
    } catch (error: any) {
      console.error('[api/admin/archetypes/:id] failed:', error?.message ?? error);
      return res.status(502).json({ error: 'Не удалось загрузить статистику архетипа' });
    }
  });

  return router;
}

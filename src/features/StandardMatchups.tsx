import React, { lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Grid3X3, ListFilter, RefreshCw, Search } from 'lucide-react';
import '../route-parchment.css';
import '../shared/ui/LoadingSurface.css';
import './StandardMatchups.css';
import { preferredScrollBehavior } from '../shared/ui/scrollBehavior';
import { MatchupsSkeleton } from './MatchupsSkeleton';
import type {
  StandardMatchupsCell, StandardMatchupsData, StandardMatchupsFormat, StandardMatchupsRow,
} from '../modules/standardMatchups/public';

// The matrix and its vendored kit load on demand: only a verified subscriber with data sees them.
const loadStandardMatchupMatrix = () => import('./StandardMatchupMatrix');
const StandardMatchupMatrix = lazy(loadStandardMatchupMatrix);

type StandardMatchupsView = 'overview' | 'matrix';
type StandardMatchupsFilter = 'all' | 'strong' | 'even' | 'weak';

function formatDate(iso: string | null): string {
  if (!iso) return 'нет данных';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function cacheGet<T>(key: string, maxAgeMs = 6 * 60 * 60 * 1000): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw) as { data: T; ts: number };
    if (Date.now() - ts > maxAgeMs) { localStorage.removeItem(key); return null; }
    return data;
  } catch { return null; }
}

function cacheSet(key: string, data: unknown): void {
  try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch { /* ignore quota */ }
}

async function fetchWithETag(url: string, cacheKey: string): Promise<{ data: any; fresh: boolean } | null> {
  const etag = localStorage.getItem(`etag_${cacheKey}`);
  try {
    const res = await fetch(url, etag ? { cache: 'no-cache', headers: { 'If-None-Match': etag } } : { cache: 'no-cache' });
    if (res.status === 304) {
      const cached = cacheGet(cacheKey);
      if (cached !== null) return { data: cached, fresh: false };
      localStorage.removeItem(`etag_${cacheKey}`);
      const retry = await fetch(url, { cache: 'no-store' });
      if (!retry.ok) return null;
      const data = await retry.json();
      const retryEtag = retry.headers.get('ETag');
      if (retryEtag) localStorage.setItem(`etag_${cacheKey}`, retryEtag);
      cacheSet(cacheKey, data);
      return { data, fresh: true };
    }
    if (!res.ok) return null;
    const data = await res.json();
    const nextEtag = res.headers.get('ETag');
    if (nextEtag) localStorage.setItem(`etag_${cacheKey}`, nextEtag);
    cacheSet(cacheKey, data);
    return { data, fresh: true };
  } catch {
    return null;
  }
}

const EMPTY_STANDARD_MATCHUPS: StandardMatchupsData = {
  format: 'standard',
  formatLabel: 'Стандарт',
  rank: 'legend',
  rankLabel: 'Легенда',
  source: 'hsguru',
  updatedAt: null,
  columns: [],
  rows: [],
};

const MATCHUP_FORMAT_LABELS: Record<StandardMatchupsFormat, string> = {
  standard: 'Стандарт',
  wild: 'Вольный',
};

function emptyMatchups(format: StandardMatchupsFormat): StandardMatchupsData {
  return {
    ...EMPTY_STANDARD_MATCHUPS,
    format,
    formatLabel: MATCHUP_FORMAT_LABELS[format],
  };
}

const STANDARD_ARCHETYPE_LABELS_RU: Record<string, string> = {
  'Ace Hunter': 'Эйс Охотник',
  'Aggro Paladin': 'Агро Паладин',
  'Ashamane Rogue': 'Ашамейн Разбойник',
  'Aura Paladin': 'Аура Паладин',
  'Azshara Druid': 'Азшара Друид',
  'Briarspawn Warrior': 'Брайарспаун Воин',
  'Broxigar DH': 'Броксигар Охотник на демонов',
  'Burn Mage': 'Берн Маг',
  'Burn Rogue': 'Берн Разбойник',
  'Burn Warrior': 'Берн Воин',
  'Companion Hunter': 'Компаньон Охотник',
  'Control Priest': 'Контроль Жрец',
  'Dino Egglock': 'Дино Кхелос Чернокнижник',
  'Divergence Warlock': 'Дивергенция Чернокнижник',
  'Dragon Druid': 'Дракон Друид',
  'Dragon Hunter': 'Дракон Охотник',
  'Dragon Warrior': 'Дракон Воин',
  'Dude Paladin': 'Токен Паладин',
  'Egg Warrior': 'Кхелос Воин',
  Egglock: 'Кхелос Чернокнижник',
  'Elemental Mage': 'Элементаль Маг',
  'End of Turnadin': 'Ноздорму Паладин',
  'Enrage Warrior': 'Исступление Воин',
  'Frost DK': 'Фрост Рыцарь смерти',
  'Glacial Shaman': 'Ледяной Шаман',
  'Gladiator Warrior': 'Гладиатор Воин',
  'Harold DH': 'Охотник на демонов на возвещении',
  'Harold DK': 'Рыцарь смерти на возвещении',
  'Harold Egglock': 'Кхелос Чернокнижник на возвещении',
  'Harold Rogue': 'Разбойник на возвещении',
  'Harold Shaman': 'Шаман на возвещении',
  'Harold Warrior': 'Воин на возвещении',
  'Herald DH': 'Охотник на демонов на возвещении',
  'Herald DK': 'Рыцарь смерти на возвещении',
  'Herald Rogue': 'Разбойник на возвещении',
  'Herald Shaman': 'Шаман на возвещении',
  'Herald Warrior': 'Воин на возвещении',
  'Hostage Druid': 'Заложник Друид',
  'Imbue Paladin': 'Паладин на силе героя',
  'Imbue Priest': 'Жрец на силе героя',
  'Imbue Rogue': 'Разбойник на силе героя',
  'Krona Druid': 'Крона Друид',
  'Leyline Mage': 'Лейлайн Маг',
  'Merithra Druid': 'Меритра Друид',
  'No Hand Hunter': 'Охотник без руки',
  'No Minion DH': 'Спелл Охотник на демонов',
  'Quest DH': 'Квест Охотник на демонов',
  'Quest Druid': 'Квест Друид',
  'Quest Hunter': 'Квест Охотник',
  'Quest Mage': 'Квест Маг',
  'Quest Rogue': 'Квест Разбойник',
  'Quest Shaman': 'Квест Шаман',
  'Quest Warrior': 'Квест Воин',
  Rafaamlock: 'Рафаам Чернокнижник',
  'Token Druid': 'Токен Друид',
  'Unholy DK': 'Нечестивый Рыцарь смерти',
  'Vanessa Rogue': 'Ванесса Разбойник',
  'Wallow Warlock': 'Валлоу Чернокнижник',
};

function getStandardArchetypeLabel(name: string, label?: string): string {
  return label || STANDARD_ARCHETYPE_LABELS_RU[name] || name;
}

function isOtherStandardArchetype(name: string): boolean {
  return /^other(?:\s|$)/i.test(name.trim());
}

function standardMatchupTone(value: number | null): React.CSSProperties {
  if (value === null) {
    return {
      background: 'rgba(69,39,14,0.10)',
      border: '1px solid rgba(107,76,42,0.16)',
      color: '#8b6c42',
    };
  }
  if (value >= 55) {
    return {
      background: '#286743',
      border: '1px solid rgba(99,220,150,0.35)',
      color: '#fff7da',
    };
  }
  if (value >= 52) {
    return {
      background: '#526f4f',
      border: '1px solid rgba(99,220,150,0.28)',
      color: '#fff7da',
    };
  }
  if (value >= 50) {
    return {
      background: '#806739',
      border: '1px solid rgba(255,214,102,0.32)',
      color: '#fff7da',
    };
  }
  if (value >= 48) {
    return {
      background: '#946543',
      border: '1px solid rgba(255,190,110,0.28)',
      color: '#fff7da',
    };
  }
  return {
    background: '#88454c',
    border: '1px solid rgba(255,135,135,0.26)',
    color: '#fff7da',
  };
}

export type StandardMatchupsExternal = {
  format: StandardMatchupsFormat;
  changeFormat: (format: StandardMatchupsFormat) => void;
  data: StandardMatchupsData | null;
  loading: boolean;
  error: boolean;
  retry: () => void;
};

function StandardMatchupsPage({ external }: { external?: StandardMatchupsExternal }) {
  const [legacyFormat, setFormat] = useState<StandardMatchupsFormat>('standard');
  const [view, setView] = useState<StandardMatchupsView>('matrix');
  const [matchupFilter, setMatchupFilter] = useState<StandardMatchupsFilter>('all');
  const [matchupSearch, setMatchupSearch] = useState('');
  const [selectedArchetype, setSelectedArchetype] = useState('');
  const [datasets, setDatasets] = useState<Partial<Record<StandardMatchupsFormat, StandardMatchupsData>>>({
    standard: EMPTY_STANDARD_MATCHUPS,
  });
  const [legacyLoading, setLoading] = useState(true);
  const [legacyError, setError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const deferredMatchupSearch = useDeferredValue(matchupSearch.trim().toLocaleLowerCase('ru-RU'));
  const format = external?.format ?? legacyFormat;
  const loading = external?.loading ?? legacyLoading;
  const error = external?.error ?? legacyError;
  const data = external ? external.data ?? emptyMatchups(format)
    : datasets[format] ?? emptyMatchups(format);
  const externalMode = Boolean(external);

  // The matrix chunk downloads while the matchups load, not after them.
  useEffect(() => { void loadStandardMatchupMatrix(); }, []);

  useEffect(() => {
    if (externalMode) return;
    let cancelled = false;
    const load = async () => {
      const cacheKey = `standard_matchups_ru_v7_${format}`;
      const cached = cacheGet<StandardMatchupsData>(cacheKey);
      if (cached?.rows?.length) {
        setDatasets(current => ({
          ...current,
          [format]: {
            ...cached,
            format,
            formatLabel: MATCHUP_FORMAT_LABELS[format],
          },
        }));
      }
      setLoading(!cached?.rows?.length);
      setError(false);
      try {
        const result = await fetchWithETag(
          `/api/standard/matchups?format=${format}`,
          cacheKey,
        );
        if (!result?.data) throw new Error(`Matchup dataset ${format} is unavailable`);
        const payload = result.data as StandardMatchupsData;
        if (payload.format && payload.format !== format) {
          throw new Error(`Expected ${format} dataset, received ${payload.format}`);
        }
        if (!cancelled) setDatasets(current => ({
          ...current,
          [format]: {
            ...payload,
            format,
            formatLabel: MATCHUP_FORMAT_LABELS[format],
          },
        }));
      } catch (err) {
        console.error('Не удалось загрузить матчапы', err);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [format, reloadToken, externalMode]);

  useEffect(() => {
    setSelectedArchetype('');
    setMatchupFilter('all');
    setMatchupSearch('');
  }, [format]);

  const columns = useMemo(
    () => (data.columns ?? []).filter(column => !isOtherStandardArchetype(column.name)),
    [data.columns],
  );
  const visibleOpponentNames = useMemo(
    () => new Set(columns.map(column => column.name)),
    [columns],
  );
  const rows = useMemo(
    () => (data.rows ?? [])
      .filter(row => !isOtherStandardArchetype(row.archetype))
      .map(row => ({
        ...row,
        cells: row.cells.filter(cell => (
          !isOtherStandardArchetype(cell.opponent)
          && visibleOpponentNames.has(cell.opponent)
        )),
      })),
    [data.rows, visibleOpponentNames],
  );
  const strongest = useMemo(() => {
    const candidates: StandardMatchupsRow[] = [];
    for (const row of rows) {
      if (row.winrate !== null) candidates.push(row);
    }
    candidates.sort((a, b) => (b.winrate ?? 0) - (a.winrate ?? 0));
    return candidates.slice(0, 4);
  }, [rows]);
  const bestCounters = useMemo(() => {
    const items: Array<{
      archetype: string;
      archetypeLabel: string;
      best: StandardMatchupsCell | null;
      worst: StandardMatchupsCell | null;
    }> = [];
    for (const row of rows) {
      const cells: StandardMatchupsCell[] = [];
      for (const cell of row.cells) {
        if (cell.winrate !== null && cell.opponent !== row.archetype) cells.push(cell);
      }
      cells.sort((a, b) => (b.winrate ?? 0) - (a.winrate ?? 0));
      const item = {
        archetype: row.archetype,
        archetypeLabel: getStandardArchetypeLabel(row.archetype, row.archetypeLabel),
        best: cells[0] ?? null,
        worst: cells[cells.length - 1] ?? null,
      };
      if (item.best || item.worst) items.push(item);
      if (items.length >= 6) break;
    }
    return items;
  }, [rows]);
  const activeRow = useMemo(
    () => rows.find(row => row.archetype === selectedArchetype) ?? rows[0] ?? null,
    [rows, selectedArchetype],
  );
  const activeMatchups = useMemo(() => {
    if (!activeRow) return [];
    const cells: StandardMatchupsCell[] = [];
    for (const cell of activeRow.cells) {
      if (cell.winrate !== null && cell.opponent !== activeRow.archetype) cells.push(cell);
    }
    cells.sort((a, b) => (b.winrate ?? 0) - (a.winrate ?? 0));
    return cells;
  }, [activeRow]);
  const matchupGroups = useMemo(() => {
    const strong: StandardMatchupsCell[] = [];
    const even: StandardMatchupsCell[] = [];
    const weak: StandardMatchupsCell[] = [];
    for (const cell of activeMatchups) {
      const value = cell.winrate ?? 0;
      if (value >= 52) strong.push(cell);
      else if (value >= 48) even.push(cell);
      else weak.push(cell);
    }
    return [
      { id: 'strong' as const, title: 'Хорошие', hint: '52%+', items: strong, color: '#1f7a3d' },
      { id: 'even' as const, title: 'Ровные', hint: '48-52%', items: even, color: '#8b6c42' },
      { id: 'weak' as const, title: 'Сложные', hint: 'ниже 48%', items: weak, color: '#8b2f2f' },
    ];
  }, [activeMatchups]);
  const filteredMatchupGroups = useMemo(() => matchupGroups
    .filter(group => matchupFilter === 'all' || group.id === matchupFilter)
    .map(group => ({
      ...group,
      items: group.items.filter(cell => {
        if (!deferredMatchupSearch) return true;
        const label = getStandardArchetypeLabel(cell.opponent, cell.opponentLabel);
        return `${label} ${cell.opponent}`.toLocaleLowerCase('ru-RU').includes(deferredMatchupSearch);
      }),
    })), [deferredMatchupSearch, matchupFilter, matchupGroups]);
  const matrixData = useMemo(() => ({ ...data, columns, rows }), [columns, data, rows]);
  const quickRows = useMemo(() => rows.slice(0, 8), [rows]);
  const formatLabel = MATCHUP_FORMAT_LABELS[format];

  const openOverviewSection = useCallback((sectionId: 'matchups-picker' | 'matchups-summary') => {
    setView('overview');
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => document.getElementById(sectionId)?.scrollIntoView({
        behavior: preferredScrollBehavior(),
        block: 'start',
      }));
    });
  }, []);

  const openMatrix = useCallback(() => {
    setView('matrix');
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => document.getElementById('matchups-matrix')?.scrollIntoView({
        behavior: preferredScrollBehavior(),
        block: 'start',
      }));
    });
  }, []);

  return (
    <section className="standard-matchups space-y-5 sm:space-y-6" id="matchups-overview">
      <header className="traditional-mode-banner">
        <div className="traditional-mode-banner__copy">
          <h1>Матчапы</h1>
          <p>Сравнение силы актуальных архетипов против каждого соперника.</p>
        </div>
        <dl className="traditional-mode-banner__summary" aria-label="Сводка матчапов">
          <div><dt>Архетипов</dt><dd>{rows.length || '—'}</dd></div>
          <div><dt>Рейтинг</dt><dd>{data.rankLabel || 'Легенда'}</dd></div>
        </dl>
      </header>

      <div className="standard-matchups__mode-toolbar" aria-label="Настройки отображения матчапов">
        <fieldset className="standard-matchups__control-cluster">
          <legend className="sr-only">Формат игры</legend>
          <span className="standard-matchups__control-label" aria-hidden="true">Формат</span>
          <div
            className="standard-matchups__rank-switcher standard-matchups__segmented"
            data-tour-id="matchups-rank"
          >
            {([
              ['standard', 'Стандарт'],
              ['wild', 'Вольный'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => external ? external.changeFormat(value) : setFormat(value)}
                aria-pressed={format === value}
                aria-label={`Показать матчапы: ${label}`}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="standard-matchups__control-cluster">
          <span className="standard-matchups__control-label" id="matchups-section-label">Раздел</span>
          <nav
            aria-labelledby="matchups-section-label"
            className="standard-matchups__index standard-matchups__segmented"
          >
            <button type="button" onClick={() => openOverviewSection('matchups-picker')}>
              Подбор
            </button>
            <button type="button" onClick={() => openOverviewSection('matchups-summary')}>
              Сводка
            </button>
            <button type="button" onClick={openMatrix} aria-pressed={view === 'matrix'}>
              Матрица
            </button>
          </nav>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5">
        <section
          className="standard-matchups__ledger rounded-2xl p-4 sm:p-5"
          aria-busy={loading && rows.length > 0}
          style={{
            background: 'linear-gradient(135deg,#f4e8cc,#e4c98f)',
            border: '1.5px solid #b8904a',
            boxShadow: 'inset 0 1px 3px rgba(139,69,19,0.14),0 10px 20px rgba(0,0,0,0.10)',
          }}
        >
          <div className="standard-matchups__ledger-heading flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h2 className="font-hs text-2xl" style={{ color: '#3d2208' }}>Матчапы · {formatLabel} · {data.rankLabel}</h2>
              <p className="text-sm text-[#7a5a35]">Цвет показывает силу матчапа: зеленый - хороший, красный - плохой.</p>
            </div>
            <div className="standard-matchups__updated flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs"
              style={{
                background: 'linear-gradient(135deg,#3a2210,#2c1e16)',
                border: '1.5px solid #6b4c2a',
                color: '#e8d5a5',
                boxShadow: '0 2px 6px rgba(0,0,0,0.32)',
              }}>
              <RefreshCw size={11} className="text-[#a88a45]" />
              <span aria-live="polite">{loading ? `Обновляем ${formatLabel.toLocaleLowerCase('ru-RU')}...` : data.updatedAt ? formatDate(data.updatedAt) : 'нет данных'}</span>
            </div>
          </div>

          {(error || data.warning) && (
            <div className="standard-matchups__error flex flex-wrap items-center gap-2 text-[#8b2f2f] text-sm mb-4 px-3 py-2 rounded-lg bg-[#8b2f2f]/10 border border-[#8b2f2f]/20" role="alert">
              <AlertTriangle size={15} />
              <span>Не удалось загрузить формат «{formatLabel}».</span>
              <button type="button" onClick={() => external ? external.retry() : setReloadToken(value => value + 1)}>Повторить</button>
            </div>
          )}

          {loading && rows.length === 0 ? (
            <MatchupsSkeleton />
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-[#7a5a35]">Данные матчапов пока недоступны.</div>
          ) : (
            <>
              <div className="standard-matchups__view-switcher mb-4" role="group" aria-label="Режим просмотра">
                <button
                  type="button"
                  aria-pressed={view === 'matrix'}
                  onClick={() => setView('matrix')}
                  data-tour-id="matchups-matrix"
                >
                  <Grid3X3 size={17} aria-hidden="true" />
                  Полная матрица
                  <span>{rows.length}</span>
                </button>
                <button
                  type="button"
                  aria-pressed={view === 'overview'}
                  onClick={() => setView('overview')}
                >
                  <ListFilter size={17} aria-hidden="true" />
                  Обзор архетипа
                </button>
              </div>

              {view === 'overview' && activeRow && (
                <section id="matchups-picker" className="standard-matchups__picker scroll-mt-4 mb-4 rounded-xl border border-[#d7b56e]/60 bg-white/55 p-3 sm:p-4">
                  <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
                    <div>
                      <h3 className="font-hs text-xl" style={{ color: '#3d2208' }}>Быстрый просмотр матчапов</h3>
                      <p className="text-sm text-[#6b4c2a]">Выберите архетип и сразу смотрите удобные, ровные и сложные пары.</p>
                    </div>
                    <label className="block w-full md:w-[320px]" data-tour-id="matchups-picker">
                      <span className="block text-xs font-bold uppercase tracking-[0.16em] text-[#8b6c42] mb-1">Архетип</span>
                      <select
                        value={activeRow.archetype}
                        onChange={event => setSelectedArchetype(event.target.value)}
                        className="w-full rounded-xl border border-[#d7b56e]/70 bg-[#fff8e4] px-3 py-2 text-[#3d2208] font-bold focus:outline-none focus:ring-2 focus:ring-[#d6a848]"
                      >
                        {rows.map(row => (
                          <option key={row.archetype} value={row.archetype}>
                            {getStandardArchetypeLabel(row.archetype, row.archetypeLabel)}
                            {row.winrate !== null ? ` - ${row.winrate.toFixed(1)}%` : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="standard-matchups__quick-list mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-hs" aria-label="Популярные архетипы">
                    {quickRows.map(row => {
                      const isActive = row.archetype === activeRow.archetype;
                      return (
                        <button
                          key={row.archetype}
                          type="button"
                          onClick={() => setSelectedArchetype(row.archetype)}
                          aria-pressed={isActive}
                          className="shrink-0 rounded-full px-3 py-1.5 text-xs font-black transition focus:outline-none focus:ring-2 focus:ring-[#d6a848]"
                          style={{
                            color: isActive ? '#fff7da' : '#3d2208',
                            background: isActive ? 'linear-gradient(135deg,#5a3000,#3d1e00)' : 'rgba(255,248,228,0.82)',
                            border: isActive ? '1px solid #f4d06f' : '1px solid rgba(215,181,110,0.78)',
                          }}
                        >
                          {getStandardArchetypeLabel(row.archetype, row.archetypeLabel)}
                        </button>
                      );
                    })}
                  </div>

                  <div className="standard-matchups__matchup-tools mt-4">
                    <label className="standard-matchups__search">
                      <Search size={17} aria-hidden="true" />
                      <span className="sr-only">Найти соперника</span>
                      <input
                        type="search"
                        value={matchupSearch}
                        onChange={event => setMatchupSearch(event.target.value)}
                        placeholder="Найти соперника"
                      />
                    </label>
                    <div className="standard-matchups__filter-chips" role="group" aria-label="Сила матчапа">
                      {([
                        ['all', 'Все', activeMatchups.length],
                        ['strong', 'Хорошие', matchupGroups[0]?.items.length ?? 0],
                        ['even', 'Ровные', matchupGroups[1]?.items.length ?? 0],
                        ['weak', 'Сложные', matchupGroups[2]?.items.length ?? 0],
                      ] as const).map(([id, label, count]) => (
                        <button
                          key={id}
                          type="button"
                          aria-pressed={matchupFilter === id}
                          onClick={() => setMatchupFilter(id)}
                        >
                          {label}<span>{count}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={`standard-matchups__groups mt-4 grid grid-cols-1 gap-3 ${matchupFilter === 'all' ? 'lg:grid-cols-3' : 'standard-matchups__groups--focused'}`}>
                    {filteredMatchupGroups.map(group => {
                      const visibleItems = matchupFilter === 'all' && !deferredMatchupSearch
                        ? group.items.slice(0, 8)
                        : group.items;
                      return (
                      <div key={group.title} className="standard-matchups__group rounded-xl border border-[#e2c993]/70 bg-[#fff8e4]/72 p-3">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="font-hs text-lg" style={{ color: '#3d2208' }}>{group.title}</div>
                          <span
                            className="rounded-full px-2 py-1 text-xs font-black"
                            style={{ color: group.color, background: `${group.color}18`, border: `1px solid ${group.color}38` }}
                          >
                            {group.hint}
                          </span>
                        </div>
                        {visibleItems.length ? (
                          <div className="standard-matchups__group-list lg:pr-1 scrollbar-hs">
                            {visibleItems.map(cell => (
                              <div key={`${group.title}-${cell.opponent}`} className="standard-matchups__group-item flex items-center justify-between gap-3 rounded-lg bg-white/60 border border-[#e2c993]/55 px-3 py-2">
                                <span className="text-sm font-bold text-[#3d2208] leading-tight">
                                  {getStandardArchetypeLabel(cell.opponent, cell.opponentLabel)}
                                </span>
                                <span className="shrink-0 rounded-full px-2 py-1 text-xs font-black text-[#fff7da]" style={standardMatchupTone(cell.winrate)}>
                                  {cell.winrate !== null ? `${cell.winrate.toFixed(1)}%` : '—'}
                                </span>
                              </div>
                            ))}
                            {group.items.length > visibleItems.length && (
                              <button
                                type="button"
                                className="standard-matchups__show-group"
                                onClick={() => setMatchupFilter(group.id)}
                              >
                                Показать ещё {group.items.length - visibleItems.length}
                              </button>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-[#7a5a35]">По этому фильтру ничего не найдено.</p>
                        )}
                      </div>
                    )})}
                  </div>
                </section>
              )}

              {view === 'matrix' && activeRow && (
                <div id="matchups-matrix" className="scroll-mt-4">
                  <Suspense fallback={<MatchupsSkeleton />}>
                    <StandardMatchupMatrix data={matrixData} labelOf={getStandardArchetypeLabel}
                      selected={activeRow.archetype} onSelectedChange={setSelectedArchetype} />
                  </Suspense>
                </div>
              )}
            </>
          )}
        </section>

        <aside id="matchups-summary" className="standard-matchups__summary scroll-mt-4 grid grid-cols-1 lg:grid-cols-2 gap-5">
          <section className="standard-matchups__summary-card rounded-2xl p-4 bg-[#fff8e4]/80 border border-[#d7b56e]/50">
            <h3 className="font-hs text-xl mb-3" style={{ color: '#3d2208' }} data-tour-id="matchups-summary">Лучшие архетипы</h3>
            <div className="space-y-2">
              {strongest.length ? strongest.map(item => (
                <div key={item.archetype} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 bg-white/55 border border-[#e2c993]/55">
                  <span className="font-bold text-[#3d2208] leading-tight">{getStandardArchetypeLabel(item.archetype, item.archetypeLabel)}</span>
                  <span className="text-[#2f7d46] font-black">{item.winrate?.toFixed(1)}%</span>
                </div>
              )) : <p className="text-sm text-[#7a5a35]">Сводка появится после загрузки.</p>}
            </div>
          </section>

          <section className="standard-matchups__summary-card rounded-2xl p-4 bg-[#fff8e4]/80 border border-[#d7b56e]/50">
            <h3 className="font-hs text-xl mb-3" style={{ color: '#3d2208' }}>Быстрые ориентиры</h3>
            <div className="space-y-3">
              {bestCounters.map(item => (
                <div key={item.archetype} className="rounded-lg p-3 bg-white/55 border border-[#e2c993]/55">
                  <div className="font-bold text-[#3d2208]">{item.archetypeLabel}</div>
                  <div className="mt-1 text-sm text-[#6b4c2a]">
                    {item.best && <>Лучше всего против <strong>{getStandardArchetypeLabel(item.best.opponent, item.best.opponentLabel)}</strong> ({item.best.winrate?.toFixed(1)}%).</>}
                    {item.worst && <><br />Сложнее всего против <strong>{getStandardArchetypeLabel(item.worst.opponent, item.worst.opponentLabel)}</strong> ({item.worst.winrate?.toFixed(1)}%).</>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}



export default StandardMatchupsPage;

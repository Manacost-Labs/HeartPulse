import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Grid3X3, ListFilter, RefreshCw } from 'lucide-react';
import '../route-parchment.css';
import '../shared/ui/LoadingSurface.css';
import './StandardMatchups.css';
import { preferredScrollBehavior } from '../shared/ui/scrollBehavior';
import { MatchupsOverviewSkeleton, MatchupsSkeleton } from './MatchupsSkeleton';
import type { StandardMatchupsData, StandardMatchupsFormat } from '../modules/standardMatchups/public';
import { StandardMatchupsLeaders } from './StandardMatchupsLeaders';
import { ViewSwitch } from '../components/transitions/ViewSwitch';
import { MODE_ORDER } from '../components/transitions/transitionOrder';

// The matrix, the overview and their vendored kit load on demand: only a verified subscriber with data sees them.
const loadStandardMatchupMatrix = () => import('./StandardMatchupMatrix');
const StandardMatchupMatrix = lazy(loadStandardMatchupMatrix);
const StandardMatchupsOverview = lazy(() => import('./StandardMatchupsOverview'));

type StandardMatchupsView = 'overview' | 'matrix';
/** The order of the view buttons: Полная матрица, then Обзор архетипа. */
const MATCHUP_VIEWS: readonly StandardMatchupsView[] = ['matrix', 'overview'];

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
  const [selectedArchetype, setSelectedArchetype] = useState('');
  const [datasets, setDatasets] = useState<Partial<Record<StandardMatchupsFormat, StandardMatchupsData>>>({
    standard: EMPTY_STANDARD_MATCHUPS,
  });
  const [legacyLoading, setLoading] = useState(true);
  const [legacyError, setError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
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
  const activeRow = useMemo(
    () => rows.find(row => row.archetype === selectedArchetype) ?? rows[0] ?? null,
    [rows, selectedArchetype],
  );
  const matrixData = useMemo(() => ({ ...data, columns, rows }), [columns, data, rows]);
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
              <div className="standard-matchups__view-switcher mb-4" role="group" aria-label="Режим просмотра" data-tour-id="matchups-views">
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

              <ViewSwitch viewKey={data.format} order={MODE_ORDER}><ViewSwitch viewKey={view} order={MATCHUP_VIEWS}>
              {view === 'overview' && activeRow && (
                <section className="standard-matchups__picker scroll-mt-4 mb-4">
                  <Suspense fallback={<MatchupsOverviewSkeleton />}>
                    <StandardMatchupsOverview key={format} data={matrixData} labelOf={getStandardArchetypeLabel}
                      selected={activeRow.archetype} onSelectedChange={setSelectedArchetype} />
                  </Suspense>
                </section>
              )}

              {view === 'matrix' && activeRow && (
                <div id="matchups-matrix" className="scroll-mt-4" data-tour-id="matchups-grid">
                  <Suspense fallback={<MatchupsSkeleton />}>
                    <StandardMatchupMatrix data={matrixData} labelOf={getStandardArchetypeLabel}
                      selected={activeRow.archetype} onSelectedChange={setSelectedArchetype} />
                  </Suspense>
                </div>
              )}
              </ViewSwitch></ViewSwitch>
            </>
          )}
        </section>

        <aside id="matchups-summary" className="standard-matchups__summary scroll-mt-4">
          <section className="standard-matchups__summary-card rounded-2xl p-4 bg-[#fff8e4]/80 border border-[#d7b56e]/50">
            <h3 className="font-hs text-xl mb-1" style={{ color: '#3d2208' }} data-tour-id="matchups-summary">Сильнейшие архетипы</h3>
            <p className="standard-matchups__summary-lead">Лучший винрейт против меты, их самая удобная и самая сложная пара. Нажмите, чтобы открыть обзор.</p>
            <StandardMatchupsLeaders data={matrixData} labelOf={getStandardArchetypeLabel}
              onOpen={archetype => { setSelectedArchetype(archetype); openOverviewSection('matchups-picker'); }} />
          </section>
        </aside>
      </div>
    </section>
  );
}



export default StandardMatchupsPage;

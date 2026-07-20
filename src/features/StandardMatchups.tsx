import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import '../route-parchment.css';

type StandardMatchupsRank = 'legend' | 'diamond';

interface StandardMatchupsColumn {
  name: string;
  label?: string;
  popularity: string | null;
}

interface StandardMatchupsCell {
  opponent: string;
  opponentLabel?: string;
  winrate: number | null;
}

interface StandardMatchupsRow {
  archetype: string;
  archetypeLabel?: string;
  winrate: number | null;
  cells: StandardMatchupsCell[];
}

interface StandardMatchupsData {
  rank: StandardMatchupsRank;
  rankLabel: string;
  source: string;
  sourceId?: string;
  sourceUrl?: string;
  updatedAt: string | null;
  columns: StandardMatchupsColumn[];
  rows: StandardMatchupsRow[];
  warning?: string;
}

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
  rank: 'legend',
  rankLabel: 'Легенда',
  source: 'hsguru',
  updatedAt: null,
  columns: [],
  rows: [],
};

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
      background: 'linear-gradient(135deg,#1d7b46,#145832)',
      border: '1px solid rgba(99,220,150,0.35)',
      color: '#fff7da',
    };
  }
  if (value >= 52) {
    return {
      background: 'linear-gradient(135deg,#2f7d46,#236236)',
      border: '1px solid rgba(99,220,150,0.28)',
      color: '#fff7da',
    };
  }
  if (value >= 50) {
    return {
      background: 'linear-gradient(135deg,#9a742d,#70511e)',
      border: '1px solid rgba(255,214,102,0.32)',
      color: '#fff7da',
    };
  }
  if (value >= 48) {
    return {
      background: 'linear-gradient(135deg,#915d27,#68411a)',
      border: '1px solid rgba(255,190,110,0.28)',
      color: '#fff7da',
    };
  }
  return {
    background: 'linear-gradient(135deg,#8d2932,#671d25)',
    border: '1px solid rgba(255,135,135,0.26)',
    color: '#fff7da',
  };
}

function StandardMatchupsPage() {
  const [rank, setRank] = useState<StandardMatchupsRank>('legend');
  const [selectedArchetype, setSelectedArchetype] = useState('');
  const [data, setData] = useState<StandardMatchupsData>(EMPTY_STANDARD_MATCHUPS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const matrixScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(false);
      try {
        const result = await fetchWithETag(`/api/standard/matchups?rank=${rank}`, `standard_matchups_ru_v4_${rank}`);
        if (!cancelled && result?.data) {
          setData(result.data as StandardMatchupsData);
        }
      } catch (err) {
        console.error('Не удалось загрузить матчапы Стандарта', err);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [rank]);

  const scrollMatrix = useCallback((direction: -1 | 1) => {
    const node = matrixScrollRef.current;
    if (!node) return;
    node.scrollBy({
      left: direction * Math.max(280, Math.floor(node.clientWidth * 0.78)),
      behavior: 'smooth',
    });
  }, []);

  const rows = useMemo(() => data.rows ?? [], [data.rows]);
  const columns = useMemo(() => data.columns ?? [], [data.columns]);
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
      { title: 'Хорошие', hint: '52%+', items: strong, color: '#1f7a3d' },
      { title: 'Ровные', hint: '48-52%', items: even, color: '#8b6c42' },
      { title: 'Сложные', hint: 'ниже 48%', items: weak, color: '#8b2f2f' },
    ];
  }, [activeMatchups]);
  const quickRows = useMemo(() => rows.slice(0, 8), [rows]);

  return (
    <section className="standard-matchups space-y-5 sm:space-y-6" id="matchups-overview">
      <div
        className="standard-matchups__masthead rounded-2xl p-5 sm:p-7"
        style={{
          background: 'linear-gradient(135deg,rgba(255,248,222,0.96),rgba(231,204,138,0.62))',
          border: '1.5px solid rgba(184,144,74,0.62)',
          boxShadow: '0 18px 36px rgba(39,23,8,0.12)',
        }}
      >
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
          <div>
            <div className="uppercase tracking-[0.28em] text-xs font-bold text-[#8b6c42] mb-2">Стандарт</div>
            <h1 className="font-hs text-4xl sm:text-5xl leading-tight" style={{ color: '#3d2208' }}>Матчапы</h1>
            <p className="mt-3 max-w-3xl text-base sm:text-lg text-[#6b4c2a]">
              Матрица архетипов по данным HSGuru: строки показывают выбранный архетип, столбцы - соперника, в ячейках винрейт.
            </p>
          </div>
          <div className="standard-matchups__rank-switcher flex flex-wrap gap-2" aria-label="Диапазон рейтинга" data-tour-id="matchups-rank">
            {([
              ['legend', 'Легенда'],
              ['diamond', 'Алмаз 4-1'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setRank(value)}
                aria-pressed={rank === value}
                className={`px-4 py-2 rounded-full font-bold transition ${rank === value ? 'text-[#2c1e16]' : 'text-[#6b4c2a]'}`}
                style={{
                  background: rank === value ? 'linear-gradient(135deg,#f4d06f,#d6a848)' : 'rgba(255,255,255,0.55)',
                  border: rank === value ? '1.5px solid #b8904a' : '1px solid rgba(107,76,42,0.18)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <nav
        aria-label="Навигация по странице матчапов"
        className="standard-matchups__index flex gap-2 overflow-x-auto rounded-2xl border border-[#d7b56e]/60 bg-[#fff8e4]/82 p-2 scrollbar-hs"
      >
        {[
          ['#matchups-picker', 'Подбор'],
          ['#matchups-matrix', 'Матрица'],
          ['#matchups-summary', 'Сводка'],
        ].map(([href, label]) => (
          <a
            key={href}
            href={href}
            className="shrink-0 rounded-xl border border-[#d7b56e]/70 bg-white/75 px-4 py-2 text-sm font-black text-[#3d2208] transition hover:bg-[#fff3c4] focus:outline-none focus:ring-2 focus:ring-[#d6a848]"
          >
            {label}
          </a>
        ))}
      </nav>

      <div className="grid grid-cols-1 gap-5">
        <section
          className="standard-matchups__ledger rounded-2xl p-4 sm:p-5"
          style={{
            background: 'linear-gradient(135deg,#f4e8cc,#e4c98f)',
            border: '1.5px solid #b8904a',
            boxShadow: 'inset 0 1px 3px rgba(139,69,19,0.14),0 10px 20px rgba(0,0,0,0.10)',
          }}
        >
          <div className="standard-matchups__ledger-heading flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h2 className="font-hs text-2xl" style={{ color: '#3d2208' }}>Матрица {data.rankLabel}</h2>
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
              <span>{data.updatedAt ? formatDate(data.updatedAt) : loading ? 'Загрузка...' : 'нет данных'}</span>
            </div>
          </div>

          {(error || data.warning) && (
            <div className="flex items-center gap-2 text-[#8b2f2f] text-sm mb-4 px-3 py-2 rounded-lg bg-[#8b2f2f]/10 border border-[#8b2f2f]/20">
              <AlertTriangle size={15} /><span>Матчапы временно не обновились. Попробуйте обновить страницу позже.</span>
            </div>
          )}

          {loading && rows.length === 0 ? (
            <div className="py-16 text-center text-[#7a5a35]">Загружаем матчапы...</div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-[#7a5a35]">Данные матчапов пока недоступны.</div>
          ) : (
            <>
              {activeRow && (
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

                  <div className="standard-matchups__groups mt-4 grid grid-cols-1 lg:grid-cols-3 gap-3">
                    {matchupGroups.map(group => (
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
                        {group.items.length ? (
                          <div className="space-y-2 max-h-none lg:max-h-[320px] lg:overflow-y-auto lg:pr-1 scrollbar-hs">
                            {group.items.map(cell => (
                              <div key={`${group.title}-${cell.opponent}`} className="flex items-center justify-between gap-3 rounded-lg bg-white/60 border border-[#e2c993]/55 px-3 py-2">
                                <span className="text-sm font-bold text-[#3d2208] leading-tight">
                                  {getStandardArchetypeLabel(cell.opponent, cell.opponentLabel)}
                                </span>
                                <span className="shrink-0 rounded-full px-2 py-1 text-xs font-black text-[#fff7da]" style={standardMatchupTone(cell.winrate)}>
                                  {cell.winrate !== null ? `${cell.winrate.toFixed(1)}%` : '—'}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-[#7a5a35]">Нет матчапов в этой группе.</p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <div className="standard-matchups__matrix-guide mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2" data-tour-id="matchups-matrix">
                <p className="text-xs sm:text-sm text-[#6b4c2a]">
                  Полная матрица ниже. На ПК используйте кнопки или горизонтальный скролл, на телефоне удобнее быстрый просмотр выше.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => scrollMatrix(-1)}
                    className="px-3 py-1.5 rounded-full text-sm font-bold text-[#5b3a18] bg-white/60 border border-[#d7b56e]/60"
                  >
                    ← Влево
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollMatrix(1)}
                    className="px-3 py-1.5 rounded-full text-sm font-bold text-[#5b3a18] bg-white/60 border border-[#d7b56e]/60"
                  >
                    Вправо →
                  </button>
                </div>
              </div>
              <div
                ref={matrixScrollRef}
                id="matchups-matrix"
                tabIndex={0}
                aria-label="Прокручиваемая таблица матчапов Стандарта"
                className="standard-matchups__matrix scroll-mt-4 overflow-x-auto pb-2 scrollbar-hs rounded-xl border border-[#b8904a]/45 bg-[#fffdf4]/78 focus:outline-none focus:ring-2 focus:ring-[#d6a848]"
                style={{ WebkitOverflowScrolling: 'touch', overscrollBehaviorX: 'contain', touchAction: 'pan-x' }}
              >
              <table className="w-full min-w-[980px] sm:min-w-[1280px] border-separate border-spacing-0">
                <thead>
                  <tr>
                    <th scope="col" className="sticky top-0 left-0 z-30 text-left px-3 sm:px-4 py-3 min-w-[190px] sm:min-w-[250px]"
                      style={{ background: 'linear-gradient(135deg,#3a1b00,#220f00)', color: '#ffe7a3', boxShadow: '6px 0 12px rgba(43,20,4,0.18)' }}>
                      <span className="block text-sm font-black" style={{ color: '#ffe7a3' }}>Архетип</span>
                      <span className="block text-[11px] mt-0.5" style={{ color: '#d8bd73' }}>общий винрейт</span>
                    </th>
                    {columns.map(column => {
                      const columnLabel = getStandardArchetypeLabel(column.name, column.label);
                      return (
                        <th key={column.name} scope="col" className="sticky top-0 z-20 px-2 sm:px-3 py-3 text-center min-w-[96px] sm:min-w-[130px]"
                          style={{
                            background: 'linear-gradient(135deg,#4a2400,#2a1200)',
                            color: '#fff0bd',
                            borderLeft: '1px solid rgba(252,211,77,0.16)',
                          }}>
                          <span
                            className="block text-[10px] sm:text-xs leading-tight"
                            title={columnLabel !== column.name ? `${columnLabel} (${column.name})` : column.name}
                            style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                          >
                            {columnLabel}
                          </span>
                          {column.popularity && <span className="block text-[10px] mt-1" style={{ color: '#e4c979' }}>{column.popularity}</span>}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIndex) => {
                    const rowLabel = getStandardArchetypeLabel(row.archetype, row.archetypeLabel);
                    return (
                      <tr key={row.archetype} style={{ background: rowIndex % 2 === 0 ? 'rgba(255,255,255,0.20)' : 'rgba(80,42,12,0.06)' }}>
                        <th scope="row" className="sticky left-0 z-10 px-3 sm:px-4 py-2 text-left min-w-[190px] sm:min-w-[250px]"
                          style={{
                            background: rowIndex % 2 === 0
                              ? 'linear-gradient(135deg,#f4e4ba,#e2c986)'
                              : 'linear-gradient(135deg,#ead4a0,#d8b870)',
                            borderRight: '1px solid rgba(107,76,42,0.22)',
                            boxShadow: '6px 0 12px rgba(72,42,9,0.10)',
                          }}>
                          <div className="flex items-center justify-between gap-3 min-h-[48px]">
                            <span
                              className="text-sm sm:text-[15px] font-black leading-tight"
                              title={rowLabel !== row.archetype ? `${rowLabel} (${row.archetype})` : row.archetype}
                              style={{ color: '#2d1807' }}
                            >
                              {rowLabel}
                            </span>
                            <span className="px-2 py-1 rounded-full text-xs font-black whitespace-nowrap"
                              style={{ background: 'rgba(80,45,8,0.13)', color: '#6b4214' }}>
                              {row.winrate !== null ? `${row.winrate.toFixed(1)}%` : '—'}
                            </span>
                          </div>
                        </th>
                        {row.cells.map(cell => {
                          const opponentLabel = getStandardArchetypeLabel(cell.opponent, cell.opponentLabel);
                          return (
                            <td key={`${row.archetype}-${cell.opponent}`} className="p-1.5 text-center align-middle">
                              <div
                                className="h-9 sm:h-10 rounded-lg flex items-center justify-center font-bold text-xs sm:text-sm"
                                title={`${rowLabel} против ${opponentLabel}: ${cell.winrate !== null ? `${cell.winrate.toFixed(1)}%` : 'нет данных'}`}
                                style={standardMatchupTone(cell.winrate)}
                              >
                                {cell.winrate !== null ? `${cell.winrate.toFixed(1)}%` : '—'}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
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

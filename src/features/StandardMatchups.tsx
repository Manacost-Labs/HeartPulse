import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Grid3X3, ListFilter, RefreshCw, Search, X } from 'lucide-react';
import '../route-parchment.css';
import './StandardMatchups.css';

type StandardMatchupsFormat = 'standard' | 'wild';
type StandardMatchupsView = 'overview' | 'matrix';
type StandardMatchupsFilter = 'all' | 'strong' | 'even' | 'weak';

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
  format: StandardMatchupsFormat;
  formatLabel: string;
  rank: 'legend';
  rankLabel: string;
  source: string;
  sourceId?: string;
  sourceUrl?: string;
  updatedAt: string | null;
  columns: StandardMatchupsColumn[];
  rows: StandardMatchupsRow[];
  warning?: string;
}

interface ActiveMatrixMatchup {
  row: StandardMatchupsRow;
  cell: StandardMatchupsCell;
  rowLabel: string;
  opponentLabel: string;
  anchor: HTMLButtonElement;
  left: number;
  top: number;
  placement: 'above' | 'below';
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

function standardMatchupAssessment(value: number | null): {
  label: string;
  detail: string;
  tone: 'strong' | 'good' | 'even' | 'weak' | 'empty';
} {
  if (value === null) {
    return {
      label: 'Нет данных',
      detail: 'Для этой пары пока недостаточно сыгранных матчей.',
      tone: 'empty',
    };
  }
  if (value >= 55) {
    return {
      label: 'Сильное преимущество',
      detail: 'Архетип заметно чаще выигрывает эту пару.',
      tone: 'strong',
    };
  }
  if (value >= 52) {
    return {
      label: 'Преимущество',
      detail: 'Матчап складывается в пользу выбранного архетипа.',
      tone: 'good',
    };
  }
  if (value >= 48) {
    return {
      label: 'Ровный матчап',
      detail: 'Шансы сторон близки, исход сильнее зависит от игры.',
      tone: 'even',
    };
  }
  return {
    label: 'Сложный матчап',
    detail: 'Соперник чаще выигрывает эту пару.',
    tone: 'weak',
  };
}

function StandardMatchupsPage() {
  const [format, setFormat] = useState<StandardMatchupsFormat>('standard');
  const [view, setView] = useState<StandardMatchupsView>('overview');
  const [matchupFilter, setMatchupFilter] = useState<StandardMatchupsFilter>('all');
  const [matchupSearch, setMatchupSearch] = useState('');
  const [matrixSearch, setMatrixSearch] = useState('');
  const [selectedArchetype, setSelectedArchetype] = useState('');
  const [datasets, setDatasets] = useState<Partial<Record<StandardMatchupsFormat, StandardMatchupsData>>>({
    standard: EMPTY_STANDARD_MATCHUPS,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const matrixScrollRef = useRef<HTMLDivElement | null>(null);
  const matrixTopScrollRef = useRef<HTMLDivElement | null>(null);
  const matchupTooltipRef = useRef<HTMLDivElement | null>(null);
  const [activeMatrixMatchup, setActiveMatrixMatchup] = useState<ActiveMatrixMatchup | null>(null);
  const deferredMatchupSearch = useDeferredValue(matchupSearch.trim().toLocaleLowerCase('ru-RU'));
  const deferredMatrixSearch = useDeferredValue(matrixSearch.trim().toLocaleLowerCase('ru-RU'));
  const data = datasets[format] ?? emptyMatchups(format);

  useEffect(() => {
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
  }, [format, reloadToken]);

  useEffect(() => {
    setSelectedArchetype('');
    setMatchupFilter('all');
    setMatchupSearch('');
    setMatrixSearch('');
    setActiveMatrixMatchup(null);
  }, [format]);

  const syncMatrixScroll = useCallback((source: HTMLDivElement) => {
    const nextLeft = source.scrollLeft;
    for (const target of [
      matrixTopScrollRef.current,
      matrixScrollRef.current,
    ]) {
      if (target && target !== source && Math.abs(target.scrollLeft - nextLeft) > 1) {
        target.scrollLeft = nextLeft;
      }
    }
  }, []);

  const scrollMatrix = useCallback((direction: -1 | 1) => {
    const node = matrixScrollRef.current;
    if (!node) return;
    node.scrollBy({
      left: direction * Math.max(280, Math.floor(node.clientWidth * 0.78)),
      behavior: 'smooth',
    });
  }, []);

  const closeMatrixMatchup = useCallback((restoreFocus = false) => {
    setActiveMatrixMatchup(current => {
      if (restoreFocus) window.requestAnimationFrame(() => current?.anchor.focus());
      return null;
    });
  }, []);

  const openMatrixMatchup = useCallback((
    event: React.MouseEvent<HTMLButtonElement> | React.KeyboardEvent<HTMLButtonElement>,
    row: StandardMatchupsRow,
    cell: StandardMatchupsCell,
    rowLabel: string,
    opponentLabel: string,
  ) => {
    const anchor = event.currentTarget;
    const rect = anchor.getBoundingClientRect();
    const tooltipWidth = Math.min(360, Math.max(280, window.innerWidth - 24));
    const estimatedHeight = 258;
    const left = Math.min(
      Math.max(12, rect.left + (rect.width / 2) - (tooltipWidth / 2)),
      Math.max(12, window.innerWidth - tooltipWidth - 12),
    );
    const hasRoomBelow = rect.bottom + estimatedHeight + 16 <= window.innerHeight;

    setActiveMatrixMatchup({
      row,
      cell,
      rowLabel,
      opponentLabel,
      anchor,
      left,
      top: hasRoomBelow ? rect.bottom + 10 : rect.top - 10,
      placement: hasRoomBelow ? 'below' : 'above',
    });
  }, []);

  useEffect(() => {
    if (!activeMatrixMatchup) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        matchupTooltipRef.current?.contains(target)
        || activeMatrixMatchup.anchor.contains(target)
      ) return;
      closeMatrixMatchup();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMatrixMatchup(true);
    };
    const handleViewportChange = () => closeMatrixMatchup();

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleViewportChange);
    document.addEventListener('scroll', handleViewportChange, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleViewportChange);
      document.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [activeMatrixMatchup, closeMatrixMatchup]);

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
  const matrixRows = useMemo(() => {
    if (!deferredMatrixSearch) return rows;
    return rows.filter(row => {
      const label = getStandardArchetypeLabel(row.archetype, row.archetypeLabel);
      return `${label} ${row.archetype}`.toLocaleLowerCase('ru-RU').includes(deferredMatrixSearch);
    });
  }, [deferredMatrixSearch, rows]);
  const quickRows = useMemo(() => rows.slice(0, 8), [rows]);
  const formatLabel = MATCHUP_FORMAT_LABELS[format];

  const openMatrix = useCallback(() => {
    setView('matrix');
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => document.getElementById('matchups-matrix')?.scrollIntoView({
        behavior: 'smooth',
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

      <div className="standard-matchups__rank-switcher traditional-mode-banner-controls" aria-label="Формат игры" data-tour-id="matchups-rank">
        {([
          ['standard', 'Стандарт'],
          ['wild', 'Вольный'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFormat(value)}
            aria-pressed={format === value}
            aria-label={`Показать матчапы: ${label}`}
            className={`px-4 py-2 rounded-full font-bold transition ${format === value ? 'text-[#2c1e16]' : 'text-[#6b4c2a]'}`}
            style={{
              background: format === value ? 'linear-gradient(135deg,#f4d06f,#d6a848)' : 'rgba(255,255,255,0.55)',
              border: format === value ? '1.5px solid #b8904a' : '1px solid rgba(107,76,42,0.18)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <nav
        aria-label="Навигация по странице матчапов"
        className="standard-matchups__index flex gap-2 overflow-x-auto rounded-2xl border border-[#d7b56e]/60 bg-[#fff8e4]/82 p-2 scrollbar-hs"
      >
        {[
          ['#matchups-picker', 'Подбор'],
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
        <button
          type="button"
          onClick={openMatrix}
          className="shrink-0 rounded-xl border border-[#d7b56e]/70 bg-white/75 px-4 py-2 text-sm font-black text-[#3d2208] transition hover:bg-[#fff3c4] focus:outline-none focus:ring-2 focus:ring-[#d6a848]"
        >
          Полная матрица
        </button>
      </nav>

      <div className="grid grid-cols-1 gap-5">
        <section
          className="standard-matchups__ledger rounded-2xl p-4 sm:p-5"
          aria-busy={loading}
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
              <button type="button" onClick={() => setReloadToken(value => value + 1)}>Повторить</button>
            </div>
          )}

          {loading && rows.length === 0 ? (
            <div className="py-16 text-center text-[#7a5a35]">Загружаем матчапы...</div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-[#7a5a35]">Данные матчапов пока недоступны.</div>
          ) : (
            <>
              <div className="standard-matchups__view-switcher mb-4" role="group" aria-label="Режим просмотра">
                <button
                  type="button"
                  aria-pressed={view === 'overview'}
                  onClick={() => setView('overview')}
                >
                  <ListFilter size={17} aria-hidden="true" />
                  Обзор архетипа
                </button>
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

              {view === 'matrix' && (
              <>
              <div className="standard-matchups__matrix-guide mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <label className="standard-matchups__matrix-search">
                  <Search size={16} aria-hidden="true" />
                  <span className="sr-only">Найти архетип в матрице</span>
                  <input
                    type="search"
                    value={matrixSearch}
                    onChange={event => setMatrixSearch(event.target.value)}
                    placeholder="Найти строку архетипа"
                  />
                </label>
                <div className="standard-matchups__matrix-arrows flex gap-2">
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
                ref={matrixTopScrollRef}
                className="standard-matchups__matrix-scrollbar standard-matchups__matrix-scrollbar--top scrollbar-hs"
                tabIndex={0}
                role="region"
                aria-label="Верхняя горизонтальная прокрутка матрицы"
                onScroll={event => syncMatrixScroll(event.currentTarget)}
              >
                <div
                  className="standard-matchups__matrix-scrollbar-sizer"
                  aria-hidden="true"
                  style={{
                    '--matrix-desktop-width': `${Math.max(1280, 250 + (columns.length * 130))}px`,
                    '--matrix-mobile-width': `${Math.max(940, 190 + (columns.length * 96))}px`,
                  } as React.CSSProperties}
                />
              </div>
              <div
                ref={matrixScrollRef}
                id="matchups-matrix"
                tabIndex={0}
                aria-label={`Прокручиваемая таблица матчапов: ${formatLabel}, ${data.rankLabel}`}
                className="standard-matchups__matrix scroll-mt-4 overflow-x-auto pb-2 scrollbar-hs rounded-xl border border-[#b8904a]/45 bg-[#fffdf4]/78 focus:outline-none focus:ring-2 focus:ring-[#d6a848]"
                style={{ WebkitOverflowScrolling: 'touch', overscrollBehaviorX: 'contain', touchAction: 'pan-x' }}
                onScroll={event => syncMatrixScroll(event.currentTarget)}
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
                  {matrixRows.map((row, rowIndex) => {
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
                          const isActive = activeMatrixMatchup?.row.archetype === row.archetype
                            && activeMatrixMatchup.cell.opponent === cell.opponent;
                          return (
                            <td key={`${row.archetype}-${cell.opponent}`} className="p-1.5 text-center align-middle">
                              <button
                                type="button"
                                className="standard-matchups__matrix-cell h-9 sm:h-10 rounded-lg flex items-center justify-center font-bold text-xs sm:text-sm"
                                title={`${rowLabel} против ${opponentLabel}: ${cell.winrate !== null ? `${cell.winrate.toFixed(1)}%` : 'нет данных'}`}
                                aria-label={`Открыть матчап: ${rowLabel} против ${opponentLabel}, ${cell.winrate !== null ? `${cell.winrate.toFixed(1)} процента` : 'нет данных'}`}
                                aria-haspopup="dialog"
                                aria-expanded={isActive}
                                aria-controls={isActive ? 'standard-matchups-cell-dialog' : undefined}
                                data-matchup-cell={`${row.archetype}::${cell.opponent}`}
                                onClick={event => openMatrixMatchup(event, row, cell, rowLabel, opponentLabel)}
                                style={standardMatchupTone(cell.winrate)}
                              >
                                {cell.winrate !== null ? `${cell.winrate.toFixed(1)}%` : '—'}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="standard-matchups__matrix-footer">
                  <tr>
                    <th scope="col" className="text-left px-3 sm:px-4 py-3 min-w-[190px] sm:min-w-[250px]">
                      <span className="block text-sm font-black">Соперники</span>
                      <span className="standard-matchups__matrix-footer-hint block text-[11px] mt-0.5">нижняя панель архетипов</span>
                    </th>
                    {columns.map(column => {
                      const columnLabel = getStandardArchetypeLabel(column.name, column.label);
                      return (
                        <th
                          key={`footer-${column.name}`}
                          scope="col"
                          className="px-2 sm:px-3 py-3 text-center min-w-[96px] sm:min-w-[130px]"
                          data-matchups-bottom-archetype={column.name}
                        >
                          <span
                            className="block text-[10px] sm:text-xs leading-tight"
                            title={columnLabel !== column.name ? `${columnLabel} (${column.name})` : column.name}
                          >
                            {columnLabel}
                          </span>
                          {column.popularity && <span className="standard-matchups__matrix-footer-popularity block text-[10px] mt-1">{column.popularity}</span>}
                        </th>
                      );
                    })}
                  </tr>
                </tfoot>
              </table>
              </div>
              {activeMatrixMatchup && (() => {
                const assessment = standardMatchupAssessment(activeMatrixMatchup.cell.winrate);
                const tooltipStyle: React.CSSProperties = {
                  left: activeMatrixMatchup.left,
                  top: activeMatrixMatchup.top,
                  transform: activeMatrixMatchup.placement === 'above' ? 'translateY(-100%)' : undefined,
                };
                return (
                  <div
                    ref={matchupTooltipRef}
                    id="standard-matchups-cell-dialog"
                    role="dialog"
                    aria-modal="false"
                    aria-label={`Матчап: ${activeMatrixMatchup.rowLabel} против ${activeMatrixMatchup.opponentLabel}`}
                    className={`standard-matchups__tooltip standard-matchups__tooltip--${activeMatrixMatchup.placement}`}
                    style={tooltipStyle}
                  >
                    <div className="standard-matchups__tooltip-cloth">
                      <div className="standard-matchups__tooltip-heading">
                        <div>
                          <span className="standard-matchups__tooltip-kicker">Матчап · {formatLabel} · {data.rankLabel}</span>
                          <h3>{activeMatrixMatchup.rowLabel}</h3>
                        </div>
                        <button
                          type="button"
                          onClick={() => closeMatrixMatchup(true)}
                          aria-label="Закрыть карточку матчапа"
                        >
                          <X size={18} aria-hidden="true" />
                        </button>
                      </div>
                      <div className="standard-matchups__tooltip-opponent">
                        <span>против</span>
                        <strong>{activeMatrixMatchup.opponentLabel}</strong>
                      </div>
                      <div className="standard-matchups__tooltip-result">
                        <strong>{activeMatrixMatchup.cell.winrate !== null ? `${activeMatrixMatchup.cell.winrate.toFixed(1)}%` : '—'}</strong>
                        <span className={`standard-matchups__tooltip-badge standard-matchups__tooltip-badge--${assessment.tone}`}>
                          {assessment.label}
                        </span>
                      </div>
                      <p>{assessment.detail}</p>
                      {(activeMatrixMatchup.rowLabel !== activeMatrixMatchup.row.archetype
                        || activeMatrixMatchup.opponentLabel !== activeMatrixMatchup.cell.opponent) && (
                        <small>
                          {activeMatrixMatchup.row.archetype} vs {activeMatrixMatchup.cell.opponent}
                        </small>
                      )}
                    </div>
                  </div>
                );
              })()}
              </>
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

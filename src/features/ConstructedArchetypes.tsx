import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpenText,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  ExternalLink,
  Gamepad2,
  Search,
  Sparkles,
  Swords,
  TrendingUp,
} from 'lucide-react';
import '../route-parchment.css';
import './ConstructedArchetypes.css';
import ConstructedArchetypeDeckGallery from './ConstructedArchetypeDeckGallery';
import {
  AsyncSurfaceState,
  RecoverableSurfaceBoundary,
} from './recovery/RecoverableSurface';

type ArchetypeFormat = 'standard' | 'wild';
type ArchetypeClass =
  | 'deathknight'
  | 'demonhunter'
  | 'druid'
  | 'hunter'
  | 'mage'
  | 'paladin'
  | 'priest'
  | 'rogue'
  | 'shaman'
  | 'warlock'
  | 'warrior';

type ArchetypeBuild = {
  deckCode: string;
  games: number | null;
  winrate: number | null;
  sourceUrl: string;
  updatedAt: string | null;
  classKey: ArchetypeClass | null;
  sampleRank: string;
  samplePeriod: string;
};

type ArchetypeItem = {
  slug: string;
  archetype: string;
  archetypeLabel: string;
  translated: boolean;
  classKey: ArchetypeClass | null;
  format: ArchetypeFormat;
  games: number;
  winrate: number | null;
  popularity: number | null;
  turns: number | null;
  durationMinutes: number | null;
  climbingSpeed: number | null;
  deckCount: number;
  builds: ArchetypeBuild[];
  sourceUrl: string;
};

type ArchetypeCatalog = {
  format: ArchetypeFormat;
  formatLabel: string;
  patch: string;
  minimumGames: number;
  updatedAt: string | null;
  coverage: Record<string, unknown>;
  items: ArchetypeItem[];
};

type HistoryPoint = {
  recordedAt: string;
  games: number;
  winrate: number | null;
  popularity: number | null;
  turns: number | null;
  durationMinutes: number | null;
  climbingSpeed: number | null;
};

type ArchetypeDetail = Omit<ArchetypeCatalog, 'coverage' | 'items'> & {
  item: ArchetypeItem;
  history: HistoryPoint[];
};

type SortKey = 'games' | 'winrate' | 'popularity' | 'decks' | 'name';

const FORMATS: Array<{ id: ArchetypeFormat; label: string; description: string; asset: string }> = [
  {
    id: 'standard',
    label: 'Стандарт',
    description: 'Карты текущей ротации',
    asset: '/card-format-standard.webp',
  },
  {
    id: 'wild',
    label: 'Вольный',
    description: 'Карты всех дополнений',
    asset: '/card-format-wild.webp',
  },
];

const SORTS: Array<{ id: SortKey; label: string }> = [
  { id: 'games', label: 'По числу игр' },
  { id: 'winrate', label: 'По винрейту' },
  { id: 'popularity', label: 'По популярности' },
  { id: 'decks', label: 'По числу сборок' },
  { id: 'name', label: 'По названию' },
];

const CLASS_LABELS: Record<ArchetypeClass, string> = {
  deathknight: 'Рыцарь смерти',
  demonhunter: 'Охотник на демонов',
  druid: 'Друид',
  hunter: 'Охотник',
  mage: 'Маг',
  paladin: 'Паладин',
  priest: 'Жрец',
  rogue: 'Разбойник',
  shaman: 'Шаман',
  warlock: 'Чернокнижник',
  warrior: 'Воин',
};

async function apiJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    signal,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Сервер временно недоступен');
  return payload as T;
}

function classIcon(classKey: ArchetypeClass | null): string {
  return classKey ? `/class_icon/ui/${classKey}-64.webp` : '/class_icon/neutral.webp';
}

function formatNumber(value: number | null, suffix = '', maximumFractionDigits = 1): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('ru-RU', { maximumFractionDigits })}${suffix}`;
}

function formatDate(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Нет данных';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function winrateTone(value: number | null): 'strong' | 'even' | 'weak' | 'neutral' {
  if (value === null) return 'neutral';
  if (value >= 52) return 'strong';
  if (value >= 49) return 'even';
  return 'weak';
}

function CopyDeckCodeButton({ code, compact = false }: { code: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    let success = false;
    try {
      await navigator.clipboard.writeText(code);
      success = true;
    } catch {
      const input = document.createElement('textarea');
      input.value = code;
      input.setAttribute('readonly', '');
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      success = document.execCommand('copy');
      input.remove();
    }
    if (success) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <button
      type="button"
      className={`archetype-copy-button${compact ? ' archetype-copy-button--compact' : ''}${copied ? ' archetype-copy-button--copied' : ''}`}
      onClick={copy}
      aria-label={copied ? 'Код колоды скопирован' : 'Скопировать код колоды'}
    >
      {copied ? <Check size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}
      <span aria-live="polite">{copied ? 'Скопировано' : 'Скопировать код'}</span>
    </button>
  );
}

function LoadingState({ detail = false }: { detail?: boolean }) {
  return (
    <div className={`archetypes-loading${detail ? ' archetypes-loading--detail' : ''}`} aria-busy="true" aria-label="Загрузка архетипов">
      <div className="archetypes-loading__bar" />
      <div className="archetypes-loading__bar" />
      <div className="archetypes-loading__bar" />
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <AsyncSurfaceState
      variant="error"
      title="Не удалось открыть архетипы"
      message={message}
      actionLabel="Повторить запрос"
      onAction={onRetry}
      className="archetypes-state"
    />
  );
}

function TrendChart({
  title,
  unit,
  points,
  value,
  color,
}: {
  title: string;
  unit: string;
  points: HistoryPoint[];
  value: (point: HistoryPoint) => number | null;
  color: string;
}) {
  const usable = points
    .map(point => ({ point, value: value(point) }))
    .filter((entry): entry is { point: HistoryPoint; value: number } => entry.value !== null && Number.isFinite(entry.value));
  const width = 620;
  const height = 190;
  const left = 42;
  const right = 18;
  const top = 18;
  const bottom = 34;
  const values = usable.map(entry => entry.value);
  const rawMin = values.length ? Math.min(...values) : 0;
  const rawMax = values.length ? Math.max(...values) : 1;
  const padding = Math.max((rawMax - rawMin) * 0.16, unit === '%' ? 0.5 : Math.max(rawMax * 0.025, 1));
  const min = rawMin - padding;
  const max = rawMax + padding;
  const span = Math.max(max - min, 1);
  const x = (index: number) => left + (usable.length <= 1 ? (width - left - right) / 2 : (index / (usable.length - 1)) * (width - left - right));
  const y = (entryValue: number) => top + (1 - ((entryValue - min) / span)) * (height - top - bottom);
  const path = usable.map((entry, index) => `${index ? 'L' : 'M'} ${x(index).toFixed(1)} ${y(entry.value).toFixed(1)}`).join(' ');
  const latest = usable.at(-1);

  return (
    <section className="archetype-trend">
      <header>
        <div>
          <span>{title}</span>
          <strong>{latest ? formatNumber(latest.value, unit) : '—'}</strong>
        </div>
        <small>{usable.length > 1 ? `${usable.length} срезов` : 'История накапливается'}</small>
      </header>
      <div
        className="archetype-trend__viewport"
        tabIndex={0}
        aria-label={`${title}: прокручиваемый график`}
      >
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}: ${usable.length} исторических точек`}>
          <title>{title} во времени</title>
          <desc>График пополняется после каждого двенадцатичасового обновления HSGuru.</desc>
          {[0, 0.5, 1].map(fraction => {
            const rowY = top + fraction * (height - top - bottom);
            const label = max - fraction * span;
            return (
              <g key={fraction} className="archetype-trend__grid">
                <line x1={left} x2={width - right} y1={rowY} y2={rowY} />
                <text x={left - 8} y={rowY + 4} textAnchor="end">{formatNumber(label, unit, unit === '%' ? 1 : 0)}</text>
              </g>
            );
          })}
          {usable.length > 1 && <path d={path} className="archetype-trend__line" style={{ stroke: color }} />}
          {usable.map((entry, index) => (
            <circle
              key={`${entry.point.recordedAt}-${entry.value}`}
              cx={x(index)}
              cy={y(entry.value)}
              r={index === usable.length - 1 ? 5 : 3.5}
              style={{ fill: color }}
            >
              <title>{`${formatDate(entry.point.recordedAt)} — ${formatNumber(entry.value, unit)}`}</title>
            </circle>
          ))}
          {usable[0] && <text className="archetype-trend__date" x={left} y={height - 8}>{formatDate(usable[0].point.recordedAt)}</text>}
          {usable.length > 1 && (
            <text className="archetype-trend__date" x={width - right} y={height - 8} textAnchor="end">
              {formatDate(usable.at(-1)?.point.recordedAt ?? null)}
            </text>
          )}
        </svg>
      </div>
    </section>
  );
}

function ArchetypeCatalogPage({
  navigatePath,
}: {
  navigatePath: (path: string) => void;
}) {
  const initialFormat = new URLSearchParams(window.location.search).get('format') === 'wild' ? 'wild' : 'standard';
  const [format, setFormat] = useState<ArchetypeFormat>(initialFormat);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [sort, setSort] = useState<SortKey>('games');
  const [catalog, setCatalog] = useState<ArchetypeCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void apiJson<ArchetypeCatalog>(`/api/constructed-archetypes?format=${format}`, controller.signal)
      .then(setCatalog)
      .catch(cause => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          setError(cause instanceof Error ? cause.message : 'Не удалось загрузить каталог');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [format, revision]);

  const selectFormat = (next: ArchetypeFormat) => {
    setFormat(next);
    setQuery('');
    window.history.replaceState(window.history.state, '', `/standard/archetypes?format=${next}`);
  };

  const items = useMemo(() => {
    const normalized = deferredQuery.trim().toLocaleLowerCase('ru-RU');
    const filtered = (catalog?.items ?? []).filter(item => (
      !normalized || `${item.archetype} ${item.archetypeLabel}`.toLocaleLowerCase('ru-RU').includes(normalized)
    ));
    return [...filtered].sort((left, right) => {
      if (sort === 'name') return left.archetypeLabel.localeCompare(right.archetypeLabel, 'ru');
      const leftValue = sort === 'decks' ? left.deckCount : left[sort];
      const rightValue = sort === 'decks' ? right.deckCount : right[sort];
      return Number(rightValue ?? -Infinity) - Number(leftValue ?? -Infinity);
    });
  }, [catalog?.items, deferredQuery, sort]);

  const totalBuilds = catalog?.items.reduce((sum, item) => sum + item.deckCount, 0) ?? 0;
  const totalGames = catalog?.items.reduce((sum, item) => sum + item.games, 0) ?? 0;

  return (
    <main className="archetypes-page" id="main-content" tabIndex={-1}>
      <section className="archetypes-hero">
        <div className="archetypes-hero__copy">
          <span className="archetypes-eyebrow"><Sparkles size={15} /> HSGuru · текущий патч</span>
          <h1>Архетипы Hearthstone</h1>
          <p>Живая мета Стандарта и Вольного режима: сила архетипа, популярность, готовые сборки и история изменений.</p>
          <a
            className="archetypes-hero__meta-link"
            href="/standard/meta/"
            onClick={event => {
              event.preventDefault();
              navigatePath('/standard/meta');
            }}
          >
            <BarChart3 size={17} aria-hidden="true" />
            Перейти к тир-листу меты
          </a>
        </div>
        <dl className="archetypes-hero__summary" aria-label="Сводка каталога">
          <div><dt>Архетипов</dt><dd>{catalog?.items.length ?? '—'}</dd></div>
          <div><dt>Сборок</dt><dd>{totalBuilds.toLocaleString('ru-RU')}</dd></div>
          <div><dt>Игр в выборке</dt><dd>{totalGames ? totalGames.toLocaleString('ru-RU') : '—'}</dd></div>
        </dl>
      </section>

      <nav className="archetypes-format-switch" aria-label="Формат Hearthstone" data-tour-id="meta-controls">
        {FORMATS.map(item => (
          <button
            key={item.id}
            type="button"
            aria-pressed={format === item.id}
            onClick={() => selectFormat(item.id)}
          >
            <img src={item.asset} alt="" width="56" height="56" />
            <span><strong>{item.label}</strong><small>{item.description}</small></span>
            {format === item.id && <Check size={18} aria-hidden="true" />}
          </button>
        ))}
      </nav>

      <section className="archetypes-tools" aria-label="Поиск и сортировка">
        <div>
          <span className="archetypes-eyebrow"><BookOpenText size={14} /> Каталог</span>
          <strong>{catalog?.formatLabel ?? (format === 'standard' ? 'Стандарт' : 'Вольный')}</strong>
          <small>Патч {catalog?.patch || '—'} · минимум {catalog?.minimumGames ?? 50} игр · обновлено {formatDate(catalog?.updatedAt ?? null)}</small>
        </div>
        <label className="archetypes-search" data-tour-id="meta-search">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Найти архетип</span>
          <input value={query} onChange={event => setQuery(event.target.value)} type="search" placeholder="Найти архетип..." />
        </label>
        <label className="archetypes-sort">
          <span className="sr-only">Сортировка</span>
          <select value={sort} onChange={event => setSort(event.target.value as SortKey)}>
            {SORTS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          <ChevronDown size={17} aria-hidden="true" />
        </label>
      </section>

      {loading && <LoadingState />}
      {!loading && error && <ErrorState message={error} onRetry={() => setRevision(value => value + 1)} />}
      {!loading && !error && items.length === 0 && (
        <AsyncSurfaceState
          variant="empty"
          title="Архетипы не найдены"
          message="Попробуйте изменить запрос или выбрать другой формат."
          className="archetypes-state"
        />
      )}
      {!loading && !error && items.length > 0 && (
        <section className="archetypes-ledger" aria-label={`Архетипы: ${catalog?.formatLabel}`}>
          <header className="archetypes-ledger__header" data-tour-id="meta-results">
            <span>{items.length} архетипов со сборками</span>
            <span>Нажмите на строку, чтобы открыть подробную страницу</span>
          </header>
          <div className="archetypes-list">
            {items.map((item, index) => (
              <article className="archetype-row" key={`${item.format}:${item.slug}`}>
                <span className="archetype-row__rank" aria-label={`Место ${index + 1}`}>{index + 1}</span>
                <img className="archetype-row__class" src={classIcon(item.classKey)} alt="" width="52" height="52" loading="lazy" />
                <div className="archetype-row__identity">
                  <span>{item.classKey ? CLASS_LABELS[item.classKey] : 'Смешанный класс'}</span>
                  <h2>{item.archetypeLabel}</h2>
                  {item.translated && <small>{item.archetype}</small>}
                </div>
                <dl className="archetype-row__metrics">
                  <div><dt>Винрейт</dt><dd className={`metric-${winrateTone(item.winrate)}`}>{formatNumber(item.winrate, '%')}</dd></div>
                  <div><dt>Популярность</dt><dd>{formatNumber(item.popularity, '%')}</dd></div>
                  <div><dt>Игры</dt><dd>{item.games.toLocaleString('ru-RU')}</dd></div>
                  <div><dt>Сборки</dt><dd>{item.deckCount}</dd></div>
                </dl>
                <a
                  className="archetype-row__open"
                  href={`/standard/archetypes/${item.format}/${item.slug}`}
                  onClick={event => {
                    event.preventDefault();
                    navigatePath(`/standard/archetypes/${item.format}/${item.slug}`);
                  }}
                >
                  <span>Открыть</span>
                  <ArrowRight size={18} aria-hidden="true" />
                </a>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function ArchetypeDetailPage({
  format,
  slug,
  navigatePath,
}: {
  format: ArchetypeFormat;
  slug: string;
  navigatePath: (path: string) => void;
}) {
  const [detail, setDetail] = useState<ArchetypeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [visibleBuilds, setVisibleBuilds] = useState(6);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void apiJson<ArchetypeDetail>(`/api/constructed-archetypes/${format}/${slug}`, controller.signal)
      .then(payload => {
        setDetail(payload);
        document.title = `${payload.item.archetypeLabel} — сборки и статистика | Manacost Stats`;
      })
      .catch(cause => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          setError(cause instanceof Error ? cause.message : 'Не удалось открыть архетип');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [format, slug, revision]);

  if (loading) {
    return <main className="archetypes-page archetype-detail-page" id="main-content" tabIndex={-1}><LoadingState detail /></main>;
  }
  if (error || !detail) {
    return (
      <main className="archetypes-page archetype-detail-page" id="main-content" tabIndex={-1}>
        <button type="button" className="archetype-back" onClick={() => navigatePath('/standard/archetypes')}>
          <ArrowLeft size={18} /> Все архетипы
        </button>
        <ErrorState message={error || 'Архетип не найден'} onRetry={() => setRevision(value => value + 1)} />
      </main>
    );
  }

  const { item, history } = detail;
  const mainBuild = item.builds[0] ?? null;
  const shownBuilds = item.builds.slice(0, visibleBuilds);

  return (
    <main className="archetypes-page archetype-detail-page" id="main-content" tabIndex={-1}>
      <nav className="archetype-breadcrumb" aria-label="Навигационная цепочка">
        <a href="/standard/archetypes" onClick={event => { event.preventDefault(); navigatePath('/standard/archetypes'); }}>
          <ArrowLeft size={17} /> Архетипы
        </a>
        <span aria-hidden="true">/</span>
        <span>{detail.formatLabel}</span>
        <span aria-hidden="true">/</span>
        <strong>{item.archetypeLabel}</strong>
      </nav>

      <section className="archetype-dossier">
        <div className="archetype-dossier__identity">
          <img src={classIcon(item.classKey)} alt="" width="92" height="92" />
          <div>
            <span className="archetypes-eyebrow"><Swords size={15} /> {detail.formatLabel} · патч {detail.patch}</span>
            <h1>{item.archetypeLabel}</h1>
            {item.translated && <p>{item.archetype}</p>}
            <small>{item.classKey ? CLASS_LABELS[item.classKey] : 'Смешанный класс'} · данные HSGuru</small>
          </div>
        </div>
        <dl className="archetype-dossier__metrics">
          <div><dt>Винрейт</dt><dd className={`metric-${winrateTone(item.winrate)}`}>{formatNumber(item.winrate, '%')}</dd></div>
          <div><dt>Популярность</dt><dd>{formatNumber(item.popularity, '%')}</dd></div>
          <div><dt>Игры</dt><dd>{item.games.toLocaleString('ru-RU')}</dd></div>
          <div><dt>Сборки</dt><dd>{item.deckCount}</dd></div>
          <div><dt>Средний матч</dt><dd>{formatNumber(item.durationMinutes, ' мин')}</dd></div>
          <div><dt>Средний ход</dt><dd>{formatNumber(item.turns)}</dd></div>
        </dl>
      </section>

      {mainBuild && (
        <section className="archetype-main-build">
          <header>
            <div>
              <span className="archetypes-eyebrow"><Sparkles size={14} /> Главная сборка</span>
              <h2>Самая большая подтверждённая выборка</h2>
            </div>
            <div className="archetype-main-build__sample">
              <strong>{formatNumber(mainBuild.winrate, '%')}</strong>
              <span>{mainBuild.games?.toLocaleString('ru-RU') ?? '—'} игр</span>
            </div>
          </header>
          <div className="archetype-main-build__code">
            <code>{mainBuild.deckCode}</code>
            <CopyDeckCodeButton code={mainBuild.deckCode} />
          </div>
          <footer>
            <span><Clock3 size={15} /> Выборка: последние 30 дней, все ранги</span>
            {mainBuild.sourceUrl && <a href={mainBuild.sourceUrl} target="_blank" rel="noreferrer">Открыть на HSGuru <ExternalLink size={15} /></a>}
          </footer>
        </section>
      )}

      <section className="archetype-history" aria-labelledby="archetype-history-title">
        <header className="archetype-section-heading">
          <div>
            <span className="archetypes-eyebrow"><TrendingUp size={15} /> Накопительная статистика</span>
            <h2 id="archetype-history-title">История архетипа</h2>
            <p>Новый срез добавляется каждые 12 часов. Через несколько дней здесь будет виден тренд, а через месяц — полноценная история меты.</p>
          </div>
          <span className="archetype-section-heading__count">{history.length} срезов</span>
        </header>
        <div className="archetype-history__charts">
          <TrendChart title="Винрейт" unit="%" points={history} value={point => point.winrate} color="#2f7a3e" />
          <TrendChart title="Популярность" unit="%" points={history} value={point => point.popularity} color="#8d171d" />
          <TrendChart title="Количество игр" unit="" points={history} value={point => point.games} color="#8a5b24" />
        </div>
      </section>

      <section className="archetype-builds" aria-labelledby="archetype-builds-title">
        <header className="archetype-section-heading">
          <div>
            <span className="archetypes-eyebrow"><Gamepad2 size={15} /> Сборки HSGuru</span>
            <h2 id="archetype-builds-title">Колоды архетипа</h2>
            <p>Сборки отсортированы по размеру выборки. Код можно скопировать и сразу импортировать в Hearthstone.</p>
          </div>
          <span className="archetype-section-heading__count">{item.deckCount} сборок</span>
        </header>
        <ConstructedArchetypeDeckGallery
          builds={shownBuilds}
          format={item.format}
          archetype={item.archetype}
          classKey={item.classKey}
        />
        {visibleBuilds < item.builds.length && (
          <button type="button" className="archetype-builds__more" onClick={() => setVisibleBuilds(value => value + 6)}>
            Показать ещё {Math.min(6, item.builds.length - visibleBuilds)}
            <ChevronDown size={17} />
          </button>
        )}
      </section>

      <section className="archetype-methodology">
        <BarChart3 size={24} aria-hidden="true" />
        <div>
          <h2>Как читать данные</h2>
          <p>Статистика архетипа относится к текущему патчу и учитывает архетипы от {detail.minimumGames} игр. Сборки используют выборку HSGuru за последние 30 дней, поэтому их показатели могут отличаться от общей статистики архетипа.</p>
        </div>
      </section>
    </main>
  );
}

export default function ConstructedArchetypes({
  currentPath = window.location.pathname,
  navigatePath = path => window.location.assign(path),
}: {
  currentPath?: string;
  navigatePath?: (path: string) => void;
}) {
  const detailMatch = currentPath.match(/^\/standard\/(?:archetypes|meta)\/(standard|wild)\/([a-z0-9-]+)\/?$/);
  const content = detailMatch
    ? (
      <ArchetypeDetailPage
        format={detailMatch[1] as ArchetypeFormat}
        slug={detailMatch[2]}
        navigatePath={navigatePath}
      />
    )
    : <ArchetypeCatalogPage navigatePath={navigatePath} />;
  return (
    <RecoverableSurfaceBoundary scope="constructed-archetypes">
      {content}
    </RecoverableSurfaceBoundary>
  );
}

export { DeckModal } from './StandardMetaDeckModal';

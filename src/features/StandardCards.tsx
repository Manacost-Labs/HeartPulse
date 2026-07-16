import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Database,
  ExternalLink,
  Grid3X3,
  Layers3,
  List,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Volume2,
} from 'lucide-react';
import '../route-parchment.css';
import ConstructedCardLightbox from './ConstructedCardLightbox';
import { compareConstructedSets, constructedSetLabel, constructedSoundGroupLabel } from './constructedCardLabels';
import { collectConstructedCardMedia, flattenConstructedCardSounds } from './constructedCardMedia';
import './StandardCards.css';

type CardFormat = 'standard' | 'wild';
type ViewMode = 'gallery' | 'table';

type CardStats = {
  deckPopularity: number | null;
  deckWinrate: number | null;
  averageCopies: number | null;
  timesPlayed: number | null;
  winrateWhenPlayed: number | null;
  winrateWhenDrawn: number | null;
  keepPercentage: number | null;
  openingHandWinrate: number | null;
  averageTurnsInHand: number | null;
  averageTurnPlayed: number | null;
};

type CardRecord = {
  card_id: string;
  dbf: number | null;
  slug?: string;
  formats?: Array<{ slug: string; name_ru?: string; name_en?: string }>;
  name?: { ru?: string | null; en?: string | null };
  text?: { ru?: string | null; en?: string | null };
  flavor?: { ru?: string | null; en?: string | null };
  card_set?: string | null;
  card_type?: { slug?: string | null; name_ru?: string | null };
  rarity?: string | null;
  class?: string | null;
  multi_class?: string[];
  minion_type?: string | null;
  spell_school?: string | null;
  mana_cost?: number | null;
  attack?: number | null;
  health?: number | null;
  durability?: number | null;
  armor?: number | null;
  artist?: string | null;
  images?: {
    card?: string | null;
    golden?: string | null;
    signature?: string | null;
    diamond?: string | null;
    crop?: string | null;
    animated?: Record<string, string | null>;
  };
  mechanics?: string[];
  referenced_tags?: string[];
  wiki_page?: { title?: string | null; url?: string | null };
  stats: CardStats | null;
  statsUpdatedAt?: string | null;
  statsSourceUrl?: string | null;
  catalogPending?: boolean;
  wiki?: Record<string, any>;
  mechanicTranslations?: Record<string, string>;
};

type Facets = {
  classes: string[];
  sets: string[];
  mechanics: string[];
  types: string[];
  rarities: string[];
};

type FacetCount = { value: string; count: number };
type FacetCounts = { classes: FacetCount[]; sets: FacetCount[]; mechanics: FacetCount[]; types: FacetCount[]; rarities: FacetCount[] };
type CardCoverage = { totalCards: number; cardsWithStats: number; cardsWithoutStats: number; totalSets: number };

type ListPayload = {
  format: CardFormat;
  rank: 'legend';
  updatedAt: string | null;
  sourceUrl: string;
  cards: CardRecord[];
  facets: Facets;
  facetCounts?: FacetCounts;
  mechanicTranslations?: Record<string, string>;
  coverage?: CardCoverage;
  pagination: { page: number; perPage: number; total: number; totalPages: number };
};

type Filters = {
  query: string;
  class: string;
  set: string;
  mana: string;
  attack: string;
  health: string;
  mechanic: string;
  type: string;
  rarity: string;
  sort: string;
  direction: 'asc' | 'desc';
};

type StandardCardsProps = {
  currentPath: string;
  navigatePath: (path: string) => void;
};

const EMPTY_FACETS: Facets = { classes: [], sets: [], mechanics: [], types: [], rarities: [] };
const EMPTY_FACET_COUNTS: FacetCounts = { classes: [], sets: [], mechanics: [], types: [], rarities: [] };
const EMPTY_FILTERS: Filters = {
  query: '', class: '', set: '', mana: '', attack: '', health: '', mechanic: '', type: '', rarity: '', sort: 'popularity', direction: 'desc',
};

const CLASS_LABELS: Record<string, string> = {
  DEATHKNIGHT: 'Рыцарь смерти', DEMONHUNTER: 'Охотник на демонов', DRUID: 'Друид', HUNTER: 'Охотник',
  MAGE: 'Маг', PALADIN: 'Паладин', PRIEST: 'Жрец', ROGUE: 'Разбойник', SHAMAN: 'Шаман',
  WARLOCK: 'Чернокнижник', WARRIOR: 'Воин', NEUTRAL: 'Нейтральные', DREAM: 'Сон',
};
const RARITY_LABELS: Record<string, string> = {
  FREE: 'Базовая', COMMON: 'Обычная', RARE: 'Редкая', EPIC: 'Эпическая', LEGENDARY: 'Легендарная',
};
const TYPE_LABELS: Record<string, string> = {
  MINION: 'Существо', SPELL: 'Заклинание', WEAPON: 'Оружие', LOCATION: 'Локация', HERO: 'Герой', ENCHANTMENT: 'Эффект',
};
const MECHANIC_LABELS: Record<string, string> = {
  BATTLECRY: 'Боевой клич', DEATHRATTLE: 'Предсмертный хрип', TAUNT: 'Провокация', DIVINE_SHIELD: 'Божественный щит',
  RUSH: 'Натиск', CHARGE: 'Рывок', LIFESTEAL: 'Похищение жизни', POISONOUS: 'Яд', REBORN: 'Перерождение',
  DISCOVER: 'Раскопка', SECRET: 'Секрет', COMBO: 'Серия приёмов', OVERLOAD: 'Перегрузка', WINDFURY: 'Неистовство ветра',
  STEALTH: 'Маскировка', FREEZE: 'Заморозка', TRADEABLE: 'Обмен', TITAN: 'Титан', COLOSSAL: 'Колосс',
  FORGE: 'Ковка', FINALE: 'Финал', OUTCAST: 'Изгой', SPELLBURST: 'Чары', HONORABLE_KILL: 'Достойная победа',
};
const GENERATED_POOL_LABELS: Record<string, string> = {
  'Fire spells': 'Огненные заклинания',
  'Arcane spells': 'Чародейские заклинания',
  'Frost spells': 'Ледяные заклинания',
  'Nature spells': 'Заклинания природы',
  'Holy spells': 'Заклинания Света',
  'Shadow spells': 'Заклинания Тьмы',
  'Fel spells': 'Заклинания Скверны',
  'Spell cards': 'Карты заклинаний',
  'Minion cards': 'Карты существ',
  'Weapon cards': 'Карты оружия',
};

function cardName(card: CardRecord): string {
  return card.name?.ru || card.name?.en || card.card_id;
}

function translatedCode(value: string, dictionary?: Record<string, string>): string {
  if (dictionary?.[value]) return dictionary[value];
  return value.toLocaleLowerCase('ru').replace(/_/g, ' ').replace(/(^|\s)\S/g, letter => letter.toLocaleUpperCase('ru'));
}

function classLabel(value: string): string {
  return translatedCode(value, CLASS_LABELS);
}

function mechanicLabel(value: string, translations?: Record<string, string>): string {
  const key = value.toLocaleUpperCase('en-US');
  return translations?.[key] || translatedCode(value, MECHANIC_LABELS);
}

function generatedPoolLabel(value: unknown): string {
  const label = String(value ?? '').trim();
  return GENERATED_POOL_LABELS[label] || label || 'Сгенерированные карты';
}

function facetOptionLabel(value: string, count: number | undefined, label: (value: string) => string): string {
  return `${label(value)}${typeof count === 'number' ? ` (${count.toLocaleString('ru-RU')})` : ''}`;
}

function percent(value: number | null | undefined): string {
  return value === null || value === undefined ? 'Нет данных' : `${value.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`;
}

function number(value: number | null | undefined): string {
  return value === null || value === undefined ? 'Нет данных' : value.toLocaleString('ru-RU');
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'нет данных';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : value;
}

function plainText(value: string | null | undefined): string {
  if (!value) return '';
  const element = document.createElement('textarea');
  element.innerHTML = value.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
  return element.value.trim();
}

function routeState(path: string): { page: 'list' | 'detail'; format: CardFormat; cardId: string | null } {
  const normalized = decodeURIComponent(path).replace(/\?.*$/, '').replace(/\/+$/, '');
  const match = normalized.match(/^\/standard\/cards\/(standard|wild)\/([a-zA-Z0-9_]{2,80})$/);
  if (match) return { page: 'detail', format: match[1] as CardFormat, cardId: match[2] };
  const listMatch = normalized.match(/^\/standard\/cards\/(standard|wild)$/);
  return { page: 'list', format: listMatch?.[1] as CardFormat || 'standard', cardId: null };
}

function cardPath(format: CardFormat, card: CardRecord): string {
  return `/standard/cards/${format}/${encodeURIComponent(card.card_id)}`;
}

function classIcon(cardClass?: string | null): string {
  const key = String(cardClass || 'neutral').toLocaleLowerCase().replace(/_/g, '');
  return key === 'neutral' ? '/class_icon/neutral.webp' : `/class_icon/ui/${key}-64.webp`;
}

function FilterSelect({ label, value, onChange, children }: {
  label: string; value: string; onChange: (value: string) => void; children: React.ReactNode;
}) {
  return (
    <label className="constructed-cards__filter">
      <span>{label}</span>
      <select value={value} onChange={event => onChange(event.target.value)}>{children}</select>
    </label>
  );
}

function StatsRows({ stats, compact = false }: { stats: CardStats | null; compact?: boolean }) {
  const rows = [
    ['В % колод', percent(stats?.deckPopularity)],
    ['Победы колод', percent(stats?.deckWinrate)],
    ['Победы при розыгрыше', percent(stats?.winrateWhenPlayed)],
    ['Победы при получении', percent(stats?.winrateWhenDrawn)],
    ['Оставлено на старте', percent(stats?.keepPercentage)],
    ...(!compact ? [
      ['Победы со стартовой рукой', percent(stats?.openingHandWinrate)],
      ['Средний ход розыгрыша', number(stats?.averageTurnPlayed)],
      ['Среднее копий', number(stats?.averageCopies)],
    ] : []),
    ['Сыграно партий', number(stats?.timesPlayed)],
  ];
  return (
    <dl className={`constructed-cards__stats${compact ? ' constructed-cards__stats--compact' : ''}`}>
      {rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
  );
}

function HoverTooltip({ card, rect }: { card: CardRecord; rect: DOMRect }) {
  const width = 320;
  const left = rect.right + width + 18 <= window.innerWidth ? rect.right + 10 : Math.max(10, rect.left - width - 10);
  const top = Math.max(10, Math.min(rect.top + rect.height * 0.12, window.innerHeight - 390));
  return (
    <aside className="constructed-cards__tooltip" style={{ left, top, width }} role="tooltip">
      <div className="constructed-cards__tooltip-header"><strong>{cardName(card)}</strong><span>Статистика · Легенда</span></div>
      <StatsRows stats={card.stats} compact />
    </aside>
  );
}

function CardGallery({ cards, format, navigatePath }: { cards: CardRecord[]; format: CardFormat; navigatePath: (path: string) => void }) {
  const [hovered, setHovered] = useState<{ card: CardRecord; rect: DOMRect } | null>(null);
  const showTooltip = (card: CardRecord, element: HTMLElement) => setHovered({ card, rect: element.getBoundingClientRect() });
  return (
    <>
      <div className="constructed-cards__gallery">
        {cards.map(card => (
          <a
            key={card.card_id}
            href={cardPath(format, card)}
            className="constructed-cards__gallery-card"
            onMouseEnter={event => showTooltip(card, event.currentTarget)}
            onMouseLeave={() => setHovered(null)}
            onFocus={event => showTooltip(card, event.currentTarget)}
            onBlur={() => setHovered(null)}
            onClick={event => { event.preventDefault(); navigatePath(cardPath(format, card)); }}
          >
            <img src={card.images?.card || '/arena-logo-icon.webp?v=arena-legacy-20260629'} alt={cardName(card)} loading="lazy" />
            <span className="constructed-cards__gallery-name">{cardName(card)}</span>
            <span className="constructed-cards__gallery-stat"><small>В % колод</small><strong>{percent(card.stats?.deckPopularity)}</strong></span>
          </a>
        ))}
      </div>
      {hovered && <HoverTooltip card={hovered.card} rect={hovered.rect} />}
    </>
  );
}

function CardTable({ cards, format, navigatePath }: { cards: CardRecord[]; format: CardFormat; navigatePath: (path: string) => void }) {
  return (
    <div className="constructed-cards__table-wrap">
      <table className="constructed-cards__table">
        <thead><tr><th>Карта</th><th>Класс</th><th>Дополнение</th><th>Мана</th><th>Атака</th><th>Здоровье</th><th>В % колод</th><th>Победы колод</th><th>Партий</th></tr></thead>
        <tbody>
          {cards.map(card => (
            <tr key={card.card_id}>
              <th scope="row"><a href={cardPath(format, card)} onClick={event => { event.preventDefault(); navigatePath(cardPath(format, card)); }}><img src={card.images?.crop || card.images?.card || ''} alt="" loading="lazy" /><span>{cardName(card)}<small>{card.name?.en}</small></span></a></th>
              <td><img className="constructed-cards__class-icon" src={classIcon(card.class)} alt="" />{classLabel(card.class || 'NEUTRAL')}</td>
              <td>{card.card_set ? constructedSetLabel(card.card_set) : '—'}</td><td>{number(card.mana_cost)}</td><td>{number(card.attack)}</td><td>{number(card.health)}</td>
              <td>{percent(card.stats?.deckPopularity)}</td><td>{percent(card.stats?.deckWinrate)}</td><td>{number(card.stats?.timesPlayed)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pagination({ page, totalPages, total, perPage, onPage }: { page: number; totalPages: number; total: number; perPage: number; onPage: (page: number) => void }) {
  if (total <= 0) return null;
  const pages = [...new Set([1, Math.max(1, page - 1), page, Math.min(totalPages, page + 1), totalPages])].sort((a, b) => a - b);
  return (
    <nav className="constructed-cards__pagination" aria-label="Страницы библиотеки">
      <span className="constructed-cards__page-summary">Страница {page} из {totalPages} · по {perPage} · всего {number(total)}</span>
      {totalPages > 1 && <>
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={17} /> Назад</button>
        {pages.map((item, index) => <React.Fragment key={item}>{index > 0 && item - pages[index - 1] > 1 && <span>…</span>}<button type="button" aria-current={item === page ? 'page' : undefined} onClick={() => onPage(item)}>{item}</button></React.Fragment>)}
        <button type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Вперёд <ChevronRight size={17} /></button>
      </>}
    </nav>
  );
}

function CardsListPage({ initialFormat, navigatePath }: Pick<StandardCardsProps, 'navigatePath'> & { initialFormat: CardFormat }) {
  const [format, setFormat] = useState<CardFormat>(initialFormat);
  const [view, setView] = useState<ViewMode>('gallery');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(60);
  const [data, setData] = useState<ListPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const deferredQuery = useDeferredValue(filters.query);

  useEffect(() => {
    setFormat(initialFormat);
    setPage(1);
  }, [initialFormat]);

  const requestKey = useMemo(() => JSON.stringify({ format, page, perPage, reloadToken, ...filters, query: deferredQuery }), [deferredQuery, filters, format, page, perPage, reloadToken]);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({ format, page: String(page), perPage: String(perPage), sort: filters.sort, direction: filters.direction });
        Object.entries({ ...filters, query: deferredQuery }).forEach(([key, value]) => {
          if (value && key !== 'sort' && key !== 'direction') params.set(key, String(value));
        });
        const response = await fetch(`/api/admin/constructed-cards?${params}`, { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: controller.signal });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить карты');
        setData(payload as ListPayload);
      } catch (loadError) {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить карты');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [requestKey]);

  const updateFilter = (key: keyof Filters, value: string) => {
    setFilters(current => ({ ...current, [key]: value }));
    setPage(1);
  };
  const changeFormat = (next: CardFormat) => {
    setFormat(next);
    setData(null);
    setPage(1);
    navigatePath(`/standard/cards/${next}`);
  };
  const reset = () => { setFilters(EMPTY_FILTERS); setPage(1); };
  const facets = data?.facets ?? EMPTY_FACETS;
  const facetCounts = data?.facetCounts ?? EMPTY_FACET_COUNTS;
  const countFor = (entries: FacetCount[], value: string) => entries.find(entry => entry.value === value)?.count;
  const sets = [...facets.sets].sort(compareConstructedSets);
  const coverage = data?.coverage;

  return (
    <div className="constructed-cards">
      <header className="constructed-cards__header">
        <div><h1>Карты</h1><div className="constructed-cards__beta"><span>Бета</span><span><ShieldCheck size={14} /> Только для администратора</span></div></div>
        <p>Ранг: <strong>Легенда</strong></p>
      </header>

      <dl className="constructed-cards__coverage" aria-label="Покрытие библиотеки">
        <div><dt><Database size={17} /> Карт в формате</dt><dd>{number(coverage?.totalCards)}</dd></div>
        <div><dt><Layers3 size={17} /> Дополнений</dt><dd>{number(coverage?.totalSets)}</dd></div>
        <div><dt><BarChart3 size={17} /> Со статистикой</dt><dd>{number(coverage?.cardsWithStats)}</dd></div>
      </dl>

      <section className="constructed-cards__controls" aria-label="Фильтры библиотеки карт">
        <div className="constructed-cards__primary-controls">
          <div className="constructed-cards__format" aria-label="Формат">
            <button type="button" aria-label="Стандарт" title="Стандарт" aria-pressed={format === 'standard'} onClick={() => changeFormat('standard')}><img src="/card-format-standard.webp" alt="" /><span className="sr-only">Стандарт</span></button>
            <button type="button" aria-label="Вольный" title="Вольный" aria-pressed={format === 'wild'} onClick={() => changeFormat('wild')}><img src="/card-format-wild.webp" alt="" /><span className="sr-only">Вольный</span></button>
          </div>
          <label className="constructed-cards__search"><Search size={18} /><input value={filters.query} onChange={event => updateFilter('query', event.target.value)} placeholder="Поиск по названию" /></label>
          <FilterSelect label="Сортировка" value={filters.sort} onChange={value => updateFilter('sort', value)}>
            <option value="popularity">В % колод</option><option value="winrate">Победы колод</option><option value="games">Сыграно партий</option><option value="mana">Мана</option><option value="attack">Атака</option><option value="health">Здоровье</option><option value="name">Название</option><option value="set">Дополнение</option><option value="class">Класс</option><option value="mechanics">Механики</option>
          </FilterSelect>
          <FilterSelect label="На странице" value={String(perPage)} onChange={value => { setPerPage(Number(value)); setPage(1); }}>
            <option value="60">60 карт</option><option value="120">120 карт</option>
          </FilterSelect>
          <button type="button" className="constructed-cards__direction" onClick={() => updateFilter('direction', filters.direction === 'asc' ? 'desc' : 'asc')} aria-label="Изменить направление сортировки">{filters.direction === 'asc' ? '↑' : '↓'}</button>
          <div className="constructed-cards__view" aria-label="Вид списка">
            <button type="button" aria-pressed={view === 'gallery'} onClick={() => setView('gallery')}><Grid3X3 size={16} /> Галерея</button>
            <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}><List size={17} /> Таблица</button>
          </div>
        </div>
        <div className="constructed-cards__secondary-controls">
          <FilterSelect label="Класс" value={filters.class} onChange={value => updateFilter('class', value)}><option value="">Все классы ({number(coverage?.totalCards)})</option>{facets.classes.map(value => <option key={value} value={value}>{facetOptionLabel(value, countFor(facetCounts.classes, value), classLabel)}</option>)}</FilterSelect>
          <FilterSelect label="Дополнение" value={filters.set} onChange={value => updateFilter('set', value)}><option value="">Все дополнения</option>{sets.map(value => <option key={value} value={value}>{constructedSetLabel(value)}</option>)}</FilterSelect>
          <FilterSelect label="Мана" value={filters.mana} onChange={value => updateFilter('mana', value)}><option value="">Любая</option>{Array.from({ length: 11 }, (_, value) => <option key={value} value={value}>{value}</option>)}</FilterSelect>
          <FilterSelect label="Атака" value={filters.attack} onChange={value => updateFilter('attack', value)}><option value="">Любая</option>{Array.from({ length: 11 }, (_, value) => <option key={value} value={value}>{value}</option>)}</FilterSelect>
          <FilterSelect label="Здоровье" value={filters.health} onChange={value => updateFilter('health', value)}><option value="">Любое</option>{Array.from({ length: 11 }, (_, value) => <option key={value} value={value}>{value}</option>)}</FilterSelect>
          <FilterSelect label="Механики" value={filters.mechanic} onChange={value => updateFilter('mechanic', value)}><option value="">Все механики</option>{facets.mechanics.map(value => <option key={value} value={value}>{mechanicLabel(value, data?.mechanicTranslations)}</option>)}</FilterSelect>
          <FilterSelect label="Тип" value={filters.type} onChange={value => updateFilter('type', value)}><option value="">Все типы</option>{facets.types.map(value => <option key={value} value={value}>{translatedCode(value, TYPE_LABELS)}</option>)}</FilterSelect>
          <FilterSelect label="Редкость" value={filters.rarity} onChange={value => updateFilter('rarity', value)}><option value="">Любая</option>{facets.rarities.map(value => <option key={value} value={value}>{translatedCode(value, RARITY_LABELS)}</option>)}</FilterSelect>
          <button type="button" className="constructed-cards__reset" onClick={reset}><RefreshCw size={16} /> Сбросить</button>
        </div>
      </section>

      <div className="constructed-cards__results-header">
        <p>Найдено: <strong>{number(data?.pagination.total)}</strong></p>
        <span>Статистика HSReplay · Легенда · последние сутки · обновлено {formatDate(data?.updatedAt)}</span>
      </div>

      {loading ? <section className="constructed-cards__state" aria-busy="true"><RefreshCw className="constructed-cards__spinner" size={34} /><h2>Загружаем библиотеку</h2><p>Объединяем список карт и статистику Легенды.</p></section>
        : error ? <section className="constructed-cards__state" role="alert"><h2>Не удалось загрузить карты</h2><p>{error}</p><button type="button" onClick={() => setReloadToken(value => value + 1)}><RefreshCw size={16} /> Повторить</button></section>
          : data && data.cards.length > 0 ? <>{view === 'gallery' ? <CardGallery cards={data.cards} format={format} navigatePath={navigatePath} /> : <CardTable cards={data.cards} format={format} navigatePath={navigatePath} />}<Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} total={data.pagination.total} perPage={data.pagination.perPage} onPage={setPage} /></>
            : <section className="constructed-cards__state"><Search size={34} /><h2>Карты не найдены</h2><p>Измените фильтры или сбросьте их.</p><button type="button" onClick={reset}><RefreshCw size={16} /> Сбросить фильтры</button></section>}
    </div>
  );
}

function variantImages(card: CardRecord): Array<{ id: string; label: string; url: string }> {
  return [
    ['normal', 'Обычная', card.images?.card], ['golden', 'Золотая', card.images?.golden],
    ['signature', 'Сигнатурная', card.images?.signature], ['diamond', 'Алмазная', card.images?.diamond],
  ].filter((entry): entry is [string, string, string] => Boolean(entry[2])).map(([id, label, url]) => ({ id, label, url }));
}

function GeneratedCardPools({ pools, format, navigatePath }: { pools: any[]; format: CardFormat; navigatePath: (path: string) => void }) {
  return (
    <section className="constructed-card-detail__section constructed-card-detail__pools">
      <h2><Layers3 size={19} /> Пулы генерации · {pools.length}</h2>
      <div className="constructed-card-detail__pool-list">
        {pools.map((pool, poolIndex) => {
          const cards = Array.isArray(pool?.cards) ? pool.cards : [];
          return (
            <details key={`${pool?.pool || 'pool'}-${poolIndex}`} open={poolIndex === 0}>
              <summary><strong>{generatedPoolLabel(pool?.pool)}</strong><span>{cards.length} карт</span></summary>
              <div className="constructed-card-detail__pool-cards">
                {cards.map((item: any, index: number) => {
                  const itemId = String(item?.card_id || item?.id || '').trim();
                  const name = item?.name?.ru || item?.name?.en || item?.name_ru || item?.title || itemId || 'Карта';
                  const image = item?.images?.card || item?.image_url || item?.image;
                  const internalUrl = item?.can_open && itemId ? `/standard/cards/${format}/${encodeURIComponent(itemId)}` : '';
                  const href = internalUrl || item?.url || undefined;
                  const content = <>{image ? <img src={image} alt="" loading="lazy" /> : <Sparkles size={28} />}<span>{name}</span></>;
                  return href ? (
                    <a
                      key={`${itemId || name}-${index}`}
                      href={href}
                      target={internalUrl ? undefined : '_blank'}
                      rel={internalUrl ? undefined : 'noreferrer'}
                      onClick={event => { if (!internalUrl) return; event.preventDefault(); navigatePath(internalUrl); }}
                    >{content}</a>
                  ) : <div className="constructed-card-detail__pool-card" key={`${itemId || name}-${index}`}>{content}</div>;
                })}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}

function DetailPage({ format, cardId, navigatePath }: { format: CardFormat; cardId: string; navigatePath: (path: string) => void }) {
  const [card, setCard] = useState<CardRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [variant, setVariant] = useState('normal');
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true); setError('');
      try {
        const response = await fetch(`/api/admin/constructed-cards/${encodeURIComponent(cardId)}?format=${format}`, { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: controller.signal });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить карту');
        setCard({ ...(payload.card as CardRecord), mechanicTranslations: payload.mechanicTranslations || {} });
        setVariant('normal');
        setLightboxIndex(-1);
      } catch (loadError) {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить карту');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void load();
    return () => controller.abort();
  }, [cardId, format]);
  useEffect(() => {
    if (!card) return undefined;
    const frame = requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }));
    return () => cancelAnimationFrame(frame);
  }, [card]);

  if (loading) return <section className="constructed-cards constructed-cards__state" aria-busy="true"><RefreshCw className="constructed-cards__spinner" size={36} /><h1>Загружаем карту</h1></section>;
  if (error || !card) return <section className="constructed-cards constructed-cards__state" role="alert"><h1>Карта не найдена</h1><p>{error}</p><button type="button" onClick={() => navigatePath(`/standard/cards/${format}`)}><ArrowLeft size={17} /> Назад к картам</button></section>;

  const variants = variantImages(card);
  const selectedImage = variants.find(item => item.id === variant)?.url || variants[0]?.url || '';
  const wiki = card.wiki || {};
  const mechanics = [...new Set([...(card.mechanics || []), ...(card.referenced_tags || []), ...(wiki.wiki_mechanics || []), ...(wiki.wiki_tags || [])])];
  const patchRows = (Array.isArray(wiki.patch_changes) ? wiki.patch_changes : []).flatMap((group: any) => (Array.isArray(group?.entries) ? group.entries : []).map((entry: any) => ({ ...entry, heading: group.heading })));
  const related = Array.isArray(wiki.related_cards) ? wiki.related_cards : [];
  const generatedPools = (Array.isArray(wiki.generated_card_pools) ? wiki.generated_card_pools : [])
    .filter((pool: any) => Array.isArray(pool?.cards) && pool.cards.length > 0);
  const mediaItems = collectConstructedCardMedia(card);
  const galleryMedia = mediaItems.filter(item => item.id.startsWith('gallery-'));
  const sounds = flattenConstructedCardSounds(wiki.sounds);
  const soundGroups = [...new Set(sounds.map(item => item.group))].map(group => [group, sounds.filter(item => item.group === group)] as const);
  const externalLinks = Array.isArray(wiki.external_links) ? wiki.external_links : [];
  const openMedia = (url: string) => {
    const index = mediaItems.findIndex(item => item.url === url);
    if (index >= 0) setLightboxIndex(index);
  };

  return (
    <article className="constructed-cards constructed-card-detail">
      <nav className="constructed-card-detail__breadcrumb" aria-label="Breadcrumb"><a href={`/standard/cards/${format}`} onClick={event => { event.preventDefault(); navigatePath(`/standard/cards/${format}`); }}>Карты</a><span>/</span><span>{format === 'standard' ? 'Стандарт' : 'Вольный'}</span><span>/</span><strong>{cardName(card)}</strong></nav>
      <button type="button" className="constructed-card-detail__back" onClick={() => navigatePath(`/standard/cards/${format}`)}><ArrowLeft size={17} /> Назад к картам</button>

      <section className="constructed-card-detail__hero">
        <div className="constructed-card-detail__visual">
          <button type="button" className="constructed-card-detail__visual-button" onClick={() => openMedia(selectedImage)} aria-label={`Открыть ${cardName(card)} в полном размере`}>
            <img src={selectedImage} alt={cardName(card)} />
            <span>Открыть в полном размере</span>
          </button>
          <div className="constructed-card-detail__variants" aria-label="Вариант изображения">{variants.map(item => <button key={item.id} type="button" aria-pressed={variant === item.id} onClick={() => setVariant(item.id)}>{item.label}</button>)}</div>
        </div>
        <div className="constructed-card-detail__identity">
          <div className="constructed-card-detail__title"><img src={classIcon(card.class)} alt="" /><div><h1>{cardName(card)}</h1><p>{card.name?.en}</p></div></div>
          <dl className="constructed-card-detail__meta">
            <div><dt>Мана</dt><dd>{number(card.mana_cost)}</dd></div><div><dt>Класс</dt><dd>{classLabel(card.class || 'NEUTRAL')}</dd></div>
            <div><dt>Тип</dt><dd>{card.card_type?.name_ru || translatedCode(card.card_type?.slug || '—', TYPE_LABELS)}</dd></div><div><dt>Редкость</dt><dd>{translatedCode(card.rarity || '—', RARITY_LABELS)}</dd></div>
            <div><dt>Дополнение</dt><dd>{card.card_set ? constructedSetLabel(card.card_set) : 'Не указано'}</dd></div><div><dt>Художник</dt><dd>{card.artist || 'Не указан'}</dd></div>
            {card.attack !== null && card.attack !== undefined && <div><dt>Атака</dt><dd>{card.attack}</dd></div>}{card.health !== null && card.health !== undefined && <div><dt>Здоровье</dt><dd>{card.health}</dd></div>}
            {card.durability !== null && card.durability !== undefined && <div><dt>Прочность</dt><dd>{card.durability}</dd></div>}{card.armor !== null && card.armor !== undefined && <div><dt>Броня</dt><dd>{card.armor}</dd></div>}
            {card.minion_type && <div><dt>Тип существа</dt><dd>{translatedCode(card.minion_type)}</dd></div>}{card.spell_school && <div><dt>Школа магии</dt><dd>{translatedCode(card.spell_school)}</dd></div>}
            <div><dt>Форматы</dt><dd>{card.formats?.map(item => item.name_ru || item.name_en || item.slug).join(', ') || (format === 'standard' ? 'Стандартный, Вольный' : 'Вольный')}</dd></div>
            <div><dt>ID карты</dt><dd><code>{card.card_id}</code>{card.dbf ? ` · DBF ${card.dbf}` : ''}</dd></div>
          </dl>
          <div className="constructed-card-detail__copy"><h2>Описание</h2><p>{plainText(card.text?.ru || card.text?.en)}</p>{plainText(card.flavor?.ru || card.flavor?.en) && <><h3>Художественный текст</h3><blockquote>{plainText(card.flavor?.ru || card.flavor?.en)}</blockquote></>}</div>
        </div>
        <div className="constructed-card-detail__statistics"><div><h2>Статистика · Легенда</h2><span>Обновлено {formatDate(card.statsUpdatedAt)}</span></div><StatsRows stats={card.stats} />{!card.stats && <p className="constructed-card-detail__no-stats">Карта есть в библиотеке, но в текущей выборке Легенды недостаточно данных.</p>}</div>
      </section>

      <section className="constructed-card-detail__lower-grid">
        <div className="constructed-card-detail__section"><h2>Механики и теги</h2><div className="constructed-card-detail__tags">{mechanics.length ? mechanics.map(value => <span key={String(value)}>{mechanicLabel(String(value), card.mechanicTranslations)}</span>) : <p>Механики не указаны.</p>}</div></div>
        <div className="constructed-card-detail__section constructed-card-detail__patches"><h2>Изменения по патчам</h2>{patchRows.length ? <div>{patchRows.map((row: any, index: number) => <details key={`${row.patch}-${index}`}><summary><span>{row.date || 'Без даты'}</span><strong>{row.patch || row.heading || 'Изменение'}</strong></summary><p>{(Array.isArray(row.items) ? row.items : [row.items]).filter(Boolean).join(' ') || 'Описание отсутствует.'}</p></details>)}</div> : <p>История изменений не найдена.</p>}</div>
      </section>

      {related.length > 0 && <section className="constructed-card-detail__section"><h2>Связанные карты</h2><div className="constructed-card-detail__related">{related.map((item: any, index: number) => { const relatedId = item.card_id || item.id; const relatedUrl = relatedId ? `/standard/cards/${format}/${encodeURIComponent(relatedId)}` : item.url; return <a key={`${relatedId || item.title}-${index}`} href={relatedUrl || '#'} onClick={event => { if (!relatedId) return; event.preventDefault(); navigatePath(relatedUrl); }}>{item.image_url || item.image ? <img src={item.image_url || item.image} alt="" /> : <Sparkles size={24} />}<span>{item.name_ru || item.name || item.title || relatedId || 'Связанная карта'}</span></a>; })}</div></section>}

      {generatedPools.length > 0 && <GeneratedCardPools pools={generatedPools} format={format} navigatePath={navigatePath} />}

      <section className="constructed-card-detail__media-grid">
        <div className="constructed-card-detail__section"><h2>Галерея · {galleryMedia.length}</h2>{galleryMedia.length ? <div className="constructed-card-detail__gallery">{galleryMedia.map(item => <button key={item.id} type="button" onClick={() => openMedia(item.url)} aria-label={`Открыть ${item.label}`}><img src={item.thumbnailUrl} alt={item.label} loading="lazy" /><span>{item.label}</span></button>)}</div> : <p>Дополнительные изображения отсутствуют.</p>}</div>
        <div className="constructed-card-detail__section"><h2><Volume2 size={19} /> Звуки карты · {sounds.length}</h2>{sounds.length ? <div className="constructed-card-detail__sounds">{soundGroups.map(([group, clips], groupIndex) => <details key={group} open={groupIndex === 0}><summary>{constructedSoundGroupLabel(group)} · {clips?.length ?? 0}</summary>{clips?.map(item => <article key={item.id}><span>{plainText(item.description) || item.title}</span><audio controls preload="metadata" src={item.url}>Ваш браузер не поддерживает воспроизведение аудио.</audio></article>)}</details>)}</div> : <p>Звуковые файлы отсутствуют в базе.</p>}</div>
        <div className="constructed-card-detail__section"><h2>Дополнительная информация</h2><div className="constructed-card-detail__links">{card.wiki_page?.url && <a href={card.wiki_page.url} target="_blank" rel="noreferrer">Hearthstone Wiki <ExternalLink size={14} /></a>}{externalLinks.map((item: any, index: number) => <a key={`${item.url}-${index}`} href={item.url} target="_blank" rel="noreferrer">{item.label || item.url} <ExternalLink size={14} /></a>)}</div></div>
      </section>
      {lightboxIndex >= 0 && <ConstructedCardLightbox items={mediaItems} index={lightboxIndex} onClose={() => setLightboxIndex(-1)} onIndexChange={setLightboxIndex} />}
    </article>
  );
}

export default function StandardCards({ currentPath, navigatePath }: StandardCardsProps) {
  const route = routeState(currentPath);
  return route.page === 'detail' && route.cardId
    ? <DetailPage format={route.format} cardId={route.cardId} navigatePath={navigatePath} />
    : <CardsListPage initialFormat={route.format} navigatePath={navigatePath} />;
}

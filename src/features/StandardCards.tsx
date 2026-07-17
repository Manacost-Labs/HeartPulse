import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Grid3X3,
  Layers3,
  List,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Volume2,
} from 'lucide-react';
import '../route-parchment.css';
import CardPreviewTooltip, { type CardPreviewTarget } from './CardPreviewTooltip';
import ConstructedCardLightbox from './ConstructedCardLightbox';
import { compareConstructedSets, constructedSetLabel, constructedSoundGroupLabel } from './constructedCardLabels';
import { collectConstructedCardMedia, flattenConstructedCardSounds, type ConstructedCardMediaItem } from './constructedCardMedia';
import '../vendor/hsreplay-deck-view/hsreplay-deck-view.js';
import '../vendor/hsreplay-deck-view/hsreplay-deck-view.css';
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
  decks?: ConstructedDeck[];
};

type ConstructedDeck = {
  id: string;
  title: string;
  archetype?: string | null;
  archetypeLabel?: string | null;
  className?: string | null;
  deckCode: string;
  source?: string | null;
  sourceUrl?: string | null;
  winrate?: number | null;
  score?: string | null;
  updatedAt?: string | null;
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
  statsAccess: boolean;
  cards: CardRecord[];
  facets: Facets;
  facetCounts?: FacetCounts;
  mechanicTranslations?: Record<string, string>;
  coverage?: CardCoverage;
  warning?: string | null;
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
  statsAccess: boolean;
  statsAccessLoading: boolean;
  authUser: object | null;
  onRefreshSubscription: () => Promise<unknown>;
};

const EMPTY_FACETS: Facets = { classes: [], sets: [], mechanics: [], types: [], rarities: [] };
const EMPTY_FACET_COUNTS: FacetCounts = { classes: [], sets: [], mechanics: [], types: [], rarities: [] };
const EMPTY_FILTERS: Filters = {
  query: '', class: '', set: '', mana: '', attack: '', health: '', mechanic: '', type: '', rarity: '', sort: 'set', direction: 'asc',
};
const STATISTIC_SORTS = new Set(['popularity', 'winrate', 'games']);
const LOCKED_STATS_PLACEHOLDER: CardStats = {
  deckPopularity: 18.7,
  deckWinrate: 53.4,
  averageCopies: 1.8,
  timesPlayed: 12480,
  winrateWhenPlayed: 56.2,
  winrateWhenDrawn: 54.1,
  keepPercentage: 42.6,
  openingHandWinrate: 52.8,
  averageTurnsInHand: 2.4,
  averageTurnPlayed: 5.3,
};

type StatsGateProps = Pick<StandardCardsProps, 'statsAccessLoading' | 'authUser' | 'onRefreshSubscription'>;

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
  const exactKey = value.trim().toLocaleUpperCase('en-US');
  const canonicalKey = exactKey.replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return translations?.[exactKey] || translations?.[canonicalKey] || translatedCode(canonicalKey || value, MECHANIC_LABELS);
}

function uniqueMechanicLabels(values: unknown[], translations?: Record<string, string>): Array<{ key: string; label: string }> {
  const unique = new Map<string, { key: string; label: string }>();
  for (const rawValue of values) {
    const value = String(rawValue ?? '').trim();
    if (!value) continue;
    const label = mechanicLabel(value, translations).trim();
    const normalizedLabel = label.toLocaleLowerCase('ru-RU').replace(/[^a-zа-яё0-9]+/gi, '');
    if (normalizedLabel && !unique.has(normalizedLabel)) unique.set(normalizedLabel, { key: normalizedLabel, label });
  }
  return [...unique.values()];
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

function sortMetric(card: CardRecord, sort: string): { label: string; value: string } {
  if (sort === 'winrate') return { label: 'Победы колод', value: percent(card.stats?.deckWinrate) };
  if (sort === 'games') return { label: 'Сыграно партий', value: number(card.stats?.timesPlayed) };
  if (sort === 'mana') return { label: 'Мана', value: number(card.mana_cost) };
  if (sort === 'attack') return { label: 'Атака', value: number(card.attack) };
  if (sort === 'health') return { label: 'Здоровье', value: number(card.health) };
  if (sort === 'set') return { label: 'Дополнение', value: card.card_set ? constructedSetLabel(card.card_set) : 'Нет данных' };
  if (sort === 'class') return { label: 'Класс', value: classLabel(card.class || 'NEUTRAL') };
  if (sort === 'mechanics') {
    const count = cardMechanicKeys(card).length;
    return { label: 'Механики', value: count ? number(count) : 'Нет данных' };
  }
  if (sort === 'name') return { label: 'Название', value: card.name?.en || cardName(card) };
  return { label: 'В % колод', value: percent(card.stats?.deckPopularity) };
}

function cardMechanicKeys(card: CardRecord): string[] {
  return [...new Set([...(card.mechanics || []), ...(card.referenced_tags || [])]
    .map(value => String(value).trim())
    .filter(value => Boolean(value) && !/^\d+$/.test(value)))];
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'нет данных';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : value;
}

function patchTimestamp(row: any): number {
  for (const value of [row?.manacost_published_at, row?.date]) {
    const timestamp = Date.parse(String(value ?? ''));
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return 0;
}

function patchDate(value: unknown): string {
  const date = new Date(String(value ?? ''));
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'Дата не указана';
}

function patchVersion(value: unknown): string {
  return String(value ?? '').trim().replace(/^patch\s+/i, '') || 'без номера';
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

function StatsUnlockNotice({ statsAccessLoading, authUser, onRefreshSubscription, compact = false }: StatsGateProps & { compact?: boolean }) {
  return (
    <div className={`constructed-cards__stats-lock${compact ? ' constructed-cards__stats-lock--compact' : ''}`}>
      <LockKeyhole size={compact ? 18 : 24} aria-hidden="true" />
      <div>
        <strong>Статистика доступна с тарифом «Алмаз»</strong>
        {!compact && <span>Процент колод, винрейт и игровые показатели откроются после проверки подписки.</span>}
      </div>
      {!compact && (!authUser ? (
        <a href="/?login">Войти</a>
      ) : (
        <button type="button" disabled={statsAccessLoading} onClick={() => { void onRefreshSubscription(); }}>
          {statsAccessLoading ? 'Проверяем…' : 'Проверить доступ'}
        </button>
      ))}
    </div>
  );
}

function LockedStatValue() {
  return (
    <span className="constructed-cards__locked-value" aria-label="Доступно с тарифом Алмаз">
      <span aria-hidden="true">18,7%</span><LockKeyhole size={13} aria-hidden="true" />
    </span>
  );
}

function HoverTooltip({ card, rect, statsAccess, gate }: { card: CardRecord; rect: DOMRect; statsAccess: boolean; gate: StatsGateProps }) {
  const width = 320;
  const left = rect.right + width + 18 <= window.innerWidth ? rect.right + 10 : Math.max(10, rect.left - width - 10);
  const top = Math.max(10, Math.min(rect.top + rect.height * 0.12, window.innerHeight - 390));
  return (
    <aside className="constructed-cards__tooltip" style={{ left, top, width }} role="tooltip">
      <div className="constructed-cards__tooltip-header"><strong>{cardName(card)}</strong><span>Статистика · Легенда</span></div>
      {statsAccess ? <StatsRows stats={card.stats} compact /> : (
        <div className="constructed-cards__stats-locked-preview">
          <div aria-hidden="true" inert><StatsRows stats={LOCKED_STATS_PLACEHOLDER} compact /></div>
          <StatsUnlockNotice {...gate} compact />
        </div>
      )}
    </aside>
  );
}

function CardGallery({ cards, format, sort, navigatePath, statsAccess, gate }: { cards: CardRecord[]; format: CardFormat; sort: string; navigatePath: (path: string) => void; statsAccess: boolean; gate: StatsGateProps }) {
  const [hovered, setHovered] = useState<{ card: CardRecord; rect: DOMRect } | null>(null);
  const showTooltip = (card: CardRecord, element: HTMLElement) => setHovered({ card, rect: element.getBoundingClientRect() });
  return (
    <>
      <div className="constructed-cards__gallery">
        {cards.map(card => {
          const metric = sortMetric(card, sort);
          return <a
            key={card.card_id}
            href={cardPath(format, card)}
            className="constructed-cards__gallery-card"
            data-rarity={String(card.rarity || 'COMMON').toLowerCase()}
            onMouseEnter={event => showTooltip(card, event.currentTarget)}
            onMouseLeave={() => setHovered(null)}
            onFocus={event => showTooltip(card, event.currentTarget)}
            onBlur={() => setHovered(null)}
            onClick={event => { event.preventDefault(); navigatePath(cardPath(format, card)); }}
          >
            <img src={card.images?.card || '/arena-logo-icon.webp?v=arena-legacy-20260629'} alt={cardName(card)} loading="lazy" />
            <span className="constructed-cards__gallery-name">{cardName(card)}</span>
            <span className="constructed-cards__gallery-stat"><small>{metric.label}</small>{!statsAccess && STATISTIC_SORTS.has(sort) ? <LockedStatValue /> : <strong>{metric.value}</strong>}</span>
          </a>;
        })}
      </div>
      {hovered && <HoverTooltip card={hovered.card} rect={hovered.rect} statsAccess={statsAccess} gate={gate} />}
    </>
  );
}

function HsReplayDataDeckCard({ card }: { card: CardRecord }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dbfIds = card.dbf === null || card.dbf === undefined ? '' : String(card.dbf);
  useEffect(() => {
    const container = containerRef.current;
    const api = window.HSReplayDeckView;
    if (!container || !api?.renderDeck) return undefined;
    api.renderDeck(container, [{
      id: card.card_id,
      dbfId: card.dbf,
      name: cardName(card),
      cost: card.mana_cost ?? 0,
      rarity: card.rarity || 'COMMON',
      elite: String(card.rarity || '').toUpperCase() === 'LEGENDARY',
      count: 1,
      image: card.images?.crop || `https://art.hearthstonejson.com/v1/tiles/${encodeURIComponent(card.card_id)}.webp`,
    }], {
      className: 'constructed-cards__hsrdv',
      group: false,
      sort: false,
      clear: true,
      showSingleCountBox: false,
    });
    return () => container.replaceChildren();
  }, [card]);
  return <div ref={containerRef} className="constructed-cards__data-deck-card" data-deck-cards={dbfIds} data-card-id={card.card_id}><span>{cardName(card)}</span></div>;
}

function sortAria(sort: string, column: string, direction: Filters['direction']): React.AriaAttributes['aria-sort'] {
  if (sort !== column) return undefined;
  return direction === 'asc' ? 'ascending' : 'descending';
}

function CardTable({ cards, format, sort, direction, navigatePath, statsAccess }: { cards: CardRecord[]; format: CardFormat; sort: string; direction: Filters['direction']; navigatePath: (path: string) => void; statsAccess: boolean }) {
  const [preview, setPreview] = useState<CardPreviewTarget | null>(null);
  const showPreview = (card: CardRecord, element: HTMLElement) => setPreview({
    id: card.card_id,
    name: cardName(card),
    imageUrl: card.images?.card,
    rect: element.getBoundingClientRect(),
  });
  return (
    <>
      <div className="constructed-cards__table-wrap">
        <table className="constructed-cards__table">
          <thead><tr><th aria-sort={sortAria(sort, 'name', direction)}>Карта</th><th aria-sort={sortAria(sort, 'class', direction)}>Класс</th><th aria-sort={sortAria(sort, 'set', direction)}>Дополнение</th><th aria-sort={sortAria(sort, 'mana', direction)}>Мана</th><th aria-sort={sortAria(sort, 'attack', direction)}>Атака</th><th aria-sort={sortAria(sort, 'health', direction)}>Здоровье</th><th aria-sort={sortAria(sort, 'popularity', direction)}>В % колод {!statsAccess && <LockKeyhole size={12} aria-label="Тариф Алмаз" />}</th><th aria-sort={sortAria(sort, 'winrate', direction)}>Победы колод {!statsAccess && <LockKeyhole size={12} aria-label="Тариф Алмаз" />}</th><th aria-sort={sortAria(sort, 'games', direction)}>Партий {!statsAccess && <LockKeyhole size={12} aria-label="Тариф Алмаз" />}</th></tr></thead>
          <tbody>
            {cards.map(card => (
              <tr key={card.card_id}>
                <th scope="row"><a
                  href={cardPath(format, card)}
                  aria-label={`Открыть карту ${cardName(card)}`}
                  onMouseEnter={event => showPreview(card, event.currentTarget)}
                  onMouseLeave={() => setPreview(null)}
                  onFocus={event => showPreview(card, event.currentTarget)}
                  onBlur={() => setPreview(null)}
                  onClick={event => { event.preventDefault(); navigatePath(cardPath(format, card)); }}
                ><HsReplayDataDeckCard card={card} /></a></th>
                <td data-label="Класс"><span><img className="constructed-cards__class-icon" src={classIcon(card.class)} alt="" />{classLabel(card.class || 'NEUTRAL')}</span></td>
                <td data-label="Дополнение">{card.card_set ? constructedSetLabel(card.card_set) : '—'}</td><td data-label="Мана">{number(card.mana_cost)}</td><td data-label="Атака">{number(card.attack)}</td><td data-label="Здоровье">{number(card.health)}</td>
                <td data-label="В % колод">{statsAccess ? percent(card.stats?.deckPopularity) : <LockedStatValue />}</td><td data-label="Победы колод">{statsAccess ? percent(card.stats?.deckWinrate) : <LockedStatValue />}</td><td data-label="Партий">{statsAccess ? number(card.stats?.timesPlayed) : <LockedStatValue />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {preview && <CardPreviewTooltip preview={preview} />}
    </>
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

function CardsListPage({ initialFormat, navigatePath, statsAccess, statsAccessLoading, authUser, onRefreshSubscription }: Pick<StandardCardsProps, 'navigatePath' | 'statsAccess' | 'statsAccessLoading' | 'authUser' | 'onRefreshSubscription'> & { initialFormat: CardFormat }) {
  const [format, setFormat] = useState<CardFormat>(initialFormat);
  const [view, setView] = useState<ViewMode>('gallery');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(60);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [data, setData] = useState<ListPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const deferredQuery = useDeferredValue(filters.query);

  useEffect(() => {
    setFormat(initialFormat);
    setPage(1);
  }, [initialFormat]);

  useEffect(() => {
    if (statsAccess || !STATISTIC_SORTS.has(filters.sort)) return;
    setFilters(current => ({ ...current, sort: 'set', direction: 'asc' }));
    setPage(1);
  }, [filters.sort, statsAccess]);

  const requestKey = useMemo(() => JSON.stringify({ format, page, perPage, reloadToken, statsAccess, ...filters, query: deferredQuery }), [deferredQuery, filters, format, page, perPage, reloadToken, statsAccess]);
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
        const response = await fetch(`/api/constructed-cards?${params}`, { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: controller.signal });
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
  const hasStatsAccess = data ? Boolean(data.statsAccess) : statsAccess;
  const statsGate = { statsAccessLoading, authUser, onRefreshSubscription };

  return (
    <div className="constructed-cards">
      <header className="constructed-cards__header">
        <div><h1>Карты</h1><div className="constructed-cards__beta"><span>Бета</span><span>{hasStatsAccess ? <ShieldCheck size={14} /> : <LockKeyhole size={14} />} Статистика Легенды{!hasStatsAccess && ' · Алмаз'}</span></div></div>
        <p>Ранг: <strong>Легенда</strong></p>
      </header>

      <section className="constructed-cards__controls" aria-label="Фильтры библиотеки карт">
        <div className="constructed-cards__primary-controls">
          <div className="constructed-cards__format" aria-label="Формат">
            <button type="button" aria-label="Стандарт" title="Стандарт" aria-pressed={format === 'standard'} onClick={() => changeFormat('standard')}><img src="/card-format-standard.webp" alt="" /><span className="sr-only">Стандарт</span></button>
            <button type="button" aria-label="Вольный" title="Вольный" aria-pressed={format === 'wild'} onClick={() => changeFormat('wild')}><img src="/card-format-wild.webp" alt="" /><span className="sr-only">Вольный</span></button>
          </div>
          <label className="constructed-cards__search"><Search size={18} /><input value={filters.query} onChange={event => updateFilter('query', event.target.value)} placeholder="Поиск по названию" /></label>
          <FilterSelect label="Сортировка" value={filters.sort} onChange={value => updateFilter('sort', value)}>
            <option value="set">Новые дополнения</option><option value="popularity" disabled={!hasStatsAccess}>🔒 В % колод · Алмаз</option><option value="winrate" disabled={!hasStatsAccess}>🔒 Победы колод · Алмаз</option><option value="games" disabled={!hasStatsAccess}>🔒 Сыграно партий · Алмаз</option><option value="mana">Мана</option><option value="attack">Атака</option><option value="health">Здоровье</option><option value="name">Название</option><option value="class">Класс</option><option value="mechanics">Механики</option>
          </FilterSelect>
          {!hasStatsAccess && <span className="constructed-cards__sort-lock" title="Статистические сортировки доступны с тарифом Алмаз"><LockKeyhole size={14} /> Алмаз</span>}
          <FilterSelect label="На странице" value={String(perPage)} onChange={value => { setPerPage(Number(value)); setPage(1); }}>
            <option value="60">60 карт</option><option value="120">120 карт</option>
          </FilterSelect>
          <button type="button" className="constructed-cards__direction" onClick={() => updateFilter('direction', filters.direction === 'asc' ? 'desc' : 'asc')} aria-label="Изменить направление сортировки">
            <span aria-hidden="true">{filters.direction === 'asc' ? '↑' : '↓'}</span>
            <span className="constructed-cards__direction-label">{filters.direction === 'asc' ? 'По возрастанию' : 'По убыванию'}</span>
          </button>
          <div className="constructed-cards__view" aria-label="Вид списка">
            <button type="button" aria-pressed={view === 'gallery'} onClick={() => setView('gallery')}><Grid3X3 size={16} /> Галерея</button>
            <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}><List size={17} /> Таблица</button>
          </div>
          <button
            type="button"
            className="constructed-cards__advanced-toggle"
            aria-expanded={mobileFiltersOpen}
            aria-controls="constructed-cards-advanced-filters"
            onClick={() => setMobileFiltersOpen(current => !current)}
          >
            <SlidersHorizontal size={17} /> {mobileFiltersOpen ? 'Скрыть фильтры' : 'Дополнительные фильтры'}
          </button>
        </div>
        <div id="constructed-cards-advanced-filters" className={`constructed-cards__secondary-controls${mobileFiltersOpen ? ' is-open' : ''}`}>
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

      {hasStatsAccess && data?.warning && <div className="constructed-cards__data-warning" role="status"><AlertTriangle size={18} /><span>Список карт доступен, статистика источника временно скрыта из-за некорректного обновления.</span></div>}

      {loading ? <section className="constructed-cards__state" aria-busy="true"><RefreshCw className="constructed-cards__spinner" size={34} /><h2>Загружаем библиотеку</h2><p>Собираем полный список карт и дополнений.</p></section>
        : error ? <section className="constructed-cards__state" role="alert"><h2>Не удалось загрузить карты</h2><p>{error}</p><button type="button" onClick={() => setReloadToken(value => value + 1)}><RefreshCw size={16} /> Повторить</button></section>
          : data && data.cards.length > 0 ? <>{view === 'gallery' ? <CardGallery cards={data.cards} format={format} sort={filters.sort} navigatePath={navigatePath} statsAccess={hasStatsAccess} gate={statsGate} /> : <CardTable cards={data.cards} format={format} sort={filters.sort} direction={filters.direction} navigatePath={navigatePath} statsAccess={hasStatsAccess} />}<Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} total={data.pagination.total} perPage={data.pagination.perPage} onPage={setPage} /></>
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

function GeneratedPoolCards({ pool, format, navigatePath }: { key?: React.Key; pool: any; format: CardFormat; navigatePath: (path: string) => void }) {
  const cards = Array.isArray(pool?.cards) ? pool.cards : [];
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [cardsPerRow, setCardsPerRow] = useState(2);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return undefined;
    const updateCardsPerRow = () => {
      const columns = window.getComputedStyle(grid).gridTemplateColumns.split(/\s+/).filter(Boolean).length;
      if (columns > 0) setCardsPerRow(columns);
    };
    updateCardsPerRow();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateCardsPerRow);
      return () => window.removeEventListener('resize', updateCardsPerRow);
    }
    const observer = new ResizeObserver(updateCardsPerRow);
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);

  const visibleCards = expanded ? cards : cards.slice(0, cardsPerRow);
  const hasMore = cards.length > cardsPerRow;

  return (
    <article className="constructed-card-detail__pool">
      <header><strong>{generatedPoolLabel(pool?.pool)}</strong><span>{cards.length} карт</span></header>
      <div className="constructed-card-detail__pool-cards" ref={gridRef}>
        {visibleCards.map((item: any, index: number) => {
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
      {hasMore && <button type="button" className="constructed-card-detail__pool-toggle" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Свернуть' : `Показать все · ${cards.length}`}</button>}
    </article>
  );
}

function GeneratedCardPools({ pools, format, navigatePath }: { pools: any[]; format: CardFormat; navigatePath: (path: string) => void }) {
  return (
    <section className="constructed-card-detail__section constructed-card-detail__pools">
      <h2><Layers3 size={19} /> Пулы генерации · {pools.length}</h2>
      <div className="constructed-card-detail__pool-list">
        {pools.map((pool, poolIndex) => <GeneratedPoolCards key={`${pool?.pool || 'pool'}-${poolIndex}`} pool={pool} format={format} navigatePath={navigatePath} />)}
      </div>
    </section>
  );
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const fallback = document.createElement('textarea');
    fallback.value = value;
    fallback.setAttribute('readonly', '');
    fallback.style.position = 'fixed';
    fallback.style.opacity = '0';
    document.body.appendChild(fallback);
    fallback.select();
    const copied = document.execCommand('copy');
    fallback.remove();
    return copied;
  }
}

function ConstructedDeckCard({ deck, cardId, format, onPreviewReady, onOpenPreview }: {
  key?: React.Key;
  deck: ConstructedDeck;
  cardId: string;
  format: CardFormat;
  onPreviewReady: (deck: ConstructedDeck, imageUrl: string) => void;
  onOpenPreview: (deck: ConstructedDeck, imageUrl: string) => void;
}) {
  const [imageUrl, setImageUrl] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [retryToken, setRetryToken] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const loadPreview = async () => {
      setPreviewError('');
      try {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const response = await fetch(`/api/constructed-cards/${encodeURIComponent(cardId)}/decks/${encodeURIComponent(deck.id)}/preview?format=${format}`, {
            method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Request': '1' },
            body: JSON.stringify({ format }), signal: controller.signal,
          });
          const payload = await response.json().catch(() => ({}));
          if (response.ok && payload?.preview?.imageUrl) {
            setImageUrl(payload.preview.imageUrl);
            onPreviewReady(deck, payload.preview.imageUrl);
            return;
          }
          if (response.status < 500) break;
        }
        throw new Error('Не удалось загрузить изображение колоды');
      } catch (error) {
        if (!controller.signal.aborted) setPreviewError(error instanceof Error ? error.message : 'Не удалось загрузить изображение колоды');
      }
    };
    void loadPreview();
    return () => controller.abort();
  }, [cardId, deck, format, onPreviewReady, retryToken]);

  const copyDeck = async () => {
    if (!await copyText(deck.deckCode)) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <article className="constructed-card-detail__deck">
      <div className="constructed-card-detail__deck-image">
        {imageUrl ? <button type="button" className="constructed-card-detail__deck-preview" onClick={() => onOpenPreview(deck, imageUrl)} aria-label={`Открыть колоду ${deck.archetypeLabel || deck.archetype || deck.title} в полном размере`}><img src={imageUrl} alt={`Колода ${deck.archetypeLabel || deck.archetype || deck.title}`} loading="lazy" onError={() => { setImageUrl(''); setPreviewError('Не удалось загрузить изображение колоды'); }} /><span>Открыть в полном размере</span></button>
          : <div className="constructed-card-detail__deck-preview-state" aria-busy={!previewError}><Layers3 size={28} /><span>{previewError || 'Создаём изображение DeckView…'}</span>{previewError && <button type="button" onClick={() => setRetryToken(value => value + 1)}><RefreshCw size={14} /> Повторить</button>}</div>}
      </div>
      <div className="constructed-card-detail__deck-copy">
        <h3>{deck.archetypeLabel || deck.archetype || deck.title}</h3>
        <p>{[deck.className ? classLabel(deck.className.toUpperCase().replace(/\s+/g, '')) : '', deck.score || (deck.winrate != null ? `${percent(deck.winrate)} побед` : '')].filter(Boolean).join(' · ') || 'Готовая сборка'}</p>
        <button type="button" onClick={copyDeck}><Copy size={15} /> {copied ? 'Код скопирован' : 'Скопировать код'}</button>
      </div>
    </article>
  );
}

function ConstructedCardDecks({ decks, cardId, format }: { decks: ConstructedDeck[]; cardId: string; format: CardFormat }) {
  const [visibleCount, setVisibleCount] = useState(3);
  const [previewImages, setPreviewImages] = useState<Record<string, string>>({});
  const [lightboxItems, setLightboxItems] = useState<ConstructedCardMediaItem[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  useEffect(() => { setVisibleCount(3); setPreviewImages({}); setLightboxItems([]); setLightboxIndex(-1); }, [cardId, format]);
  const visibleDecks = decks.slice(0, visibleCount);
  const handlePreviewReady = React.useCallback((deck: ConstructedDeck, imageUrl: string) => {
    setPreviewImages(current => current[deck.id] === imageUrl ? current : { ...current, [deck.id]: imageUrl });
  }, []);
  const handleOpenPreview = (deck: ConstructedDeck, imageUrl: string) => {
    const availableImages = { ...previewImages, [deck.id]: imageUrl };
    const items = visibleDecks.flatMap((item): ConstructedCardMediaItem[] => availableImages[item.id] ? [{
      id: `deck-${item.id}`,
      label: item.archetypeLabel || item.archetype || item.title,
      url: availableImages[item.id],
      thumbnailUrl: availableImages[item.id],
      sourceUrl: item.sourceUrl || null,
      kind: 'image',
    }] : []);
    setLightboxItems(items);
    setLightboxIndex(items.findIndex(item => item.id === `deck-${deck.id}`));
  };
  return (
    <section className="constructed-card-detail__section constructed-card-detail__decks">
      <h2><Layers3 size={19} /> Колоды с этой картой · {decks.length}</h2>
      <div className="constructed-card-detail__deck-grid">{visibleDecks.map(deck => <ConstructedDeckCard key={deck.id} deck={deck} cardId={cardId} format={format} onPreviewReady={handlePreviewReady} onOpenPreview={handleOpenPreview} />)}</div>
      {visibleCount < decks.length && <button type="button" className="constructed-card-detail__pool-toggle" onClick={() => setVisibleCount(count => Math.min(count + 3, decks.length))}>Показать больше · ещё {Math.min(3, decks.length - visibleCount)}</button>}
      {lightboxIndex >= 0 && <ConstructedCardLightbox items={lightboxItems} index={lightboxIndex} onClose={() => setLightboxIndex(-1)} onIndexChange={setLightboxIndex} />}
    </section>
  );
}

function DetailPage({ format, cardId, navigatePath, statsAccess, statsAccessLoading, authUser, onRefreshSubscription }: { format: CardFormat; cardId: string } & Pick<StandardCardsProps, 'navigatePath' | 'statsAccess' | 'statsAccessLoading' | 'authUser' | 'onRefreshSubscription'>) {
  const [card, setCard] = useState<CardRecord | null>(null);
  const [serverStatsAccess, setServerStatsAccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [variant, setVariant] = useState('normal');
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true); setError('');
      try {
        const response = await fetch(`/api/constructed-cards/${encodeURIComponent(cardId)}?format=${format}`, { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: controller.signal });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить карту');
        setCard({ ...(payload.card as CardRecord), mechanicTranslations: payload.mechanicTranslations || {} });
        setServerStatsAccess(payload.statsAccess === true);
        setVariant('normal');
        setLightboxIndex(-1);
      } catch (loadError) {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить карту');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void load();
    return () => controller.abort();
  }, [cardId, format, statsAccess]);
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
  const mechanics = uniqueMechanicLabels([...(card.mechanics || []), ...(card.referenced_tags || []), ...(wiki.wiki_mechanics || []), ...(wiki.wiki_tags || [])], card.mechanicTranslations);
  const patchRows = (Array.isArray(wiki.patch_changes) ? wiki.patch_changes : [])
    .flatMap((group: any) => (Array.isArray(group?.entries) ? group.entries : []).map((entry: any) => ({ ...entry, heading: group.heading })))
    .sort((left: any, right: any) => patchTimestamp(right) - patchTimestamp(left));
  const related = (Array.isArray(wiki.related_cards) ? wiki.related_cards : []).filter((item: any) => {
    const name = item?.name?.ru || item?.name?.en || (typeof item?.name === 'string' ? item.name : '') || item?.name_ru || item?.title;
    return Boolean(item?.image_url || item?.image || name || item?.card_id || item?.id || item?.url);
  });
  const generatedPools = (Array.isArray(wiki.generated_card_pools) ? wiki.generated_card_pools : [])
    .filter((pool: any) => Array.isArray(pool?.cards) && pool.cards.length > 0);
  const mediaItems = collectConstructedCardMedia(card);
  const galleryMedia = mediaItems.filter(item => item.id.startsWith('gallery-'));
  const sounds = flattenConstructedCardSounds(wiki.sounds);
  const soundGroups = [...new Set(sounds.map(item => item.group))].map(group => [group, sounds.filter(item => item.group === group)] as const);
  const externalLinks = Array.isArray(wiki.external_links) ? wiki.external_links : [];
  const decks = Array.isArray(card.decks) ? card.decks : [];
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
        <div className={`constructed-card-detail__statistics${serverStatsAccess ? '' : ' is-locked'}`}>
          <div><h2>Статистика · Легенда</h2><span>{serverStatsAccess ? `Обновлено ${formatDate(card.statsUpdatedAt)}` : 'Тариф «Алмаз»'}</span></div>
          {serverStatsAccess ? <><StatsRows stats={card.stats} />{!card.stats && <p className="constructed-card-detail__no-stats">Карта есть в библиотеке, но в текущей выборке Легенды недостаточно данных.</p>}</> : (
            <div className="constructed-card-detail__statistics-gate">
              <div className="constructed-card-detail__statistics-blur" aria-hidden="true" inert><StatsRows stats={LOCKED_STATS_PLACEHOLDER} /></div>
              <StatsUnlockNotice statsAccessLoading={statsAccessLoading} authUser={authUser} onRefreshSubscription={onRefreshSubscription} />
            </div>
          )}
        </div>
      </section>

      <section className="constructed-card-detail__lower-grid">
        <div className="constructed-card-detail__section"><h2>Механики и теги</h2><div className="constructed-card-detail__tags">{mechanics.length ? mechanics.map(item => <span key={item.key}>{item.label}</span>) : <p>Механики не указаны.</p>}</div></div>
        <div className="constructed-card-detail__section constructed-card-detail__patches"><h2>Изменения по патчам</h2>{patchRows.length ? <div>{patchRows.map((row: any, index: number) => {
          const dateValue = row.manacost_published_at || row.date;
          const title = row.manacost_title || `Обновление ${patchVersion(row.patch)}`;
          const description = row.manacost_summary || (row.manacost_url ? 'Подробности обновления доступны на HS-Manacost.' : 'Русская статья для этого обновления пока не найдена.');
          const heading = <><span>{patchDate(dateValue)}</span><strong>{title}</strong>{row.manacost_url && <ExternalLink size={15} />}</>;
          return <details key={`${row.patch}-${row.date}-${index}`}><summary><span className="constructed-card-detail__patch-heading">{heading}</span></summary><div className="constructed-card-detail__patch-body"><p>{description}</p>{row.manacost_url && <a href={row.manacost_url} target="_blank" rel="noreferrer">Читать на HS‑Manacost <ExternalLink size={14} /></a>}</div></details>;
        })}</div> : <p>История изменений не найдена.</p>}</div>
      </section>

      {related.length > 0 && <section className="constructed-card-detail__section"><h2>Связанные карты</h2><div className="constructed-card-detail__related">{related.map((item: any, index: number) => { const relatedId = item.card_id || item.id; const relatedUrl = relatedId ? `/standard/cards/${format}/${encodeURIComponent(relatedId)}` : item.url; const relatedName = item?.name?.ru || item?.name?.en || (typeof item?.name === 'string' ? item.name : '') || item.name_ru || item.title || relatedId; return <a key={`${relatedId || item.title}-${index}`} href={relatedUrl || '#'} target={!relatedId && item.url ? '_blank' : undefined} rel={!relatedId && item.url ? 'noreferrer' : undefined} onClick={event => { if (!relatedId) return; event.preventDefault(); navigatePath(relatedUrl); }}>{item.image_url || item.image ? <img src={item.image_url || item.image} alt="" /> : <Sparkles size={24} />}<span>{relatedName}</span></a>; })}</div></section>}

      {generatedPools.length > 0 && <GeneratedCardPools pools={generatedPools} format={format} navigatePath={navigatePath} />}

      {decks.length > 0 && <ConstructedCardDecks decks={decks} cardId={cardId} format={format} />}

      <section className={`constructed-card-detail__media-grid${sounds.length ? '' : ' constructed-card-detail__media-grid--two'}`}>
        <div className="constructed-card-detail__section"><h2>Галерея · {galleryMedia.length}</h2>{galleryMedia.length ? <div className="constructed-card-detail__gallery">{galleryMedia.map(item => <button key={item.id} type="button" onClick={() => openMedia(item.url)} aria-label={`Открыть ${item.label}`}><img src={item.thumbnailUrl} alt={item.label} loading="lazy" /><span>{item.label}</span></button>)}</div> : <p>Дополнительные изображения отсутствуют.</p>}</div>
        {sounds.length > 0 && <div className="constructed-card-detail__section"><h2><Volume2 size={19} /> Звуки карты · {sounds.length}</h2><div className="constructed-card-detail__sounds">{soundGroups.map(([group, clips], groupIndex) => <details key={group} open={groupIndex === 0}><summary>{constructedSoundGroupLabel(group)} · {clips?.length ?? 0}</summary>{clips?.map(item => <article key={item.id}><span>{plainText(item.description) || item.title}</span><audio controls preload="metadata" src={item.url}>Ваш браузер не поддерживает воспроизведение аудио.</audio></article>)}</details>)}</div></div>}
        <div className="constructed-card-detail__section"><h2>Дополнительная информация</h2><div className="constructed-card-detail__links">{card.wiki_page?.url && <a href={card.wiki_page.url} target="_blank" rel="noreferrer">Hearthstone Wiki <ExternalLink size={14} /></a>}{externalLinks.map((item: any, index: number) => <a key={`${item.url}-${index}`} href={item.url} target="_blank" rel="noreferrer">{item.label || item.url} <ExternalLink size={14} /></a>)}</div></div>
      </section>
      {lightboxIndex >= 0 && <ConstructedCardLightbox items={mediaItems} index={lightboxIndex} onClose={() => setLightboxIndex(-1)} onIndexChange={setLightboxIndex} />}
    </article>
  );
}

export default function StandardCards(props: StandardCardsProps) {
  const { currentPath, navigatePath } = props;
  const route = routeState(currentPath);
  return route.page === 'detail' && route.cardId
    ? <DetailPage format={route.format} cardId={route.cardId} {...props} />
    : <CardsListPage initialFormat={route.format} {...props} />;
}

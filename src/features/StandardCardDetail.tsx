import { htmlPlainText as plainText } from '../shared/text/htmlPlainText';
import { useConstructedCardPeriod, useConstructedCardRank, ConstructedCardIdentity, constructedCardPath, constructedCardRoute as routeState } from '../modules/constructedCards/public';
import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Copy,
  ExternalLink,
  Layers3,
  RefreshCw,
  Sparkles,
  Volume2,
} from 'lucide-react';
import './StandardCards.styles';
import { publicResourceUrl } from '../publicResourceUrl';
import { fallbackCardImageToOrigin } from '../config/publicAssetDelivery';
import ConstructedCardHistoryChart from './ConstructedCardHistoryChart';
import { cardSupportsStandardStatistics } from './constructedCardFormats';
import ConstructedCardLightbox from './ConstructedCardLightbox';
import { loadConstructedCardDetail } from './constructedCardDetailPrefetch';
import FilterSelect from './ConstructedCardFilterSelect';
import DeckListView, {
  type DeckListCard,
  type DeckListSideboard,
} from './decklist/DeckListView';
import DeckRenderPreview from './deckrender/DeckRenderPreview';
import { applyDocumentPageMeta } from '../shared/seo/publicUrlPolicy';
import { constructedSetLabel, constructedSoundGroupLabel } from './constructedCardLabels';
import {
  constructedClassIcon as classIcon,
  constructedClassLabel as classLabel,
  constructedRarityLabel,
  constructedTypeLabel,
} from './constructedCardFilterOptions';
import {
  constructedCardDataNotice,
  constructedCardRequestError,
  type ConstructedCardRequestErrorCopy,
} from './constructedCardRequestState';
import {
  CONSTRUCTED_CARD_RANK_OPTIONS,
  constructedCardPeriodLabel,
  constructedCardPeriodOptions,
  constructedCardRankLabel,
  constructedCardStatsFormatFromSearch,
  constructedCardStatsFormatLabel,
  constructedCardStatsUrl,
  type ConstructedCardPeriod,
  type ConstructedCardRank,
} from './constructedCardPeriods';
import { useConstructedCardHistory } from './useConstructedCardHistory';
import {
  collectConstructedCardMedia,
  collectConstructedRelatedCardMedia,
  collectConstructedRelatedCardArtMedia,
  collectConstructedGeneratedPoolMedia,
  constructedGeneratedPoolCardImage,
  collectConstructedCardVariants,
  flattenConstructedCardSounds,
  constructedRelatedCardImage,
} from './constructedCardMedia';
import { normalizeConstructedRelatedCardGroups, type ConstructedRelatedCardGroup } from './constructedRelatedCards';
import {
  constructedSpellSchoolLabel,
  constructedTribeLabel,
  isPublicConstructedTerm,
  mergeConstructedTranslationSources,
} from '../../shared/constructedCardTranslations';
import {
  cardName,
  mechanicLabel,
  navigateWithConstructedCardContext,
  number,
  percent,
  type CardFormat,
  type CardRecord,
  type ConstructedDeck,
  type StandardCardsProps,
} from './constructedCardRecord';
import { LOCKED_STATS_PLACEHOLDER, StatsRows, StatsUnlockNotice } from './ConstructedCardStats';

type ResolvedConstructedDeck = {
  ok: boolean;
  format: CardFormat;
  deckCode: string;
  cards: DeckListCard[];
  sideboards: DeckListSideboard[];
  totalCards: number;
  deckSizeLimit: 30 | 40;
};

const CONSTRUCTED_DECK_CLASS_COLORS: Record<string, string> = {
  deathknight: '#397b87',
  demonhunter: '#556d24',
  druid: '#8b4d25',
  hunter: '#3f792f',
  mage: '#326c97',
  paladin: '#a77816',
  priest: '#6e6862',
  rogue: '#55545b',
  shaman: '#345aa0',
  warlock: '#694477',
  warrior: '#8e342f',
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
  "Cards banned from E.T.C.'s band": 'Карты, недоступные для группы E.T.C.',
  'Cards banned from E.T.C.’s band': 'Карты, недоступные для группы E.T.C.',
};

function uniqueMechanicLabels(values: unknown[], translations?: Record<string, string>): Array<{ key: string; label: string }> {
  const unique = new Map<string, { key: string; label: string }>();
  for (const rawValue of values) {
    const value = String(rawValue ?? '').trim();
    if (!isPublicConstructedTerm(value)) continue;
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

function soundClipLabel(description: string, group: string, index: number): string {
  const label = plainText(description);
  if (!label) return `${constructedSoundGroupLabel(group)} · фрагмент ${index + 1}`;
  if (/[A-Za-z]/.test(label) && !/[А-Яа-яЁё]/.test(label)) {
    return `${constructedSoundGroupLabel(group)} · реплика ${index + 1}`;
  }
  return label;
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

function GeneratedPoolCards({ pool, format, period, rank, navigatePath, onOpen }: {
  key?: React.Key;
  pool: any;
  format: CardFormat;
  period: ConstructedCardPeriod;
  rank: ConstructedCardRank;
  navigatePath: (path: string) => void;
  onOpen: (url: string) => void;
}) {
  const cards = Array.isArray(pool?.cards) ? pool.cards : [];
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [cardsPerRow, setCardsPerRow] = useState(5);
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
        {visibleCards.map((item: any) => {
          const itemId = String(item?.card_id || item?.id || '').trim();
          const name = item?.name?.ru || item?.name?.en || item?.name_ru || item?.title || itemId || 'Карта';
          const image = constructedGeneratedPoolCardImage(item);
          const internalUrl = item?.can_open && itemId ? constructedCardPath(format, itemId) : '';
          const href = internalUrl
            ? constructedCardStatsUrl(internalUrl, { period, rank, statsFormat: format, defaultStatsFormat: format })
            : item?.url || undefined;
          const itemKey = itemId || String(href || image || name);
          return (
            <article className="constructed-card-detail__pool-card" key={itemKey}>
              {image
                ? (
                  <button
                    type="button"
                    className="constructed-card-detail__pool-card-image"
                    aria-label={`Открыть карту «${name}» в полном размере`}
                    onClick={() => onOpen(image)}
                  >
                    <img src={image} alt="" loading="lazy" decoding="async" onError={fallbackCardImageToOrigin} />
                  </button>
                )
                : <div className="constructed-card-detail__pool-card-placeholder" aria-hidden="true"><Sparkles size={34} /></div>}
              {href
                ? (
                  <a
                    className="constructed-card-detail__pool-card-link"
                    href={href}
                    target={internalUrl ? undefined : '_blank'}
                    rel={internalUrl ? undefined : 'noreferrer'}
                    onClick={event => {
                      if (!internalUrl) return;
                      event.preventDefault();
                      navigateWithConstructedCardContext(navigatePath, internalUrl, period, rank, format, format);
                    }}
                  >{name}</a>
                )
                : <span className="constructed-card-detail__pool-card-name">{name}</span>}
            </article>
              );
        })}
      </div>
      {hasMore && <button type="button" className="constructed-card-detail__pool-toggle" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Свернуть' : `Показать все · ${cards.length}`}</button>}
    </article>
  );
}

function GeneratedCardPools({ pools, format, period, rank, navigatePath, onOpen }: {
  pools: any[];
  format: CardFormat;
  period: ConstructedCardPeriod;
  rank: ConstructedCardRank;
  navigatePath: (path: string) => void;
  onOpen: (url: string) => void;
}) {
  return (
    <section className="constructed-card-detail__section constructed-card-detail__pools">
      <h2 data-tour-id="card-pools"><Layers3 size={19} /> Пулы генерации · {pools.length}</h2>
      <div className="constructed-card-detail__pool-list">
        {pools.map((pool, poolIndex) => <GeneratedPoolCards key={`${pool?.pool || 'pool'}-${poolIndex}`} pool={pool} format={format} period={period} rank={rank} navigatePath={navigatePath} onOpen={onOpen} />)}
      </div>
    </section>
  );
}

function RelatedCardGroups({ groups, onOpen }: {
  groups: ConstructedRelatedCardGroup[];
  onOpen: (url: string) => void;
}) {
  const total = groups.reduce((sum, group) => sum + group.cards.length, 0);
  return (
    <section className="constructed-card-detail__section constructed-card-detail__related-groups">
      <h2><Sparkles size={19} /> Токены, награды и связанные карты · {total}</h2>
      <div className="constructed-card-detail__related-group-list">
        {groups.map(group => (
          <article className="constructed-card-detail__related-group" key={group.id}>
            <header>
              <div><h3>{group.headingRu}</h3>{group.headingEn && group.headingEn !== group.headingRu && <span lang="en">{group.headingEn}</span>}</div>
              <strong>{group.cards.length}</strong>
            </header>
            <div className="constructed-card-detail__related-card-grid">
              {group.cards.map(item => {
                const name = item.nameRu || item.nameEn || item.cardId || 'Связанная карта';
                const rules = plainText(item.textRu || item.textEn);
                const cardImageUrl = constructedRelatedCardImage(item);
                return (
                  <article
                    className="constructed-card-detail__related-card"
                    key={item.cardId || `${name}-${item.cardImageUrl || ''}`}
                  >
                    {cardImageUrl
                      ? (
                        <button
                          type="button"
                          className="constructed-card-detail__related-card-image"
                          aria-label={`Открыть карту «${name}» в полном размере`}
                          onClick={() => onOpen(cardImageUrl)}
                        >
                          <img src={cardImageUrl} alt={`Карта Hearthstone «${name}»`} loading="lazy" decoding="async" onError={fallbackCardImageToOrigin} />
                        </button>
                      )
                      : <div className="constructed-card-detail__related-card-image"><Sparkles size={34} aria-hidden="true" /></div>}
                    <div className="constructed-card-detail__related-card-copy">
                      <strong>{name}</strong>
                      {item.nameEn && item.nameEn !== name && <span lang="en">{item.nameEn}</span>}
                      {(item.attack !== null || item.health !== null) && (
                        <dl aria-label={`Характеристики карты ${name}`}>
                          {item.attack !== null && <div><dt>Атака</dt><dd>{item.attack}</dd></div>}
                          {item.health !== null && <div><dt>Здоровье</dt><dd>{item.health}</dd></div>}
                        </dl>
                      )}
                      {rules && <p>{rules}</p>}
                      {item.cardId && <code>{item.cardId}</code>}
                    </div>
                  </article>
                );
              })}
            </div>
          </article>
        ))}
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

function ConstructedDeckCard({ deck, format }: {
  key?: React.Key;
  deck: ConstructedDeck;
  format: CardFormat;
}) {
  const [resolvedDeck, setResolvedDeck] = useState<ResolvedConstructedDeck | null>(null);
  const [resolveError, setResolveError] = useState('');
  const [retryToken, setRetryToken] = useState(0);
  const [copied, setCopied] = useState(false);
  const deckTitle = deck.archetypeLabel || deck.archetype || deck.title;
  const classKey = String(deck.className || '').toLowerCase().replace(/[^a-z]/g, '');
  const classColor = CONSTRUCTED_DECK_CLASS_COLORS[classKey] || '#67131c';

  useEffect(() => {
    const controller = new AbortController();
    const resolveDeck = async () => {
      setResolvedDeck(null);
      setResolveError('');
      try {
        const query = new URLSearchParams({
          code: deck.deckCode,
          format,
          archetype: deckTitle,
        });
        const response = await fetch(`/api/deck/resolve?${query}`, {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || 'Не удалось разобрать состав колоды');
        }
        setResolvedDeck(payload as ResolvedConstructedDeck);
      } catch (error) {
        if (!controller.signal.aborted) {
          setResolveError(error instanceof Error ? error.message : 'Не удалось разобрать состав колоды');
        }
      }
    };
    void resolveDeck();
    return () => controller.abort();
  }, [deck.deckCode, deckTitle, format, retryToken]);

  const copyDeck = async () => {
    if (!await copyText(deck.deckCode)) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <article className="constructed-card-detail__deck">
      <div className="constructed-card-detail__deck-list">
        <DeckRenderPreview deckCode={deck.deckCode} deckName={deckTitle}>
          {resolvedDeck ? (
            <DeckListView
              cards={resolvedDeck.cards} sideboards={resolvedDeck.sideboards}
              title={deckTitle} subtitle={format === 'wild' ? 'Вольный формат' : 'Стандарт'}
              headerColor={classColor}
              totalCards={resolvedDeck.totalCards} deckSizeLimit={resolvedDeck.deckSizeLimit}
            />
          ) : (
            <div className="constructed-card-detail__deck-list-state" aria-busy={!resolveError}>
              <Layers3 size={28} />
              <span>{resolveError || 'Загружаем состав колоды…'}</span>
              {resolveError && <button type="button" onClick={() => setRetryToken(value => value + 1)}><RefreshCw size={14} /> Повторить</button>}
            </div>
          )}
        </DeckRenderPreview>
      </div>
      <div className="constructed-card-detail__deck-copy">
        <h3>{deckTitle}</h3>
        <p>{[deck.className ? classLabel(deck.className.toUpperCase().replace(/\s+/g, '')) : '', deck.score || (deck.winrate != null ? `${percent(deck.winrate)} побед` : '')].filter(Boolean).join(' · ') || 'Готовая сборка'}</p>
        <button type="button" onClick={copyDeck}><Copy size={15} /> {copied ? 'Код скопирован' : 'Скопировать код'}</button>
      </div>
    </article>
  );
}

function ConstructedCardDecks({ decks, format }: { decks: ConstructedDeck[]; format: CardFormat }) {
  const [visibleCount, setVisibleCount] = useState(3);
  const visibleDecks = decks.slice(0, visibleCount);
  return (
    <section className="constructed-card-detail__section constructed-card-detail__decks">
      <h2 data-tour-id="card-decks"><Layers3 size={19} /> Колоды с этой картой · {decks.length}</h2>
      <div className="constructed-card-detail__deck-grid">{visibleDecks.map(deck => <ConstructedDeckCard key={deck.id} deck={deck} format={format} />)}</div>
      {visibleCount < decks.length && <button type="button" className="constructed-card-detail__pool-toggle" onClick={() => setVisibleCount(count => Math.min(count + 3, decks.length))}>Показать больше · ещё {Math.min(3, decks.length - visibleCount)}</button>}
    </section>
  );
}

const cardIdentityFacts = (card: CardRecord, format: CardFormat) => [
  { label: 'Мана', value: number(card.mana_cost) },
  { label: 'Класс', value: classLabel(card.class || 'NEUTRAL') },
  { label: 'Тип', value: card.card_type?.name_ru || constructedTypeLabel(card.card_type?.slug || '—') },
  { label: 'Редкость', value: constructedRarityLabel(card.rarity || '—') },
  { label: 'Дополнение', value: card.card_set ? constructedSetLabel(card.card_set) : 'Не указано' },
  { label: 'Художник', value: card.artist || 'Не указан' },
  ...[['Атака', card.attack], ['Здоровье', card.health], ['Прочность', card.durability], ['Броня', card.armor]]
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([label, value]) => ({ label: String(label), value })),
  ...(card.minion_type ? [{ label: 'Тип существа', value: constructedTribeLabel(card.minion_type) }] : []),
  ...(card.spell_school ? [{ label: 'Школа магии', value: constructedSpellSchoolLabel(card.spell_school) }] : []),
  { label: 'Форматы', value: card.formats?.map(item => item.name_ru || item.name_en || item.slug).join(', ') || (format === 'standard' ? 'Стандартный, Вольный' : 'Вольный') },
  { label: 'ID карты', value: <><code>{card.card_id}</code>{card.dbf ? ` · DBF ${card.dbf}` : ''}</> },
];

// Another card starts at its top. Loading the same card again (the full
// detail after the server-rendered seed, a period or rank change) keeps the
// reader where they scrolled.
function useScrollToTopOnCardChange(shownCardId: string | null) {
  const previousShownCardIdRef = useRef<string | null>(null);
  useEffect(() => {
    const previousCardId = previousShownCardIdRef.current;
    if (shownCardId) previousShownCardIdRef.current = shownCardId;
    if (!shownCardId || !previousCardId || previousCardId === shownCardId) return undefined;
    const frame = requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }));
    return () => cancelAnimationFrame(frame);
  }, [shownCardId]);
}

function DetailPage({ format, cardId, initialCard, initialSearch, navigatePath, statsAccess, statsAccessLoading, authUser, onRefreshSubscription }: { format: CardFormat; cardId: string } & Pick<StandardCardsProps, 'initialCard' | 'initialSearch' | 'navigatePath' | 'statsAccess' | 'statsAccessLoading' | 'authUser' | 'onRefreshSubscription'>) {
  const [period, setPeriod] = useConstructedCardPeriod(initialSearch);
  const [rank, setRank] = useConstructedCardRank(initialSearch);
  const [statsFormat, setStatsFormat] = useState<CardFormat>(() => (
    constructedCardStatsFormatFromSearch(initialSearch ?? (typeof window === 'undefined' ? '' : window.location.search), format)
  ));
  const [periodLabel, setPeriodLabel] = useState(() => constructedCardPeriodLabel(period));
  const [currentPatch, setCurrentPatch] = useState<string | null>(null);
  const [card, setCard] = useState<CardRecord | null>(initialCard ?? null);
  const [serverStatsAccess, setServerStatsAccess] = useState(false);
  const [loading, setLoading] = useState(!initialCard);
  const [error, setError] = useState<ConstructedCardRequestErrorCopy | null>(null);
  const [dataState, setDataState] = useState<{
    dataStatus: 'fresh' | 'stale';
    partial: boolean;
    warning: string | null;
  }>({ dataStatus: 'fresh', partial: false, warning: null });
  const [reloadToken, setReloadToken] = useState(0);
  const [variant, setVariant] = useState('normal');
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [historyOpen, setHistoryOpen] = useState(false);
  const history = useConstructedCardHistory({
    cardId,
    format: statsFormat,
    period,
    rank,
    enabled: Boolean(card && serverStatsAccess && historyOpen),
  });
  useEffect(() => {
    const syncFromLocation = () => setStatsFormat(
      constructedCardStatsFormatFromSearch(window.location.search, format),
    );
    syncFromLocation();
    window.addEventListener('popstate', syncFromLocation);
    return () => window.removeEventListener('popstate', syncFromLocation);
  }, [format]);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(!initialCard); setError(null);
      try {
        const response = await loadConstructedCardDetail({
          cardId,
          format,
          statsFormat,
          period,
          rank,
          statsAccess,
        });
        const payload = response.payload;
        if (!response.ok) {
          const failure = new Error(payload.error || 'Не удалось загрузить карту') as Error & { status?: number };
          failure.status = response.status;
          throw failure;
        }
        if (cancelled) return;
        const loadedCard = {
          ...(payload.card as CardRecord),
          mechanicTranslations: payload.mechanicTranslations || {},
          mechanicOverrides: payload.mechanicOverrides ?? payload.mechanicTranslations ?? {},
        };
        if (statsFormat === 'standard' && !cardSupportsStandardStatistics(loadedCard.formats)) {
          setStatsFormat('wild');
          if (typeof window !== 'undefined') {
            window.history.replaceState(
              window.history.state,
              '',
              constructedCardStatsUrl(
                window.location.pathname,
                { period, rank, statsFormat: 'wild', defaultStatsFormat: format },
                window.location.search,
              ),
            );
          }
          return;
        }
        setCard(loadedCard);
        setServerStatsAccess(payload.statsAccess === true);
        setPeriodLabel(payload.period?.label || constructedCardPeriodLabel(period));
        setCurrentPatch(payload.period?.patch || null);
        setDataState({
          dataStatus: payload.dataStatus === 'stale' ? 'stale' : 'fresh',
          partial: payload.partial === true,
          warning: typeof payload.warning === 'string' ? payload.warning : null,
        });
        setVariant('normal');
        setLightboxIndex(-1);
      } catch (loadError) {
        if (!cancelled) setError(constructedCardRequestError(
          'detail',
          Number((loadError as { status?: number })?.status ?? 0),
          loadError instanceof Error ? loadError.message : '',
        ));
      } finally { if (!cancelled) setLoading(false); }
    };
    void load();
    return () => { cancelled = true; };
  }, [cardId, format, period, rank, reloadToken, statsAccess, statsFormat, initialCard]);
  useScrollToTopOnCardChange(card?.card_id ?? null);
  useEffect(() => {
    if (!card) return;
    const name = cardName(card);
    const formatLabel = format === 'standard' ? 'Стандарт' : 'Вольный формат';
    const resolvedCardId = card.card_id || cardId;
    const rules = plainText(card.text?.ru || card.text?.en);
    const description = rules
      ? `${name} (${formatLabel}, ID ${resolvedCardId}): ${rules}`
      : `${name} — карта Hearthstone (${formatLabel}, ID ${resolvedCardId}) в библиотеке HearthPulse.`;
    void applyDocumentPageMeta({
      title: `${name} — карта Hearthstone (${formatLabel}, ${resolvedCardId}) | HearthPulse`,
      description: description.slice(0, 300),
      pathname: constructedCardPath(format, resolvedCardId),
      search: '',
      image: publicResourceUrl(card.images?.card),
    });
  }, [card, cardId, format]);

  if (loading) return <section className="constructed-cards constructed-cards__state" aria-busy="true"><RefreshCw className="constructed-cards__spinner" size={36} /><h1>Загружаем карту</h1></section>;
  if (error || !card) return <section className="constructed-cards constructed-cards__state" role="alert"><h1>{error?.title || 'Данные карты временно недоступны'}</h1><p>{error?.message}</p><div className="constructed-cards__state-actions">{error?.retry && <button type="button" onClick={() => setReloadToken(value => value + 1)}><RefreshCw size={17} /> Повторить</button>}<button type="button" onClick={() => navigateWithConstructedCardContext(navigatePath, `/standard/cards/${format}`, period, rank)}><ArrowLeft size={17} /> Назад к картам</button></div></section>;

  const variants = collectConstructedCardVariants(card);
  const selectedImage = variants.find(item => item.id === variant)?.url || variants[0]?.url || '';
  const wiki = card.wiki || {};
  const effectiveTranslations = mergeConstructedTranslationSources(wiki, card.mechanicOverrides);
  const mechanics = uniqueMechanicLabels([...(card.mechanics || []), ...(card.referenced_tags || []), ...(wiki.wiki_mechanics || []), ...(wiki.wiki_tags || [])], effectiveTranslations);
  const patchRows = (Array.isArray(wiki.patch_changes) ? wiki.patch_changes : [])
    .flatMap((group: any) => (Array.isArray(group?.entries) ? group.entries : []).map((entry: any) => ({ ...entry, heading: group.heading })))
    .sort((left: any, right: any) => patchTimestamp(right) - patchTimestamp(left));
  const relatedGroups = normalizeConstructedRelatedCardGroups(card);
  const generatedPools = (Array.isArray(wiki.generated_card_pools) ? wiki.generated_card_pools : [])
    .filter((pool: any) => Array.isArray(pool?.cards) && pool.cards.length > 0);
  const relatedArtMedia = collectConstructedRelatedCardArtMedia(relatedGroups);
  const relatedCardMedia = collectConstructedRelatedCardMedia(relatedGroups);
  const generatedPoolMedia = collectConstructedGeneratedPoolMedia(generatedPools);
  const mediaItems = [...collectConstructedCardMedia(card), ...relatedCardMedia, ...generatedPoolMedia, ...relatedArtMedia];
  const galleryMedia = mediaItems.filter(item => item.id.startsWith('gallery-') || item.id.startsWith('related-art-'));
  const sounds = flattenConstructedCardSounds(wiki.sounds);
  const soundGroups = [...new Set(sounds.map(item => item.group))].map(group => [group, sounds.filter(item => item.group === group)] as const);
  const externalLinks = Array.isArray(wiki.external_links) ? wiki.external_links : [];
  const decks = Array.isArray(card.decks) ? card.decks : [];
  const openMedia = (url: string) => {
    const index = mediaItems.findIndex(item => item.url === url);
    if (index >= 0) setLightboxIndex(index);
  };
  const dataNotice = constructedCardDataNotice(dataState);
  const rankLabel = constructedCardRankLabel(rank);
  const statsFormatLabel = constructedCardStatsFormatLabel(statsFormat);
  const standardStatisticsAvailable = cardSupportsStandardStatistics(card.formats);
  const changeStatistics = (next: {
    format?: CardFormat;
    rank?: ConstructedCardRank;
    period?: ConstructedCardPeriod;
  }) => {
    const nextFormat = next.format ?? statsFormat;
    const nextRank = next.rank ?? rank;
    const nextPeriod = next.period ?? period;
    setStatsFormat(nextFormat);
    setRank(nextRank);
    setPeriod(nextPeriod);
    if (typeof window !== 'undefined') {
      window.history.replaceState(
        window.history.state,
        '',
        constructedCardStatsUrl(
          window.location.pathname,
          {
            period: nextPeriod,
            rank: nextRank,
            statsFormat: nextFormat,
            defaultStatsFormat: format,
          },
          window.location.search,
        ),
      );
    }
  };

  return (
    <article className="constructed-cards constructed-card-detail">
      <nav className="constructed-card-detail__breadcrumb" aria-label="Breadcrumb"><a href={constructedCardStatsUrl(`/standard/cards/${format}`, { period, rank })} onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return; event.preventDefault(); navigateWithConstructedCardContext(navigatePath, `/standard/cards/${format}`, period, rank); }}>Карты</a><span>/</span><span>{format === 'standard' ? 'Стандарт' : 'Вольный'}</span><span>/</span><strong>{cardName(card)}</strong></nav>
      <button type="button" className="constructed-card-detail__back" onClick={() => navigateWithConstructedCardContext(navigatePath, `/standard/cards/${format}`, period, rank)}><ArrowLeft size={17} /> Назад к картам</button>
      {dataNotice && <div className="constructed-cards__data-warning constructed-card-detail__data-warning" role="status"><AlertTriangle size={18} /><span>{dataNotice}</span></div>}

      <section className="constructed-card-detail__hero">
        <div className="constructed-card-detail__visual">
          <button type="button" className="constructed-card-detail__visual-button" onClick={() => openMedia(selectedImage)} aria-label={`Открыть ${cardName(card)} в полном размере`}>
            <img src={selectedImage} alt={cardName(card)} onError={fallbackCardImageToOrigin} />
            <span>Открыть в полном размере</span>
          </button>
          <div className="constructed-card-detail__variants" aria-label="Вариант изображения" data-tour-id="card-art">{variants.map(item => <button key={item.id} type="button" aria-pressed={variant === item.id} onClick={() => setVariant(item.id)}>{item.label}</button>)}</div>
        </div>
        <ConstructedCardIdentity
          name={cardName(card)} englishName={card.name?.en} classIconUrl={classIcon(card.class)}
          rulesText={plainText(card.text?.ru || card.text?.en)}
          flavorText={plainText(card.flavor?.ru || card.flavor?.en)}
          facts={cardIdentityFacts(card, format)}
        />
        <div className={`constructed-card-detail__statistics${serverStatsAccess ? '' : ' is-locked'}`}>
          <div data-tour-id="card-statistics"><h2>Статистика · {rankLabel}</h2><span>{statsFormatLabel} · {periodLabel}{serverStatsAccess ? ` · обновлено ${formatDate(card.statsUpdatedAt)}` : ' · тариф «Алмаз»'}</span></div>
          <div className="constructed-card-detail__statistics-controls" aria-label="Выбор статистики карты">
            <div className="constructed-card-detail__statistics-format" role="group" aria-label="Формат статистики">
              {standardStatisticsAvailable && <button type="button" aria-pressed={statsFormat === 'standard'} onClick={() => changeStatistics({ format: 'standard' })}><img src="/card-format-standard.webp" alt="" />Стандарт</button>}
              <button type="button" aria-pressed={statsFormat === 'wild'} onClick={() => changeStatistics({ format: 'wild' })}><img src="/card-format-wild.webp" alt="" />Вольный</button>
            </div>
            <FilterSelect
              label="Ранг"
              value={rank}
              onChange={value => changeStatistics({ rank: value as ConstructedCardRank })}
              options={CONSTRUCTED_CARD_RANK_OPTIONS.map(option => ({ value: option.id, label: option.label }))}
            />
            <FilterSelect
              label="Период"
              value={period}
              onChange={value => changeStatistics({ period: value as ConstructedCardPeriod })}
              options={constructedCardPeriodOptions(currentPatch).map(option => ({ value: option.id, label: option.label }))}
            />
          </div>
          {serverStatsAccess ? <><StatsRows stats={card.stats} />{!card.stats && <p className="constructed-card-detail__no-stats">Карта есть в библиотеке, но в выборке «{statsFormatLabel} · {rankLabel} · {periodLabel}» недостаточно данных.</p>}</> : (
            <div className="constructed-card-detail__statistics-gate">
              <div className="constructed-card-detail__statistics-blur" aria-hidden="true" inert><StatsRows stats={LOCKED_STATS_PLACEHOLDER} /></div>
              <StatsUnlockNotice statsAccessLoading={statsAccessLoading} authUser={authUser} onRefreshSubscription={onRefreshSubscription} />
            </div>
          )}
        </div>
      </section>

      {serverStatsAccess && (
        <ConstructedCardHistoryChart
          points={history.points}
          periodLabel={periodLabel}
          formatLabel={statsFormatLabel}
          rankLabel={rankLabel}
          days={history.days}
          onDaysChange={history.setDays}
          loading={history.loading}
          error={history.error}
          onOpenChange={setHistoryOpen}
        />
      )}

      <section className="constructed-card-detail__lower-grid">
        <div className="constructed-card-detail__section"><h2>Механики и теги</h2><div className="constructed-card-detail__tags">{mechanics.length ? mechanics.map(item => <span key={item.key}>{item.label}</span>) : <p>Механики не указаны.</p>}</div></div>
        <div className="constructed-card-detail__section constructed-card-detail__patches" data-tour-id="card-patches"><h2>Изменения по патчам</h2>{patchRows.length ? <div>{patchRows.map((row: any, index: number) => {
          const dateValue = row.manacost_published_at || row.date;
          const title = row.manacost_title || `Обновление ${patchVersion(row.patch)}`;
          const description = row.manacost_summary || (row.manacost_url ? 'Подробности обновления доступны на HS-Manacost.' : 'Русская статья для этого обновления пока не найдена.');
          const heading = <><span>{patchDate(dateValue)}</span><strong>{title}</strong>{row.manacost_url && <ExternalLink size={15} />}</>;
          return <details key={`${row.patch}-${row.date}-${index}`}><summary><span className="constructed-card-detail__patch-heading">{heading}</span></summary><div className="constructed-card-detail__patch-body"><p>{description}</p>{row.manacost_url && <a href={row.manacost_url} target="_blank" rel="noreferrer">Читать на HS‑Manacost <ExternalLink size={14} /></a>}</div></details>;
        })}</div> : <p>История изменений не найдена.</p>}</div>
      </section>

      {relatedGroups.length > 0 && <RelatedCardGroups groups={relatedGroups} onOpen={openMedia} />}

      {generatedPools.length > 0 && <GeneratedCardPools pools={generatedPools} format={format} period={period} rank={rank} navigatePath={navigatePath} onOpen={openMedia} />}

      {decks.length > 0 && <ConstructedCardDecks key={`${format}:${cardId}`} decks={decks} format={format} />}

      <section className={`constructed-card-detail__media-grid${sounds.length ? '' : ' constructed-card-detail__media-grid--two'}`}>
        <div className="constructed-card-detail__section"><h2>Галерея · {galleryMedia.length}</h2>{galleryMedia.length ? <div className="constructed-card-detail__gallery">{galleryMedia.map(item => <button className={item.presentation === 'contain' ? 'is-contain' : undefined} key={item.id} type="button" onClick={() => openMedia(item.url)} aria-label={`Открыть ${item.label}`}><img src={item.thumbnailUrl} alt={item.label} loading="lazy" decoding="async" onError={fallbackCardImageToOrigin} /><span>{item.label}</span></button>)}</div> : <p>Дополнительные изображения отсутствуют.</p>}</div>
        {sounds.length > 0 && <div className="constructed-card-detail__section"><h2><Volume2 size={19} /> Звуки карты · {sounds.length}</h2><div className="constructed-card-detail__sounds">{soundGroups.map(([group, clips], groupIndex) => <details key={group} open={groupIndex === 0}><summary>{constructedSoundGroupLabel(group)} · {clips?.length ?? 0}</summary>{clips?.map((item, clipIndex) => <article key={item.id}><span>{soundClipLabel(item.description, item.group, clipIndex)}</span><audio controls preload="none" src={item.url}>Ваш браузер не поддерживает воспроизведение аудио.</audio></article>)}</details>)}</div></div>}
        <div className="constructed-card-detail__section"><h2>Дополнительная информация</h2><div className="constructed-card-detail__links">{card.wiki_page?.url && <a href={card.wiki_page.url} target="_blank" rel="noreferrer">Hearthstone Wiki <ExternalLink size={14} /></a>}{externalLinks.map((item: any, index: number) => <a key={`${item.url}-${index}`} href={item.url} target="_blank" rel="noreferrer">{item.label || item.url} <ExternalLink size={14} /></a>)}</div></div>
      </section>
      {lightboxIndex >= 0 && <ConstructedCardLightbox items={mediaItems} index={lightboxIndex} onClose={() => setLightboxIndex(-1)} onIndexChange={setLightboxIndex} />}
    </article>
  );
}

/** The card page; the catalog is the separate StandardCards bundle. */
export default function StandardCardDetail(props: StandardCardsProps) {
  const route = routeState(props.currentPath);
  const cardId = route.cardId ?? props.initialCard?.card_id ?? '';
  return <DetailPage key={`${route.format}:${cardId}`} format={route.format} cardId={cardId} {...props} />;
}

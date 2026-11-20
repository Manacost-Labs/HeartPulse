import '../shared/ui/analytics/Analytics.css';
import '../modules/battlegrounds/public.css';
import { fetchBattlegroundMinionStats, useBattlegroundLibraryData, type BattlegroundMinionStats, battlegroundMinionIconBySlug as RACE_ICON_BY_SLUG } from '../modules/battlegrounds/public';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { applyDocumentPageMeta } from '../shared/seo/publicUrlPolicy';
import { battlegroundCardTitle } from '../../shared/entityPageTitles';
import { publicResourceUrl } from '../publicResourceUrl';
import { CardVariantImages, CardVariantSwitch } from '../shared/ui/CardVariantSwitch';
import {
  battlegroundBaseCardId,
  findBattlegroundCardVariants,
} from './battlegroundCardVariants';
import { BgLibraryDetailSkeleton, type BgLibraryCardTeaser } from './BgLibrarySkeletons';
import { BgLibraryListPage, type BgLibraryListData } from './BgLibraryListPage';
import { bgLibraryCatalogResource, fetchAuxiliaryLibraryCards, fetchJson, fetchJsonOrNull, versionedLibraryUrl } from './bgLibraryCatalog';
import { cardLibraryKind, cardPath, cardRuName, cleanSearch, tavernIcon, type LibraryCard } from './bgLibraryCards';
import {
  dedupeLibraryCards, detailCardImage, fallbackBrokenHeroImage, fallbackCardImages, goldenVariantFallbackImages,
  goldenVariantImage, hearthstoneJsonBgCardUrl, hideBrokenImage, isLikelyGoldenCardId, localDbImageUrl, primaryCardImage, uniqueStrings,
} from './bgLibraryCardImages';
import { isBaseLibraryKind, LIBRARY_SECTIONS, libraryKindLabel, sectionFor, sectionHref, type LibraryKind, type PoolMode } from './bgLibrarySections';
import { BattlegroundLoadError } from './BattlegroundsSkeletons';
import { BattlegroundMinionHeader } from './BattlegroundMinionHeader';
import { BattlegroundMinionStatsSections } from './BattlegroundMinionStatsSections';
import { minionPlacementTone, minionStatsKpis } from './battlegroundMinionStatsModel';
import { optimizedBattlegroundThumbnailUrl } from './battlegroundImageUrls';
import { BattlegroundStrategyList } from './BattlegroundStrategyList';
import { strategyRows, type StrategyEntry } from './bgLibraryStrategyRows';
import { fetchWithDeadline } from '../shared/http/fetchWithDeadline';
import '../route-parchment.css';
import '../battlegrounds-shell.css';
import '../battlegrounds-parchment.css';


/** Minion statistics of the detail page: `missing` is a slice without games, `failed` an unavailable source. */
type MinionStatsLoad = BattlegroundMinionStats | 'missing' | 'failed';

interface FirestoneSpellStat {
  id: string;
  card_id: string;
  dbfId: number;
  name: string;
  image_url?: string;
  tavern_tier: number;
  total_played: number;
  average_placement: number;
  average_placement_other: number;
  impact: number;
}

interface BgLibraryProps {
  currentPath: string;
  cacheScope?: string;
  navigatePath: (path: string) => void;
  /** Public identity the server page already rendered; it seeds the card page while statistics load. */
  teaser?: BgLibraryCardTeaser;
  /** The H1 of a listing, as the server page names it. */
  heading?: string;
}



/** Version of a Battlegrounds card shown on its detail page. */
type BattlegroundCardVariant = 'normal' | 'golden';




function formatDecimal(value: unknown, digits = 2): string {
  if (!Number.isFinite(Number(value))) return '—';
  return Number(value).toFixed(digits).replace('.', ',');
}

function formatCount(value: unknown): string {
  if (!Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('ru-RU');
}


function dbfFromPath(path: string): number | null {
  const match = decodeURIComponent(path).match(/-(\d+)\/?$/);
  return match ? Number(match[1]) : null;
}

function libraryRoute(path: string): { page: 'list' | 'detail'; kind: LibraryKind; pool: PoolMode; dbfId: number | null } {
  const normalized = path.replace(/\/+$/, '') || '/library';
  const pool: PoolMode = normalized.startsWith('/library/archive') ? 'archive' : 'current';
  const kind = (() => {
    const match = LIBRARY_SECTIONS.find(section => {
      const base = pool === 'archive' ? section.archiveHref : section.activeHref;
      return normalized === base || normalized.startsWith(`${base}/`);
    });
    return match?.kind || (normalized.includes('/spells') ? 'spell' : 'minion');
  })();
  const detailBase = `${sectionHref(kind, pool)}/`;
  const isDetail = normalized.startsWith(detailBase) && normalized.length > detailBase.length;
  return { page: isDetail ? 'detail' : 'list', kind, pool, dbfId: isDetail ? dbfFromPath(normalized) : null };
}

function cardEnName(card: LibraryCard): string {
  return card.name?.en || card.card_id;
}

function cardRulesText(card: LibraryCard): string {
  const raw = String(card.text?.ru || card.text_ru || card.text?.en || '');
  // The catalog appends a service tail ("Механики: AURA", "EN: …") to the Russian text.
  const text = raw.split(/\n(?:Механики|EN):/)[0]
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\u00a0/g, ' ');
  // `[x]` marks manual line breaks of the in-game card frame, not paragraphs.
  return (/\[x\]/i.test(text) ? text.replace(/\[x\]/gi, '').replace(/\s*\n\s*/g, ' ') : text)
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}


function setLibraryMeta(title: string, description: string, slug: string, image?: string | null): void {
  void applyDocumentPageMeta({ title, description, pathname: slug, search: '', image });
}

function flattenSpellStats(payload: any): FirestoneSpellStat[] {
  const tiers = payload?.view?.tiers || {};
  return Object.values(tiers).flatMap((items: any) => Array.isArray(items) ? items : []) as FirestoneSpellStat[];
}

function parseStrategies(source: string): StrategyEntry[] {
  const match = source.match(/window\.compsStatic\s*=\s*([\s\S]*?);\s*$/);
  if (!match) return [];
  try {
    const payload = Function(`"use strict"; return (${match[1].replace(/;+\s*$/, '')});`)();
    return Array.isArray(payload?.comps) ? payload.comps : [];
  } catch {
    return [];
  }
}

function cardGroupName(card: LibraryCard): string {
  return card.group?.name_ru || card.library?.name_ru || card.category?.name_ru || libraryKindLabel(cardLibraryKind(card));
}

function cardMatchesStrategy(card: LibraryCard, strategy: StrategyEntry): boolean {
  return (strategy.cards || []).some(item => {
    if (Number(item.dbfId) === Number(card.dbf)) return true;
    if (item.id && item.id === card.card_id) return true;
    return false;
  });
}

function strategySourceParam(strategy: StrategyEntry): string {
  return cleanSearch(strategy.source).includes('hsreplay') ? 'hsreplay' : 'firestone';
}

function strategyTierListPath(strategy: StrategyEntry): string {
  const params = new URLSearchParams({
    list: 'strategies',
    source: strategySourceParam(strategy),
    strategy: strategy.key,
  });
  if (strategy.title) params.set('q', strategy.title);
  return `/battlegrounds/tier-list/?${params.toString()}#strategy`;
}

function metricTone(value: unknown): string {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return 'text-[#826b49]';
  if (numberValue > 0.4) return 'text-[#2f7a3e]';
  if (numberValue > 0) return 'text-[#8a651f]';
  return 'text-[#a33a3a]';
}


function MetricCard({ label, value, caption, tone, tourId }: { label: string; value: string; caption?: string; tone?: string; tourId?: string }) {
  return (
    <div className="bg-library-metric-card min-w-0 rounded-md border border-[#cbd9ed] bg-[#f8fbff] px-4 py-3 shadow-sm" data-tour-id={tourId}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#60718a]">{label}</p>
      <p className={`mt-1 min-w-0 font-hs text-2xl ${tone || 'text-[#7c5b24]'}`}>{value}</p>
      {caption && <p className="mt-1 text-xs text-[#657893]">{caption}</p>}
    </div>
  );
}

/** The protected catalog of `kind` and `pool` as a listing reads it; a retry asks the data hook again. */
function useLibraryCatalog(kind: LibraryKind, pool: PoolMode, cacheScope?: string): BgLibraryListData {
  const [attempt, setAttempt] = useState(0);
  const { data, loading, error } = useBattlegroundLibraryData(bgLibraryCatalogResource, kind, pool, cacheScope, attempt);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  return useMemo(() => ({ data, loading, error, retry }), [data, error, loading, retry]);
}


/** The subscriber's listing of `kind` and `pool` (the hub and the archive), with the catalog as its cards. */
function LibraryListRoute({ kind, pool, navigatePath, cacheScope, heading }: {
  kind: LibraryKind; pool: PoolMode; navigatePath: (path: string) => void; cacheScope?: string; heading?: string;
}) {
  const library = useLibraryCatalog(kind, pool, cacheScope);
  useEffect(() => {
    const section = sectionFor(kind);
    const kindLabel = kind === 'spell' ? 'заклинаний' : 'существ';
    const title = isBaseLibraryKind(kind)
      ? (pool === 'archive'
        ? `Архив ${kindLabel} Полей сражений Hearthstone | HearthPulse`
        : `${kind === 'spell' ? 'Заклинания' : 'Существа'} Полей сражений: библиотека | HearthPulse`)
      : `${pool === 'archive' ? 'Архив · ' : ''}${section.title} Полей сражений | HearthPulse`;
    setLibraryMeta(title, pool === 'archive' ? section.archiveDescription : section.description, sectionHref(kind, pool));
  }, [kind, pool]);
  return <BgLibraryListPage key={`${kind}:${pool}`} kind={kind} pool={pool} navigatePath={navigatePath} heading={heading} library={library} />;
}

function DetailPage({ kind, pool, dbfId, navigatePath, teaser }: { kind: LibraryKind; pool: PoolMode; dbfId: number; navigatePath: (path: string) => void; teaser?: BgLibraryCardTeaser }) {
  const [card, setCard] = useState<LibraryCard | null>(null);
  const [minionStats, setMinionStats] = useState<MinionStatsLoad>('missing');
  const [spellStats, setSpellStats] = useState<FirestoneSpellStat[]>([]);
  const [relatedCards, setRelatedCards] = useState<LibraryCard[]>([]);
  const [strategies, setStrategies] = useState<StrategyEntry[]>([]);
  const [goldenVariant, setGoldenVariant] = useState<LibraryCard | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<BattlegroundCardVariant>('normal');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    const cardRequest = isBaseLibraryKind(kind)
      ? fetchJson<LibraryCard>(versionedLibraryUrl(`/api/bg/library/cards/by-dbf/${dbfId}`))
      : fetchAuxiliaryLibraryCards(kind, pool, { dbf: dbfId, per_page: 1 }).then(items => {
        const found = items.find(item => Number(item.dbf) === Number(dbfId)) || items[0];
        if (!found) throw new Error('Карта не найдена');
        return found;
      });
    const baseRequests: Array<Promise<unknown>> = [
      cardRequest,
      isBaseLibraryKind(kind) && pool === 'current'
        ? fetchWithDeadline('/bg-legacy/comps-data.js', { cache: 'force-cache' }).then(response => response.ok ? response.text() : '')
        : Promise.resolve(''),
      isBaseLibraryKind(kind) && pool === 'current'
        ? fetchJson<{ data: LibraryCard[] }>(versionedLibraryUrl('/api/bg/library/cards', { card_type: kind, in_pool: 1 })).then(result => result.data || []).catch(() => [])
        : fetchAuxiliaryLibraryCards(kind, pool).catch(() => []),
    ];
    if (kind === 'minion' && pool === 'current') {
      baseRequests.push(fetchBattlegroundMinionStats(dbfId).then(stats => stats ?? 'missing', () => 'failed'));
    } else if (kind === 'spell' && pool === 'current') {
      baseRequests.push(fetchJsonOrNull<any>('/api/bg/library/spell-stats'));
    } else {
      baseRequests.push(Promise.resolve(null));
    }
    baseRequests.push(
      kind === 'minion'
        ? cardRequest
          .then(loadedCard => {
            const variantSearchCardId = battlegroundBaseCardId(loadedCard.card_id);
            return fetchJson<{ data: LibraryCard[] }>(versionedLibraryUrl('/api/bg/library/cards', {
              card_type: 'minion',
              in_pool: 0,
              q: variantSearchCardId,
            }));
          })
          .then(result => result.data || [])
          .catch(() => [])
        : Promise.resolve([]),
    );

    Promise.all(baseRequests)
      .then(results => {
        if (!alive) return;
        const loadedCard = results[0] as LibraryCard;
        const variants = findBattlegroundCardVariants(
          loadedCard,
          results[4] as LibraryCard[],
        );
        const normalCard = variants.normal || loadedCard;
        setSelectedVariant('normal');
        setCard(normalCard);
        setGoldenVariant(variants.golden);
        setStrategies(parseStrategies(String(results[1] || '')));
        setRelatedCards(dedupeLibraryCards((results[2] as LibraryCard[]).filter(
          item => battlegroundBaseCardId(item.card_id) !== battlegroundBaseCardId(normalCard.card_id),
        )));
        if (kind === 'minion' && pool === 'current') {
          setMinionStats(results[3] as MinionStatsLoad);
          setSpellStats([]);
        } else if (kind === 'spell' && pool === 'current') {
          setSpellStats(results[3] ? flattenSpellStats(results[3]) : []);
          setMinionStats('missing');
        } else {
          setSpellStats([]);
          setMinionStats('missing');
        }
        const loadedCardName = cardRuName(normalCard);
        const title = battlegroundCardTitle({ name: loadedCardName, type: kind === 'minion' ? 'существо' : kind === 'spell' ? 'заклинание' : 'карта', archive: pool === 'archive' });
        const description = pool === 'archive'
          ? `${loadedCardName}: архивная карта Полей сражений Hearthstone вне активного пула.`
          : `${loadedCardName}: ${cardGroupName(normalCard)}, ${cardRulesText(normalCard) || 'подробная карточка Полей сражений.'}`;
        setLibraryMeta(title, description, cardPath(normalCard, pool), detailCardImage(normalCard));
      })
      .catch(errorValue => {
        if (alive) setError(errorValue?.message || 'Не удалось загрузить карту');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [attempt, dbfId, kind, pool]);

  const spellStat = useMemo(() => spellStats.find(item => Number(item.dbfId) === Number(dbfId)), [dbfId, spellStats]);
  const usedStrategies = useMemo(() => card ? strategies.filter(strategy => cardMatchesStrategy(card, strategy)) : [], [card, strategies]);
  const usedStrategyRows = useMemo(() => strategyRows(usedStrategies, dbfId,
    cardId => optimizedBattlegroundThumbnailUrl(localDbImageUrl(cardId, 'art'), 96))
    .map((row, index) => ({ ...row, href: strategyTierListPath(usedStrategies.find(strategy => strategy.key === row.key) ?? usedStrategies[index]) })),
  [dbfId, usedStrategies]);
  const similar = useMemo(() => {
    if (!card) return [];
    const mechanicSet = new Set((card.mechanics || []).map(item => item.slug));
    const scored: Array<{ item: LibraryCard; score: number }> = [];
    for (const item of relatedCards) {
      const raceMatch = card.creature_type?.slug && item.creature_type?.slug === card.creature_type.slug ? 2 : 0;
      const tierMatch = card.tavern_tier && item.tavern_tier === card.tavern_tier ? 1 : 0;
      let mechanicMatch = 0;
      for (const mechanic of item.mechanics || []) {
        if (mechanicSet.has(mechanic.slug)) mechanicMatch += 1;
      }
      const score = raceMatch + tierMatch + mechanicMatch;
      if (score > 0) scored.push({ item, score });
    }
    return scored
      .sort((a, b) => b.score - a.score || cardRuName(a.item).localeCompare(cardRuName(b.item), 'ru'))
      .slice(0, 6)
      .map(row => row.item);
  }, [card, relatedCards]);

  if (loading) {
    return <BgLibraryDetailSkeleton kicker={`${sectionFor(kind).shortTitle} · ${pool === 'archive' ? 'Архив' : 'Активный пул'}`}
      stats={pool === 'current' && isBaseLibraryKind(kind)} minion={kind === 'minion' && pool === 'current'} teaser={teaser} />;
  }
  if (error) return <BattlegroundLoadError message={error} onRetry={() => setAttempt(value => value + 1)} />;
  if (!card) return <div className="rounded-lg border border-[#efb4b4] bg-[#fff1f1] p-6 text-[#8f2424]">Карта не найдена</div>;

  const backPath = sectionHref(kind, pool);
  const showStats = pool === 'current' && isBaseLibraryKind(kind);
  const stats = typeof minionStats === 'object' ? minionStats : null;
  // The statistics carry the golden render even when the catalog has no golden card record.
  const reliableGoldenImage = (goldenVariant ? goldenVariantImage(goldenVariant) : null) ?? (stats?.golden ? stats.minion.images.cardGolden : null);
  const hasGoldenVariant = kind === 'minion' && Boolean(reliableGoldenImage);
  const selectedVariantCard = selectedVariant === 'golden' && hasGoldenVariant && goldenVariant
    ? goldenVariant
    : card;
  const currentCardName = cardRuName(selectedVariantCard);
  const section = sectionFor(kind);
  const rulesText = cardRulesText(selectedVariantCard);
  const wikiUrl = selectedVariantCard.wiki_page?.url || selectedVariantCard.wiki?.page?.url || '';
  const minionView = kind === 'minion' && pool === 'current';
  const variantTotals = stats ? stats[selectedVariant === 'golden' && hasGoldenVariant ? 'golden' : 'normal'] : null;
  // Minions show the full card in both versions: the board portrait («framed»)
  // read poorly, and `_G` renders are not the golden card (HearthstoneJSON has
  // none, and the cached one shows other stats). The golden card is the base id
  // in `golden/`, the normal one the 512 px HearthstoneJSON render.
  const minionBaseId = kind === 'minion' ? battlegroundBaseCardId(card.card_id) : null;
  const normalImage = minionBaseId ? publicResourceUrl(hearthstoneJsonBgCardUrl(minionBaseId))
    : detailCardImage(card) || '/arena-logo-icon.webp?v=arena-legacy-20260629';
  const normalFallbacks = minionBaseId
    ? uniqueStrings([publicResourceUrl(localDbImageUrl(minionBaseId, 'cards')), ...fallbackCardImages(card, normalImage, true)])
    : fallbackCardImages(card, normalImage, true);
  const goldenImage = minionBaseId && hasGoldenVariant ? publicResourceUrl(localDbImageUrl(minionBaseId, 'golden')) : reliableGoldenImage;
  const goldenFallbacks = goldenImage
    ? uniqueStrings([reliableGoldenImage, ...(goldenVariant ? goldenVariantFallbackImages(goldenVariant, goldenImage) : [])])
      .filter(candidate => candidate !== goldenImage && !isLikelyGoldenCardId(candidate.split('/').pop()?.replace(/\.png$/, '') ?? ''))
    : [];
  const statsLabel = (attack?: number | null, health?: number | null) =>
    typeof attack === 'number' && typeof health === 'number' ? `${attack}/${health}` : undefined;
  const variantToggle = hasGoldenVariant ? (
    <CardVariantSwitch
      tone={minionView ? 'plate' : 'parchment'}
      value={selectedVariant}
      onChange={value => setSelectedVariant(value as BattlegroundCardVariant)}
      options={[
        { id: 'normal', label: 'Обычная', note: statsLabel(card.attack, card.health) },
        { id: 'golden', label: 'Золотая', note: goldenVariant ? statsLabel(goldenVariant.attack, goldenVariant.health) : undefined },
      ]}
    />
  ) : null;
  const heroCard = (
    <CardVariantImages
      className="drop-shadow-[0_22px_30px_rgba(21,31,47,0.22)]"
      value={selectedVariant === 'golden' && hasGoldenVariant ? 'golden' : 'normal'}
      alt={`${currentCardName}${selectedVariant === 'golden' ? ' — золотая версия' : ''}`}
      images={[
        { id: 'normal', src: normalImage, fallbacks: normalFallbacks },
        ...(hasGoldenVariant && goldenImage ? [{ id: 'golden', src: goldenImage, fallbacks: goldenFallbacks }] : []),
      ]}
      onError={fallbackBrokenHeroImage}
    />
  );

  return (
    <div className="bg-library-detail-page space-y-6 text-[#26374f]">
      <button type="button" onClick={() => navigatePath(backPath)} className="inline-flex items-center gap-2 rounded-md border border-[#cbd9ed] bg-[#ffffff] px-4 py-2 text-sm font-semibold text-[#33445d] hover:border-[#d3af55]">
        <ArrowLeft size={16} /> Назад в {pool === 'archive' ? 'архив' : 'библиотеку'}
      </button>
      {minionView ? (
        // A wrapper keeps the plate out of the BG skin's `> section` card rules.
        <div>
          <BattlegroundMinionHeader
            identityTourId="bg-library-detail-dossier"
            title={currentCardName}
            card={heroCard}
            variant={variantToggle}
            facts={[
              ...(selectedVariantCard.tavern_tier ? [{ key: 'tier', label: `Таверна ${selectedVariantCard.tavern_tier}`, icon: tavernIcon(selectedVariantCard.tavern_tier) }] : []),
              ...(selectedVariantCard.creature_type ? [{ key: 'type', label: selectedVariantCard.creature_type.name_ru, icon: RACE_ICON_BY_SLUG[selectedVariantCard.creature_type.slug] }] : []),
              // A mechanic without a translation arrives as its game enum (BACON_BLOOD_GEM_TOOLTIP).
              ...(selectedVariantCard.mechanics || []).filter(mechanic => !/^[A-Z0-9_]+$/.test(mechanic.name_ru))
                .map(mechanic => ({ key: mechanic.slug, label: mechanic.name_ru })),
              ...(selectedVariantCard.duos_only ? [{ key: 'duos', label: 'Дуо' }] : []),
            ]}
            rulesText={rulesText}
            art={stats?.minion.images.art ?? localDbImageUrl(battlegroundBaseCardId(card.card_id), 'art')}
            kpis={minionStatsKpis(variantTotals)}
            placementTone={minionPlacementTone(variantTotals)}
            metricsTourId="bg-library-detail-statistics"
            emptyText={minionStats === 'failed'
              ? 'Статистика HSReplay сейчас недоступна. Попробуйте обновить страницу позже.'
              : selectedVariant === 'golden' && stats
                ? 'По золотой версии мало игр за последние 7 дней.'
                : 'По этому существу нет игр в выборке HSReplay за последние 7 дней.'}
            methodology={Boolean(stats)}
          />
        </div>
      ) : (
      <section className="bg-library-card-dossier overflow-hidden rounded-lg border border-[#cbd9ed] bg-[#f8fbff] shadow-[0_16px_38px_rgba(68,88,122,0.14)]">
        <div className="bg-library-card-dossier__layout grid gap-6 p-4 sm:p-6 lg:grid-cols-[320px_1fr]">
          <div className="bg-library-card-dossier__art relative mx-auto w-full max-w-xs flex-col">
            {heroCard}
            {variantToggle}
          </div>
          <div className="bg-library-card-dossier__copy min-w-0 space-y-5">
            <div data-tour-id="bg-library-detail-dossier">
              <p className="font-hs text-xs uppercase tracking-[0.18em] text-[#8a651f]">{section.shortTitle} · {pool === 'archive' ? 'Архив' : 'Активный пул'}</p>
              <h1 className="bg-library-card-dossier__title mt-2 font-hs text-4xl text-[#23314a] sm:text-5xl">{currentCardName}</h1>
              <p className="mt-1 text-lg text-[#657893]">{cardEnName(selectedVariantCard)}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {selectedVariantCard.tavern_tier && <span className="inline-flex items-center gap-2 rounded-md border border-[#d6e1f1] bg-[#ffffff] px-3 py-2 font-semibold text-[#33445d]"><img src={tavernIcon(selectedVariantCard.tavern_tier)} alt="" className="h-8 w-8" />Таверна {selectedVariantCard.tavern_tier}</span>}
              {selectedVariantCard.creature_type && <span className="inline-flex items-center gap-2 rounded-md border border-[#d6e1f1] bg-[#ffffff] px-3 py-2 font-semibold text-[#33445d]">{RACE_ICON_BY_SLUG[selectedVariantCard.creature_type.slug] && <img src={RACE_ICON_BY_SLUG[selectedVariantCard.creature_type.slug]} alt="" className="h-8 w-8 rounded-full" />} {selectedVariantCard.creature_type.name_ru}</span>}
              {selectedVariantCard.group?.name_ru && <span className="rounded-md border border-[#f0dca8] bg-[#fff8de] px-3 py-2 font-semibold text-[#7c5b24]">{selectedVariantCard.group.name_ru}</span>}
              {(selectedVariantCard.mechanics || []).map(mechanic => <span key={mechanic.slug} className="rounded-md border border-[#e5d3f1] bg-[#fbf4ff] px-3 py-2 font-semibold text-[#603f77]">{mechanic.name_ru}</span>)}
              {selectedVariantCard.duos_only && <span className="rounded-md border border-[#bfdbfe] bg-[#eff6ff] px-3 py-2 font-semibold text-[#1f4e88]">Дуо</span>}
            </div>

            {rulesText && (
              <div className="bg-library-card-description rounded-md border border-[#d6e1f1] bg-[#ffffff] p-4 text-base leading-relaxed text-[#3b4d68]">
                <p className="mb-2 font-hs text-lg text-[#26374f]">Описание карты</p>
                <p className="whitespace-pre-line">{rulesText}</p>
              </div>
            )}

            {showStats ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Impact" value={formatDecimal(spellStat?.impact, 2)} tone={metricTone(spellStat?.impact)} tourId="bg-library-detail-statistics" />
                <MetricCard label="Среднее место" value={formatDecimal(spellStat?.average_placement, 2)} />
                <MetricCard label="Сыграно" value={formatCount(spellStat?.total_played)} />
                <MetricCard label="Стратегии" value={String(usedStrategies.length)} caption="где карта встречается" />
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Раздел" value={section.shortTitle} />
                <MetricCard label="Группа" value={cardGroupName(selectedVariantCard)} />
                <MetricCard label="DBF" value={String(selectedVariantCard.dbf || '—')} />
                <MetricCard label="Статус" value={pool === 'archive' ? 'Архив' : (selectedVariantCard.in_pool ? 'В пуле' : 'Справочник')} />
              </div>
            )}

            <div className="bg-library-card-sources flex min-w-0 flex-wrap gap-2">
              {selectedVariantCard.source && <span className="rounded-md border border-[#d6e1f1] bg-white px-3 py-2 text-sm font-semibold text-[#60718a]">Источник: {selectedVariantCard.source}</span>}
              {selectedVariantCard.artist && <span className="rounded-md border border-[#d6e1f1] bg-white px-3 py-2 text-sm font-semibold text-[#60718a]">Художник: {selectedVariantCard.artist}</span>}
              {wikiUrl && (
                <a href={wikiUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-md border border-[#d3af55] bg-[#fff8de] px-3 py-2 text-sm font-semibold text-[#7c5b24]" style={{ textDecoration: 'none' }}>
                  Страница на wiki <ExternalLink size={15} />
                </a>
              )}
            </div>
          </div>
        </div>
      </section>
      )}

      {minionView && stats && (
        <div>
          <BattlegroundMinionStatsSections key={stats.minion.dbfId} stats={stats} tourId="bg-library-detail-rounds" variant={selectedVariant === 'golden' && hasGoldenVariant ? 'golden' : 'normal'} />
        </div>
      )}

      {kind === 'spell' && showStats && (
        <section className="rounded-lg border border-[#cbd9ed] bg-[#f8fbff] p-4 shadow-sm sm:p-5">
          <h2 className="mb-4 font-hs text-2xl text-[#26374f]">Статистика Firestone</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Impact" value={formatDecimal(spellStat?.impact, 2)} tone={metricTone(spellStat?.impact)} />
            <MetricCard label="Среднее место" value={formatDecimal(spellStat?.average_placement, 2)} />
            <MetricCard label="Среднее место без карты" value={formatDecimal(spellStat?.average_placement_other, 2)} />
            <MetricCard label="Сыграно" value={formatCount(spellStat?.total_played)} />
          </div>
        </section>
      )}

      {showStats && (
      <section className="rounded-lg border border-[#cbd9ed] bg-[#f8fbff] p-4 shadow-sm sm:p-5">
        <h2
          className="mb-4 font-hs text-2xl text-[#26374f]"
          data-tour-id="bg-library-detail-strategies"
        >
          Используется в стратегиях
        </h2>
        {usedStrategyRows.length ? (
          <BattlegroundStrategyList
            rows={usedStrategyRows}
            onOpen={(href, event) => { event.preventDefault(); navigatePath(href); }}
          />
        ) : (
          <div className="rounded-md border border-[#cbd9ed] bg-[#ffffff] p-6 text-center text-[#657893]">
            В текущих мета-сборках эта карта не найдена.
          </div>
        )}
      </section>
      )}

      {showStats && similar.length > 0 && (
        <section className="rounded-lg border border-[#cbd9ed] bg-[#f8fbff] p-4 shadow-sm sm:p-5">
          <h2
            className="mb-4 font-hs text-2xl text-[#26374f]"
            data-tour-id="bg-library-detail-similar"
          >
            Похожие карты
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {similar.map(item => (
              <a key={`${item.dbf}-${item.card_id}`} href={cardPath(item, pool)} onClick={(event) => { event.preventDefault(); navigatePath(cardPath(item, pool)); }} className="rounded-md p-2 text-center transition-transform hover:-translate-y-1" style={{ textDecoration: 'none' }}>
                <img src={primaryCardImage(item) || '/arena-logo-icon.webp?v=arena-legacy-20260629'} alt={cardRuName(item)} className="mx-auto h-40 object-contain drop-shadow-[0_12px_16px_rgba(21,31,47,0.18)]" loading="lazy" onError={hideBrokenImage} />
                <p className="mt-2 line-clamp-2 font-hs text-sm text-[#26374f]">{cardRuName(item)}</p>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function BgLibrary({ currentPath, navigatePath, cacheScope, teaser, heading }: BgLibraryProps) {
  const route = libraryRoute(currentPath);
  if (route.page === 'detail' && route.dbfId) {
    return <DetailPage kind={route.kind} pool={route.pool} dbfId={route.dbfId} navigatePath={navigatePath}
      teaser={teaser?.dbfId === route.dbfId ? teaser : undefined} />;
  }
  return <LibraryListRoute kind={route.kind} pool={route.pool} navigatePath={navigatePath} cacheScope={cacheScope} heading={heading} />;
}

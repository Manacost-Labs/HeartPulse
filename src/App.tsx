/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef, useMemo, memo, useDeferredValue } from 'react';
import { createPortal } from 'react-dom';
import { Trophy, Scroll, RefreshCw, AlertTriangle, X, Search, Star, Home, BookOpen, Menu, ChevronLeft, ChevronRight, ChevronDown, Grid3X3, List, LogIn, Eye, EyeOff, UserCircle, Library, Gift, ShieldCheck, Send, Swords, Image as ImageIcon } from 'lucide-react';
import { getCanonicalRedirectUrl } from './config/domain';
import HomeTab from './features/Home';
import { usePageScrollLock } from './hooks/usePageScrollLock';
import AuthAvatar from './components/AuthAvatar';
import {
  ADMIN_TABS,
  applyPageMeta,
  ARENA_TABS,
  BG_BUILDER_TABS,
  BG_PRIMARY_TABS,
  BG_TAB_IDS,
  isKnownPath,
  isRemovedPagePath,
  MISC_TABS,
  PRIVATE_SUBSCRIPTION_TAB_ENTITLEMENTS,
  STANDARD_TABS,
  tabFromPath,
  TABS,
  TOP_LEVEL_TABS,
  type TabId,
} from './routes';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClassData {
  id: string;
  name: string;
  winrate: number;
  color: string;
  textDark?: boolean;
  games?: number;
}

interface ClassMatchup {
  classAId: string;
  classBId: string;
  winrate: number;
  classA?: string;
  classB?: string;
}

interface ClassMatchupsData {
  matchups: ClassMatchup[];
  updatedAt: string | null;
  source: string;
  warning?: string;
}

type TierlistSource = 'hsreplay' | 'heartharena' | 'firestone';
type LegendarySource = 'hsreplay' | 'firestone';
type TierlistViewMode = 'gallery' | 'table';
const TIERLIST_SOURCES: readonly TierlistSource[] = ['hsreplay', 'heartharena', 'firestone'];
const BG_FALLBACK_ICON = '/arena-logo-icon.webp?v=mana-swirl-20260624';

/** Per-card enrichment data (images, stats) stored globally in tierlist.json */
interface CardLookup {
  cost?: number;
  attack?: number;
  health?: number;
  type?: string;
  imageHa: string;       // HearthArena CDN — Russian
  imageRu: string | null; // Blizzard API    — Russian (premium)
  // Authoritative rarity from cards_ru.json (optional, overrides TierCard.rarity when present)
  rarityDb?: string;
}

/** Minimal card entry inside a tier */
interface TierCard {
  name:     string;
  score:    number;
  rarity:   string;
  cardId:   string;
  classKey: string;   // 'any' = neutral, else class-specific
  source?:  TierlistSource;
  statsContext?: 'tierlist' | 'legendary';
  winrate?: number;   // HSReplay deck winrate (%)
  deckWinrate?: number | null;
  pickRate?: number | null;
  playedWinrate?: number | null;
  inDecks?: number | null;
  totalGames?: number | null;
  arenaScore?: number | null;
  offerRate?: number | null;
  discardRate?: number | null;
  drawnWinrate?: number | null;
  mulliganWinrate?: number | null;
  keptRate?: number | null;
  avgCopies?: number | null;
}

/** One tier inside a class section */
interface TierSection {
  tier:        string;  // S/A/B/C/D/E/F
  label:       string;  // Отлично/Хорошо/…
  description: string;
  cards:       TierCard[];
}

/** One class section (12 total: dk, dh, druid, … neutral) */
interface ClassSection {
  id:         string;
  name:       string;
  color:      string;
  textDark:   boolean;
  classPosition?: string;
  tiers:      TierSection[];
  totalCards: number;
}

/** Merged card for display: TierCard + CardLookup */
interface CardData extends TierCard, Partial<CardLookup> {}

// ─── Class icons (from /public/class_icon/) ───────────────────────────────────

/** Maps tier-list section IDs → icon path */
const CLASS_ICON: Record<string, string> = {
  '__all__':      '/class_icon/all1.png',
  'death-knight': '/class_icon/deathknight.png',
  'demon-hunter': '/class_icon/demonhunter.png',
  druid:          '/class_icon/druid.png',
  hunter:         '/class_icon/hunter.png',
  mage:           '/class_icon/mage.png',
  paladin:        '/class_icon/paladin.png',
  priest:         '/class_icon/priest.png',
  rogue:          '/class_icon/rogue.png',
  shaman:         '/class_icon/shaman.png',
  warlock:        '/class_icon/warlock.png',
  warrior:        '/class_icon/warrior.png',
  any:            '/class_icon/neutral.webp',
};

/** Maps winrate class IDs → icon path (supports both short 'dk' and full 'death-knight' forms) */
const CLASS_ICON_BY_ID: Record<string, string> = {
  dk:             '/class_icon/deathknight.png',
  'death-knight': '/class_icon/deathknight.png',
  dh:             '/class_icon/demonhunter.png',
  'demon-hunter': '/class_icon/demonhunter.png',
  druid:          '/class_icon/druid.png',
  hunter:         '/class_icon/hunter.png',
  mage:           '/class_icon/mage.png',
  paladin:        '/class_icon/paladin.png',
  priest:         '/class_icon/priest.png',
  rogue:          '/class_icon/rogue.png',
  shaman:         '/class_icon/shaman.png',
  warlock:        '/class_icon/warlock.png',
  warrior:        '/class_icon/warrior.png',
};

interface LegendaryCard {
  cardId: string;
  name: string;
  cost?: number;
  type?: string;
  rarity?: string;
  classKey?: string;
  source?: TierlistSource;
  statsContext?: 'tierlist' | 'legendary';
  winrate?: number;
  deckWinrate?: number | null;
  pickRate?: number | null;
  playedWinrate?: number | null;
  inDecks?: number | null;
  arenaScore?: number | null;
  offerRate?: number | null;
  discardRate?: number | null;
  drawnWinrate?: number | null;
  mulliganWinrate?: number | null;
  keptRate?: number | null;
  avgCopies?: number | null;
  totalGames?: number | null;
  count?: number;
  imageHa?: string;
  imageRu?: string | null;
}
interface LegendaryGroup {
  keyCard: LegendaryCard;
  cards: LegendaryCard[];
  winRate: number | null;
  pickRate?: number | null;
  offerRate?: number | null;
  classKey: string;
}
interface LegendariesData {
  groups: LegendaryGroup[];
  updatedAt: string | null;
  source: string;
  warning?: string;
}

interface WinratesData {
  classes: ClassData[];
  updatedAt: string | null;
  source: string;
}

interface TierlistData {
  sections:  ClassSection[];
  cards:     Record<string, CardLookup>;
  classPositions?: Record<string, string>;
  updatedAt: string | null;
  source:    string;
  warning?: string;
}

interface HomeSummaryCard {
  cardId: string;
  name: string;
  score?: number;
  rarity?: string;
  tier?: string;
  classKey?: string;
  cost?: number;
  imageRu?: string | null;
  imageHa?: string;
}

interface HomeSummaryLegendary {
  cardId: string;
  name: string;
  cost?: number;
  imageRu?: string | null;
  imageHa?: string;
  winRate: number | null;
  classKey: string;
}

interface HomeBattlegroundSpotlight {
  dbfId: number;
  name: string;
  image: string;
  tier: string;
  avgPlacement: number;
  pickRate: number | null;
  placementDistribution: number[];
  heroPower?: {
    name?: string;
    text?: string;
    image?: string;
  };
  updatedAt?: string | null;
  source?: string;
}

interface HomeSummaryData {
  topClasses: ClassData[];
  topCards: HomeSummaryCard[];
  topLegendaries: HomeSummaryLegendary[];
  battlegroundSpotlight?: HomeBattlegroundSpotlight | null;
  updatedAt: {
    winrates: string | null;
    tierlist: string | null;
    legendaries: string | null;
    battlegrounds?: string | null;
  };
  sources?: Record<string, string>;
  warning?: string;
}

interface ArenaDeckCard {
  cardId: string;
  name: string;
  cost?: number;
  count: number;
  image: string;
  sourceImage?: string;
}

interface ArenaDeckClass {
  name: string;
  icon: string;
}

interface ArenaDeck {
  id: string;
  rank: number;
  classes: ArenaDeckClass[];
  classNames: string;
  wins: number | null;
  losses: number | null;
  score: string | null;
  player: string;
  cardCount: number;
  sourceUrl: string;
  generateUrl: string;
  finalCards: ArenaDeckCard[];
  legendaryCards: ArenaDeckCard[];
  removedCards: ArenaDeckCard[];
  addedCards: ArenaDeckCard[];
}

interface ArenaDecksData {
  decks: ArenaDeck[];
  totalDecks: number | null;
  filteredDecks?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  activeClass?: string;
  classOptions?: ArenaDeckClass[];
  updatedAt: string | null;
  source: string;
  sourceUrl: string;
  warning?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return 'нет данных';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function latestHomeSummaryUpdatedAt(summary: HomeSummaryData | null): string | null {
  const updatedAt = summary?.updatedAt;
  if (!updatedAt) return null;
  return [updatedAt.winrates, updatedAt.tierlist, updatedAt.legendaries]
    .filter((value): value is string => Boolean(value && Number.isFinite(Date.parse(value))))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
}

function formatDateTimeInput(value: string | null | undefined): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) && !/(Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
    return String(value).slice(0, 16);
  }
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return String(value).slice(0, 16);
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseDateTimeInput(value: string): Date | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    const [, year, month, day, hour, minute, second = '0'] = match;
    const parsed = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    );
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function dateTimeInputToIso(value: string): string {
  if (!value) return '';
  const parsed = parseDateTimeInput(value);
  if (!parsed) return value;
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : value;
}

function isDateTimeInputNear(value: string, offsetMinutes: number): boolean {
  const parsed = parseDateTimeInput(value);
  if (!parsed) return false;
  return Math.abs(parsed.getTime() - (Date.now() + offsetMinutes * 60 * 1000)) < 65 * 1000;
}

function addHoursForDateInput(hours: number): string {
  return formatDateTimeInput(new Date(Date.now() + hours * 60 * 60 * 1000).toISOString());
}

function addMinutesForDateInput(minutes: number): string {
  return formatDateTimeInput(new Date(Date.now() + minutes * 60 * 1000).toISOString());
}

function addDaysForDateInput(days: number): string {
  return addHoursForDateInput(days * 24);
}

function formatPct(value: number | null | undefined, digits = 1): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(digits)}%` : '—';
}

function formatCount(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('ru-RU') : '—';
}

function mergeCard(tc: TierCard, lookup: Record<string, CardLookup>): CardData {
  const lu = lookup[tc.cardId] as any ?? {};
  // rarity in lookup (cards_ru.json) overrides DOM-scraped rarity from HearthArena
  const rarity: string = lu.rarity ?? tc.rarity;
  return { ...tc, ...lu, rarity };
}

// ─── Card image helpers ───────────────────────────────────────────────────────

const CARD_IMAGE_PROXY_VERSION = 'card_img_v2';
const CARD_JSON_IMAGE_VERSION = 'card_art_tooltip_v1';
const hsImgUrl = (cardId: string, size: '256x' | '512x' = '256x', locale: 'ruRU' | 'enUS' = 'ruRU') => {
  if (locale === 'ruRU') {
    const variant = size === '512x' ? 'full' : 'thumb';
    return `/api/card-image/${encodeURIComponent(cardId)}/${variant}.webp?v=${CARD_IMAGE_PROXY_VERSION}`;
  }
  return `https://art.hearthstonejson.com/v1/render/latest/enUS/${size}/${cardId}.png`;
};
const hsJsonRenderUrl = (cardId: string, size: '256x' | '512x' = '256x', locale: 'ruRU' | 'enUS' = 'ruRU') =>
  `https://art.hearthstonejson.com/v1/render/latest/${locale}/${size}/${cardId}.png?v=${CARD_JSON_IMAGE_VERSION}`;
const hsJsonTileUrl = (cardId: string, ext: 'webp' | 'jpg' | 'png' = 'webp') =>
  `https://art.hearthstonejson.com/v1/tiles/${cardId}.${ext}?v=${CARD_JSON_IMAGE_VERSION}`;
const hsJsonArtUrl = (cardId: string, size: '256x' | '512x' = '256x', ext: 'webp' | 'jpg' = 'webp') =>
  `https://art.hearthstonejson.com/v1/${size}/${cardId}.${ext}?v=${CARD_JSON_IMAGE_VERSION}`;

function uniqueSources(sources: Array<string | null | undefined>): string[] {
  return [...new Set(sources.filter(Boolean) as string[])];
}

function currentAppAssetPath(): string | null {
  if (typeof document === 'undefined') return null;
  const script = Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]'))
    .find(el => /\/assets\/index-[^/]+\.js(?:\?|$)/.test(el.src));
  if (!script) return null;
  try {
    return new URL(script.src, window.location.href).pathname;
  } catch {
    return script.getAttribute('src');
  }
}

function appAssetPathFromHtml(html: string): string | null {
  return html.match(/\/assets\/index-[^"']+\.js/)?.[0] ?? null;
}

// ─── Local assets ─────────────────────────────────────────────────────────────
const RARITY_ICON: Record<string, string> = {
  common:    '/assets/common.png',
  rare:      '/assets/rare.png',
  epic:      '/assets/epic.png',
  legendary: '/assets/legendary.png',
};
const MANA_ICON    = '/assets/mana.png';
const ARENA_ICON   = '/assets/arena_icon.webp';

const TIER_COLORS: Record<string, string> = {
  S: 'bg-gradient-to-br from-[#e63946] to-[#780000] text-[#fff0f0] border-[#ff9999]',
  A: 'bg-gradient-to-br from-[#f4a261] to-[#b34700] text-[#fff9f0] border-[#ffd699]',
  B: 'bg-gradient-to-br from-[#9b5de5] to-[#4a0080] text-[#f4f0ff] border-[#d9b3ff]',
  C: 'bg-gradient-to-br from-[#2a9d8f] to-[#004d40] text-[#e0f2f1] border-[#80cbc4]',
  D: 'bg-gradient-to-br from-[#457b9d] to-[#1d3557] text-[#e0f0ff] border-[#90c0e0]',
  E: 'bg-gradient-to-br from-[#92400e] to-[#451a03] text-[#fef3c7] border-[#d97706]',
  F: 'bg-gradient-to-br from-[#6b6b6b] to-[#2c2c2c] text-[#e0e0e0] border-[#aaaaaa]',
  U: 'bg-gradient-to-br from-[#8b7355] to-[#4a3724] text-[#fff4d6] border-[#c4a46a]',
};

// ─── Fallback data ────────────────────────────────────────────────────────────

const FALLBACK_CLASSES: ClassData[] = [
  { id: 'dk',      name: 'Рыцарь смерти',     winrate: 56.2, color: '#1f252d' },
  { id: 'paladin', name: 'Паладин',            winrate: 54.8, color: '#a88a45' },
  { id: 'shaman',  name: 'Шаман',              winrate: 53.1, color: '#2a2e6b' },
  { id: 'hunter',  name: 'Охотник',            winrate: 51.5, color: '#1d5921' },
  { id: 'mage',    name: 'Маг',                winrate: 50.2, color: '#2b5c85' },
  { id: 'rogue',   name: 'Разбойник',          winrate: 49.8, color: '#333333' },
  { id: 'warlock', name: 'Чернокнижник',       winrate: 48.5, color: '#5c265c' },
  { id: 'druid',   name: 'Друид',              winrate: 47.2, color: '#704a16' },
  { id: 'warrior', name: 'Воин',               winrate: 46.1, color: '#7a1e1e' },
  { id: 'priest',  name: 'Жрец',               winrate: 44.5, color: '#d1d1d1', textDark: true },
  { id: 'dh',      name: 'Охотник на демонов', winrate: 43.2, color: '#224722' },
];

// ─── Fullscreen card modal ────────────────────────────────────────────────────

const RARITY_LABEL: Record<string, string> = {
  common: 'Обычная', rare: 'Редкая', epic: 'Эпическая', legendary: 'Легендарная', free: 'Базовая',
};
const TYPE_LABEL: Record<string, string> = {
  minion: 'Существо', spell: 'Заклинание', weapon: 'Оружие', hero: 'Герой', location: 'Локация',
};
const TIERLIST_SOURCE_LABEL: Record<TierlistSource, string> = {
  hsreplay: 'HSReplay',
  heartharena: 'HearthArena',
  firestone: 'Firestone',
};
const LEGENDARY_SOURCE_LABEL: Record<LegendarySource, string> = {
  hsreplay: 'HSReplay',
  firestone: 'Firestone',
};
const SOURCE_LOGO: Record<TierlistSource, string> = {
  hsreplay: '/source-logos/hsreplay.png?v=source_logos_v2',
  heartharena: '/source-logos/heartharena.webp?v=keeper_v2',
  firestone: '/source-logos/firestone.png?v=source_logos_v2',
};

const SourceToggleButton: React.FC<{
  source: TierlistSource;
  label: string;
  active: boolean;
  busy: boolean;
  onClick: () => void;
}> = ({ source, label, active, busy, onClick }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={busy && !active}
      aria-pressed={active}
      data-active={active ? 'true' : 'false'}
      data-busy={busy ? 'true' : 'false'}
      title={label}
      className="source-toggle-button min-h-[34px] px-2.5 py-1.5 rounded-lg text-xs font-hs transition-all flex items-center justify-center gap-1.5"
    >
      {active && busy && (
        <RefreshCw size={10} style={{ animation: 'spin 0.8s linear infinite' }} />
      )}
      <span
        className="source-toggle-icon flex items-center justify-center rounded-md overflow-hidden"
      >
        <img
          src={SOURCE_LOGO[source]}
          alt=""
          aria-hidden="true"
          className="max-w-full max-h-full object-contain"
          draggable={false}
        />
      </span>
      <span className="source-toggle-label">{label}</span>
    </button>
);

const CardModal: React.FC<{ card: CardData; tier: string; onClose: () => void }> = ({ card, tier, onClose }) => {
  const [visible, setVisible] = useState(false);
  const [srcIdx, setSrcIdx] = useState(0);
  // Track touch start position to distinguish tap vs scroll
  const touchOrigin = useRef<{ x: number; y: number } | null>(null);

  const modalSources = useMemo(() => uniqueSources([
    card.cardId ? hsImgUrl(card.cardId, '512x') : null,
    card.imageRu,
    card.imageHa,
    card.cardId ? hsImgUrl(card.cardId, '512x', 'enUS') : null,
  ]), [card.cardId, card.imageHa, card.imageRu]);
  const bigSrc = modalSources[srcIdx] ?? null;

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  useEffect(() => setSrcIdx(0), [card.cardId]);

  const sourceLabel = card.source ? TIERLIST_SOURCE_LABEL[card.source] : 'Manacost';
  const deckWinrate = card.deckWinrate ?? card.winrate;
  const primaryWinrateLabel = card.statsContext === 'legendary' ? 'Винрейт группы' : 'Винрейт колоды';
  const statRows = [
    { label: primaryWinrateLabel, value: formatPct(deckWinrate), raw: deckWinrate, type: 'pct' as const },
    { label: 'При взятии', value: formatPct(card.drawnWinrate), raw: card.drawnWinrate, type: 'pct' as const },
    { label: 'При розыгрыше', value: formatPct(card.playedWinrate), raw: card.playedWinrate, type: 'pct' as const },
    { label: 'В % заходов', value: formatPct(card.inDecks), raw: card.inDecks, type: 'pct' as const },
    { label: 'Копий в колоде', value: typeof card.avgCopies === 'number' ? card.avgCopies.toFixed(card.avgCopies % 1 === 0 ? 0 : 1) : '—', raw: card.avgCopies, type: 'score' as const },
    { label: 'Партии', value: formatCount(card.totalGames), raw: null, type: 'score' as const },
    { label: 'ArenaSmith', value: typeof card.arenaScore === 'number' ? card.arenaScore.toFixed(0) : '—', raw: card.arenaScore, type: 'score' as const },
    { label: 'Pick Rate', value: formatPct(card.pickRate), raw: card.pickRate, type: 'pct' as const },
    { label: 'Частота выбора', value: formatPct(card.offerRate), raw: card.offerRate, type: 'pct' as const },
  ].filter(row => row.value !== '—');
  const hasStats = statRows.length > 0;

  // Rendered via portal — completely outside app stacking context
  return createPortal(
    <div
      className="card-modal-lightbox"
      style={{
        position: 'fixed', inset: 0,
        zIndex: 99999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.22s ease',
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
      /* Desktop: click backdrop → close */
      onClick={onClose}
      /* Mobile: record touch start, close only if finger barely moved (tap, not scroll) */
      onTouchStart={e => {
        const t = e.touches[0];
        touchOrigin.current = { x: t.clientX, y: t.clientY };
      }}
      onTouchEnd={e => {
        if (!touchOrigin.current) return;
        const t = e.changedTouches[0];
        const moved = Math.hypot(
          t.clientX - touchOrigin.current.x,
          t.clientY - touchOrigin.current.y,
        );
        touchOrigin.current = null;
        if (moved < 12) { e.preventDefault(); onClose(); }
      }}
    >
      {/* Backdrop */}
      <div className="card-modal-backdrop" style={{
        position: 'absolute', inset: 0,
        background: 'rgba(0,0,0,0.87)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }} />

      {/* Card container — stops propagation so tapping/scrolling card doesn't close modal */}
      <div
        className="card-modal-shell"
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'grid',
          gridTemplateColumns: 'minmax(230px, 360px) minmax(280px, 380px)',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '28px',
          maxWidth: '940px', width: '100%',
          maxHeight: '90dvh',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          transform: visible ? 'scale(1) translateY(0)' : 'scale(0.72) translateY(40px)',
          transition: 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
        onClick={e => e.stopPropagation()}
        onTouchStart={e => e.stopPropagation()}
        onTouchEnd={e => e.stopPropagation()}
      >
        {bigSrc ? (
          <img src={bigSrc} alt={card.name} onError={() => setSrcIdx(i => i + 1)}
            width={360}
            height={548}
            decoding="async"
            className="card-modal-image"
            style={{ width: '100%', maxWidth: '360px', height: 'auto', filter: 'drop-shadow(0 24px 60px rgba(0,0,0,0.95))' }}
            draggable={false} />
        ) : (
          <div style={{
            width: '256px', height: '384px', background: '#2c1e16', borderRadius: '16px',
            border: '2px solid #a88a45', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ color: '#fcd34d', fontFamily: 'var(--font-hs)', fontSize: '18px', textAlign: 'center', padding: '16px' }}>{card.name}</span>
          </div>
        )}

        <aside className="card-modal-stats" aria-label={`Статистика карты ${card.name}`}>
          <div className="card-modal-header flex items-start justify-between gap-3 border-b border-[#d8b75e]/25 pb-3">
            <div className="min-w-0">
              <p className="card-modal-source text-[10px] font-black uppercase tracking-wide text-[#c4a46a]">{sourceLabel}</p>
              <h2 className="card-modal-title mt-1 font-hs text-xl leading-tight text-[#fcd34d]">{card.name}</h2>
            </div>
            <div className={`card-modal-tier flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border-2 font-hs text-xl shadow-lg ${TIER_COLORS[tier] || TIER_COLORS.C}`}>
              {tier}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {card.rarity && RARITY_ICON[card.rarity] && (
              <span className="card-modal-chip">
                <img src={RARITY_ICON[card.rarity]} alt="" aria-hidden="true" className="h-5 w-5 object-contain" />
                {RARITY_LABEL[card.rarity] || card.rarity}
              </span>
            )}
            {card.type && (
              <span className="card-modal-chip">{TYPE_LABEL[card.type] || card.type}</span>
            )}
            {card.cost !== undefined && (
              <span className="card-modal-chip card-modal-chip--mana">
                <img src={MANA_ICON} alt="" aria-hidden="true" className="h-5 w-5 object-contain" />
                {card.cost}
              </span>
            )}
          </div>

          {hasStats ? (
            <dl className="mt-4 grid grid-cols-1 gap-2">
              {statRows.map(row => (
                <div key={row.label} className="card-modal-stat-row">
                  <dt className="text-[11px] font-bold uppercase leading-tight text-[#d9c08a]">{row.label}</dt>
                  <dd className={`text-right text-sm font-black leading-none ${row.raw === null ? 'text-[#fff3cf]' : metricTone(row.raw, row.type)}`}>
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className="mt-4 rounded-xl border border-[#c4a46a]/30 bg-[#2c1e16]/70 px-3 py-3 text-sm text-[#d9c08a]">
              Подробная статистика для этой карты пока недоступна.
            </div>
          )}
        </aside>
      </div>

      {/* Close button */}
      <button
        style={{
          position: 'absolute', top: '16px', right: '16px', zIndex: 2,
          width: '44px', height: '44px', borderRadius: '50%',
          background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'rgba(255,255,255,0.75)', cursor: 'pointer', transition: 'all 0.2s',
          touchAction: 'manipulation',
        }}
        onClick={e => { e.stopPropagation(); onClose(); }}
        aria-label="Закрыть"
      >
        <X size={20} />
      </button>
    </div>,
    document.body,
  );
};

// ─── HSCard ───────────────────────────────────────────────────────────────────

type CardTooltipPosition = {
  left: number;
  top: number;
  placement: 'top' | 'bottom' | 'left' | 'right';
};

const CARD_TOOLTIP_WIDTH = 340;
const CARD_TOOLTIP_ESTIMATED_HEIGHT = 220;

function getCardStatsTooltipPosition(el: HTMLElement): CardTooltipPosition {
  const rect = el.getBoundingClientRect();
  const edge = 12;
  const gap = 12;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const width = Math.min(CARD_TOOLTIP_WIDTH, viewportWidth - edge * 2);
  const height = Math.min(CARD_TOOLTIP_ESTIMATED_HEIGHT, viewportHeight - edge * 2);
  const sideTop = clampNumber(rect.top + rect.height / 2 - height / 2, edge, viewportHeight - height - edge);

  if (rect.right + gap + width <= viewportWidth - edge) {
    return { left: rect.right + gap, top: sideTop, placement: 'right' };
  }

  if (rect.left - gap - width >= edge) {
    return { left: rect.left - gap - width, top: sideTop, placement: 'left' };
  }

  const halfWidth = width / 2;
  const left = Math.min(viewportWidth - halfWidth - edge, Math.max(halfWidth + edge, rect.left + rect.width / 2));
  const hasRoomBelow = rect.bottom + gap + height < viewportHeight - edge;

  return {
    left,
    top: hasRoomBelow ? rect.bottom + gap : rect.top - gap,
    placement: hasRoomBelow ? 'bottom' : 'top',
  };
}

const CardStatsTooltip: React.FC<{ card: CardData; position: CardTooltipPosition }> = ({ card, position }) => {
  const rows = [
    ['Винрейт колоды с этой картой', formatPct(card.deckWinrate ?? card.winrate)],
    ['Взятие', formatPct(card.pickRate)],
    ['Винрейт при разыгрывании', formatPct(card.playedWinrate)],
    ['В % колод', formatPct(card.inDecks)],
    ['Всего партий', formatCount(card.totalGames)],
    ['ArenaSmith очко', typeof card.arenaScore === 'number' ? card.arenaScore.toFixed(0) : '—'],
    ['Частота выбора', formatPct(card.offerRate)],
  ];

  return createPortal(
    <div
      className="card-stats-tooltip pointer-events-none"
      style={{
        position: 'fixed',
        left: position.left,
        top: position.top,
        width: CARD_TOOLTIP_WIDTH,
        maxWidth: 'calc(100vw - 24px)',
        transform: position.placement === 'top'
          ? 'translate(-50%, -100%)'
          : position.placement === 'bottom'
            ? 'translate(-50%, 0)'
            : 'none',
        zIndex: 2147483000,
      }}
    >
      <div className="card-stats-tooltip-header">
        <span className="card-stats-tooltip-title font-hs">{card.name}</span>
        {card.source && <span className="card-stats-tooltip-source">{TIERLIST_SOURCE_LABEL[card.source]}</span>}
      </div>
      <div className="card-stats-tooltip-rows">
        {rows.map(([label, value]) => (
          <div key={label} className="card-stats-tooltip-row">
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
};

type HSCardProps = {
  card: CardData;
  onClick: () => void;
  previewEnabled?: boolean;
  onPreviewStart?: (card: CardData, anchor: HTMLElement) => void;
  onPreviewEnd?: () => void;
};

const HSCard: React.FC<HSCardProps> = memo(({ card, onClick, previewEnabled = false, onPreviewStart, onPreviewEnd }) => {
  // Multi-step fallback: Russian render first, then source image, then English as last resort.
  const sources = useMemo(() => uniqueSources([
    card.imageRu  || null,
    card.imageHa  || null,
    card.cardId   ? hsImgUrl(card.cardId) : null,
    card.cardId   ? hsImgUrl(card.cardId, '256x', 'enUS') : null,
  ]), [card.cardId, card.imageHa, card.imageRu]);

  const [srcIdx, setSrcIdx] = useState(0);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const thumbSrc = sources[srcIdx] ?? null;
  const handleErr = useCallback(() => setSrcIdx(i => i + 1), []);
  const showPreview = useCallback(() => {
    if (!previewEnabled) return;
    const el = cardRef.current;
    if (!el) return;
    onPreviewStart?.(card, el);
  }, [card, onPreviewStart, previewEnabled]);
  const hidePreview = useCallback(() => onPreviewEnd?.(), [onPreviewEnd]);
  const handleClick = useCallback(() => {
    hidePreview();
    onClick();
  }, [hidePreview, onClick]);

  useEffect(() => setSrcIdx(0), [sources]);

  if (thumbSrc) {
    return (
      <div
        ref={cardRef}
        className="hs-tier-card relative z-0 flex-shrink-0 group cursor-pointer hover:z-[9999] focus-within:z-[9999]"
        onClick={handleClick}
        onMouseEnter={showPreview}
        onMouseMove={showPreview}
        onMouseLeave={hidePreview}
        onFocus={showPreview}
        onBlur={hidePreview}
        aria-label={card.name}
        tabIndex={0}
      >
        <div className="hs-tier-card-inner transform transition-all duration-200 group-hover:scale-110 group-hover:z-10">
          <img src={thumbSrc} alt={card.name} loading="lazy" decoding="async" width={180} height={274}
            onError={handleErr}
            className="w-28 sm:w-32 md:w-36 h-auto" />
        </div>
      </div>
    );
  }

  // Fallback styled card
  const rarityIconSrc = RARITY_ICON[card.rarity] ?? null;
  return (
    <div
      ref={cardRef}
      className="hs-tier-card relative z-0 flex-shrink-0 group cursor-pointer hover:z-[9999] focus-within:z-[9999]"
      onClick={handleClick}
      onMouseEnter={showPreview}
      onMouseMove={showPreview}
      onMouseLeave={hidePreview}
      onFocus={showPreview}
      onBlur={hidePreview}
      aria-label={card.name}
      tabIndex={0}
    >
      <div className="hs-tier-card-inner relative w-28 h-40 sm:w-32 sm:h-48 md:w-36 md:h-52 rounded-xl flex flex-col items-center justify-center text-center transform transition-transform group-hover:scale-105 group-hover:z-10 overflow-hidden border-2 border-[#1a110a] bg-[#2c1e16]">
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/40 to-black/90" />
        {/* Mana cost */}
        {card.cost !== undefined && (
          <div className="absolute top-1.5 left-1.5 z-20" style={{ width: '22px', height: '22px', position: 'relative' }}>
            <img src={MANA_ICON} alt="мана" className="w-full h-full object-contain" />
            <span className="absolute inset-0 flex items-center justify-center text-white font-bold text-[11px] drop-shadow-[0_1px_2px_rgba(0,0,0,1)]">{card.cost}</span>
          </div>
        )}
        {/* Rarity gem */}
        {rarityIconSrc && (
          <div className="absolute top-[48%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
            <img src={rarityIconSrc} alt={card.rarity} className="w-5 h-5 sm:w-6 sm:h-6 object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" />
          </div>
        )}
        <div className="z-10 mt-auto mb-2 w-[112%] -ml-[6%] bg-gradient-to-b from-[#4a3018] to-[#2c1e16] border-y-2 border-[#a88a45] py-1 px-1">
          <span className="font-hs text-[#fcd34d] text-[9px] sm:text-[11px] leading-tight block text-center truncate">{card.name}</span>
        </div>
      </div>
    </div>
  );
}) as React.FC<HSCardProps>;

// ─── Skeleton / misc ──────────────────────────────────────────────────────────

const Skeleton: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className = '', style }) => (
  <div className={`skeleton ${className}`} style={style} />
);

const UpdateBadge: React.FC<{ updatedAt: string | null }> =
  ({ updatedAt }) => {
    // Warn when data hasn't been updated in >24 hours
    const isStale = updatedAt
      ? (Date.now() - new Date(updatedAt).getTime()) > 24 * 60 * 60 * 1000
      : false;

    return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Staleness warning */}
      {isStale && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
          style={{
            background: 'linear-gradient(135deg,#7a1e1e,#4a0a0a)',
            border: '1.5px solid #dc2626',
            color: '#fca5a5',
            boxShadow: '0 2px 6px rgba(220,38,38,0.3)',
          }}>
          <AlertTriangle size={11} />
          <span>Данные устарели</span>
        </div>
      )}
      {/* Timestamp pill */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs"
        style={{
          background: 'linear-gradient(135deg,#3a2210,#2c1e16)',
          border: `1.5px solid ${isStale ? '#dc2626' : '#6b4c2a'}`,
          color: '#e8d5a5',
          boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
        }}>
        <RefreshCw size={11} className="text-[#a88a45]" />
        <span className="font-medium">
          {updatedAt ? formatDate(updatedAt) : 'Загружается…'}
        </span>
      </div>
	    </div>
	  );
};

// ─── Winrates tab ─────────────────────────────────────────────────────────────



// ─── Class tabs ───────────────────────────────────────────────────────────────

const ClassTabs: React.FC<{
  sections: ClassSection[];
  activeId: string;
  onChange: (id: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}> = memo(({ sections, activeId, onChange, searchQuery, onSearchChange }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current?.querySelector(`[data-id="${activeId}"]`) as HTMLElement | null;
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeId]);

  return (
    <div
      className="tierlist-class-tabs dashboard-filter-shell flex items-center gap-2 sm:gap-3 px-3 py-2.5 rounded-2xl overflow-x-auto scrollbar-hs"
      role="group"
      aria-label="Фильтр по классу"
    >
      {/* Icon buttons */}
      <div ref={scrollRef} className="tierlist-class-scroll flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
        {/* "All cards" virtual tab */}
        {(() => {
          const isActive = activeId === ALL_CARDS_ID;
          return (
            <button
              type="button"
              key={ALL_CARDS_ID}
              data-id={ALL_CARDS_ID}
              data-active={isActive ? 'true' : 'false'}
              onClick={() => onChange(ALL_CARDS_ID)}
              title="Все карты"
              aria-label="Все карты"
              aria-pressed={isActive}
              className="tierlist-class-button flex-shrink-0 relative transition-all duration-200"
            >
              <div className="tierlist-class-icon w-9 h-9 sm:w-10 sm:h-10 rounded-full overflow-hidden flex items-center justify-center">
                <img src="/class_icon/all1.png" alt="" aria-hidden="true" className="w-7 h-7 sm:w-8 sm:h-8 object-contain" draggable={false} />
              </div>
              {isActive && (
                <div className="tierlist-class-active-dot absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full" />
              )}
            </button>
          );
        })()}
        {sections.map(sec => {
          const isActive = sec.id === activeId;
          const iconSrc  = CLASS_ICON[sec.id];

          return (
            <button
              type="button"
              key={sec.id}
              data-id={sec.id}
              data-active={isActive ? 'true' : 'false'}
              onClick={() => onChange(sec.id)}
              title={sec.name}
              aria-label={sec.name}
              aria-pressed={isActive}
              className="tierlist-class-button flex-shrink-0 relative transition-all duration-200"
            >
              <div
                className="tierlist-class-icon w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center overflow-hidden"
                style={{
                  background: `radial-gradient(circle at 35% 35%, ${sec.color}ff, ${sec.color}aa)`,
                }}
              >
                {iconSrc ? (
                  <img
                    src={iconSrc}
                    alt=""
                    aria-hidden="true"
                    className="w-7 h-7 sm:w-8 sm:h-8 object-contain"
                    draggable={false}
                  />
                ) : (
                  <span className="text-white/80 text-sm font-hs">⚔</span>
                )}
              </div>
              {isActive && (
                <div className="tierlist-class-active-dot absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full" />
              )}
              {sec.classPosition && (
                <div
                  className="tierlist-class-position absolute -top-2 -right-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none"
                >
                  {sec.classPosition}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Divider */}
      <div className="tierlist-class-divider w-px h-7 flex-shrink-0 bg-[#c4a46a]/50 mx-1" />

      {/* Search */}
      <div className="tierlist-class-search relative flex-grow min-w-[140px]">
        <Search size={13} className="tierlist-class-search-icon absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          aria-label="Поиск карты"
          placeholder="Поиск: Йогг-Сарон, Рагнарос..."
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          className="w-full bg-transparent pl-8 pr-3 py-1.5 text-sm outline-none"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            aria-label="Очистить поиск"
            className="tierlist-class-search-clear absolute right-2 top-1/2 -translate-y-1/2 transition-colors"
          >
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  );
}) as React.FC<{ sections: ClassSection[]; activeId: string; onChange: (id: string) => void; searchQuery: string; onSearchChange: (q: string) => void }>;

// ─── TierList tab ─────────────────────────────────────────────────────────────

// Kept outside the function — these never change and would be recreated every render
const TIER_LABEL_FULL: Record<string, string> = {
  S: 'Отлично',
  A: 'Хорошо',
  B: 'Выше среднего',
  C: 'Средне',
  D: 'Ниже среднего',
  E: 'Плохо',
  F: 'Ужасно',
  U: 'Без тира',
};

const TIER_DESC_MAP: Record<string, string> = {
  S: 'Авто-пик — доминирующие карты текущего метагейма.',
  A: 'Отличные карты, очень сильны в большинстве ситуаций.',
  B: 'Выше среднего — хороший выбор для стабильной колоды.',
  C: 'Средние карты, полезны при нехватке лучших вариантов.',
  D: 'Ниже среднего — берите только если нет лучших карт.',
  E: 'Плохие карты — последний выбор.',
  F: 'Ужасные карты — никогда не стоит брать.',
  U: 'Карты без Arenasmith Score в текущем срезе HSReplay.',
};

const RARITY_OPTIONS = [
  { id: 'all',       name: 'Все',        icon: null },
  { id: 'common',    name: 'Обычная',    icon: '/assets/common.png' },
  { id: 'rare',      name: 'Редкая',     icon: '/assets/rare.png' },
  { id: 'epic',      name: 'Эпическая',  icon: '/assets/epic.png' },
  { id: 'legendary', name: 'Легендарная',icon: '/assets/legendary.png' },
];

type ManaFilterValue = 'all' | number;

const MANA_FILTER_OPTIONS: Array<{ id: ManaFilterValue; name: string; label: string }> = [
  { id: 'all', name: 'Все стоимости', label: 'Все' },
  ...Array.from({ length: 11 }, (_, cost) => ({
    id: cost,
    name: cost === 10 ? '10+ маны' : `${cost} маны`,
    label: cost === 10 ? '10+' : String(cost),
  })),
];

const ALL_CARDS_ID = '__all__';
const INITIAL_TIERLIST_CARDS_MOBILE = 36;
const INITIAL_TIERLIST_CARDS_DESKTOP = 180;
const TIERLIST_CARDS_STEP_MOBILE = 36;
const TIERLIST_CARDS_STEP_DESKTOP = 180;

const TABLE_METRIC_COLUMNS = [
  { key: 'deckWinrate', label: 'Винрейт колоды', hint: 'Winrate of decks including the card.' },
  { key: 'drawnWinrate', label: 'При взятии', hint: 'Winrate when the card was drawn.' },
  { key: 'playedWinrate', label: 'При розыгрыше', hint: 'Winrate when the card was played.' },
  { key: 'inDecks', label: 'В % заходов', hint: 'Percentage of runs/decks including the card.' },
  { key: 'avgCopies', label: 'Копий', hint: 'Average copies in deck.' },
  { key: 'totalGames', label: 'Партий', hint: 'Total games with this card.' },
  { key: 'arenaScore', label: 'ArenaSmith', hint: 'Static card power score.' },
  { key: 'pickRate', label: 'Pick Rate', hint: 'How often the card is picked.' },
  { key: 'offerRate', label: 'Частота выбора', hint: 'How often the card is offered/selected.' },
] as const;

function metricTone(value: number | null | undefined, type: 'pct' | 'score' = 'pct'): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'text-[#8b6c42]';
  if (type === 'score') {
    if (value >= 80) return 'text-emerald-700';
    if (value >= 50) return 'text-lime-700';
    if (value >= 30) return 'text-amber-700';
    return 'text-orange-700';
  }
  if (value >= 57) return 'text-emerald-700';
  if (value >= 52) return 'text-green-700';
  if (value >= 49) return 'text-amber-700';
  return 'text-orange-700';
}

function tableMetricValue(card: CardData, key: typeof TABLE_METRIC_COLUMNS[number]['key']): string {
  if (key === 'deckWinrate') return formatPct(card.deckWinrate ?? card.winrate);
  if (key === 'totalGames') return formatCount(card.totalGames);
  if (key === 'arenaScore') return typeof card.arenaScore === 'number' ? card.arenaScore.toFixed(0) : '—';
  if (key === 'avgCopies') return typeof card.avgCopies === 'number' ? card.avgCopies.toFixed(card.avgCopies % 1 === 0 ? 0 : 1) : '—';
  return formatPct(card[key]);
}

const MOBILE_TABLE_METRIC_KEYS: Array<typeof TABLE_METRIC_COLUMNS[number]['key']> = [
  'deckWinrate',
  'drawnWinrate',
  'playedWinrate',
  'inDecks',
  'avgCopies',
  'totalGames',
  'arenaScore',
  'pickRate',
  'offerRate',
];

function useSmallViewport(): boolean {
  const [small, setSmall] = useState(() => (
    typeof window !== 'undefined'
      ? window.matchMedia('(max-width: 639px)').matches
      : false
  ));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(max-width: 639px)');
    const update = () => setSmall(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return small;
}

function useFineHoverPointer(): boolean {
  const getFineHover = () => {
    if (typeof window === 'undefined') return false;
    const mediaMatches = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    return mediaMatches || navigator.maxTouchPoints === 0;
  };

  const [fineHover, setFineHover] = useState(() => (
    getFineHover()
  ));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(hover: hover) and (pointer: fine)');
    const update = () => setFineHover(getFineHover());
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return fineHover;
}

type CardRenderTooltipPosition = {
  left: number;
  top: number;
};

const CARD_RENDER_TOOLTIP_WIDTH = 224;
const CARD_RENDER_TOOLTIP_HEIGHT = 336;

function clampNumber(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

function getCardRenderTooltipPosition(el: HTMLElement): CardRenderTooltipPosition {
  const rect = el.getBoundingClientRect();
  const edge = 10;
  const gap = 12;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const width = Math.min(CARD_RENDER_TOOLTIP_WIDTH, viewportWidth - edge * 2);
  const height = Math.min(CARD_RENDER_TOOLTIP_HEIGHT, viewportHeight - edge * 2);
  const centeredTop = clampNumber(rect.top + rect.height / 2 - height / 2, edge, viewportHeight - height - edge);

  if (rect.right + gap + width <= viewportWidth - edge) {
    return { left: rect.right + gap, top: centeredTop };
  }

  if (rect.left - gap - width >= edge) {
    return { left: rect.left - gap - width, top: centeredTop };
  }

  const centeredLeft = clampNumber(rect.left + rect.width / 2 - width / 2, edge, viewportWidth - width - edge);
  const belowTop = rect.bottom + gap;
  const aboveTop = rect.top - gap - height;

  return {
    left: centeredLeft,
    top: belowTop + height <= viewportHeight - edge ? belowTop : clampNumber(aboveTop, edge, viewportHeight - height - edge),
  };
}

const CardRenderTooltip: React.FC<{ card: CardData; position: CardRenderTooltipPosition }> = ({ card, position }) => {
  const sources = useMemo(() => uniqueSources([
    card.cardId ? hsJsonRenderUrl(card.cardId, '256x', 'ruRU') : null,
    card.cardId ? hsImgUrl(card.cardId, '512x') : null,
    card.cardId ? hsJsonRenderUrl(card.cardId, '256x', 'enUS') : null,
    card.imageRu || null,
    card.imageHa || null,
  ]), [card.cardId, card.imageHa, card.imageRu]);
  const [srcIdx, setSrcIdx] = useState(0);
  const src = sources[srcIdx] ?? null;

  useEffect(() => setSrcIdx(0), [card.cardId]);

  if (!src) return null;

  return createPortal(
    <div
      className="pointer-events-none rounded-xl"
      style={{
        position: 'fixed',
        left: position.left,
        top: position.top,
        width: CARD_RENDER_TOOLTIP_WIDTH,
        maxWidth: 'calc(100vw - 20px)',
        zIndex: 2147483000,
        filter: 'drop-shadow(0 18px 38px rgba(0,0,0,0.78))',
      }}
    >
      <img
        src={src}
        alt={card.name}
        width={224}
        height={336}
        decoding="async"
        loading="eager"
        onError={() => setSrcIdx(i => i + 1)}
        className="h-auto w-full rounded-xl"
        style={{
          border: '1px solid rgba(252,211,77,0.35)',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.55)',
        }}
        draggable={false}
      />
    </div>,
    document.body,
  );
};

const HSREPLAY_TILE_RARITIES = new Set(['free', 'common', 'rare', 'epic', 'legendary']);

function normalizeHsReplayTileRarity(rarity?: string): string {
  const normalized = String(rarity || 'common').toLowerCase();
  return HSREPLAY_TILE_RARITIES.has(normalized) ? normalized : 'common';
}

function formatHsReplayTileCost(cost?: number): string {
  if (typeof cost !== 'number' || !Number.isFinite(cost)) return '0';
  return String(Math.max(0, Math.min(10, Math.trunc(cost))));
}

const HSTableCardThumb: React.FC<{
  card: CardData;
  onClick: () => void;
  onPreviewStart: (card: CardData, anchor: HTMLElement) => void;
  onPreviewEnd: () => void;
}> = memo(({ card, onClick, onPreviewStart, onPreviewEnd }) => {
  const sources = useMemo(() => uniqueSources([
    card.cardId ? hsJsonTileUrl(card.cardId) : null,
    card.cardId ? hsJsonTileUrl(card.cardId, 'jpg') : null,
    card.cardId ? hsJsonArtUrl(card.cardId) : null,
    card.imageRu || null,
    card.imageHa || null,
  ]), [card.cardId, card.imageHa, card.imageRu]);
  const [srcIdx, setSrcIdx] = useState(0);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const src = sources[srcIdx] ?? null;
  const rarity = normalizeHsReplayTileRarity(card.rarity);
  const isLegendary = rarity === 'legendary';
  const showPreview = useCallback(() => {
    const el = buttonRef.current;
    if (!el) return;
    onPreviewStart(card, el);
  }, [card, onPreviewStart]);
  const handleClick = useCallback(() => {
    onPreviewEnd();
    onClick();
  }, [onClick, onPreviewEnd]);

  useEffect(() => setSrcIdx(0), [sources]);

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={handleClick}
      onMouseEnter={showPreview}
      onMouseMove={showPreview}
      onMouseLeave={onPreviewEnd}
      onFocus={showPreview}
      onBlur={onPreviewEnd}
      className="hsrdv hsrdv-table-card group text-left"
      aria-label={`Открыть карту ${card.name}`}
      title={card.name}
    >
      <div className="hsrdv-card-tile" data-card-id={card.cardId}>
        <div className={`hsrdv-card-gem hsrdv-rarity-${rarity}`}>
          <span className="hsrdv-card-cost">{formatHsReplayTileCost(card.cost)}</span>
        </div>
        <div className={`hsrdv-card-frame ${isLegendary ? 'hsrdv-card-frame--with-count' : 'hsrdv-card-frame--without-count'}`}>
          {src ? (
            <img
              src={src}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => setSrcIdx(i => i + 1)}
              className="hsrdv-card-art"
            />
          ) : (
            <span className="hsrdv-card-art hsrdv-card-art--fallback">HS</span>
          )}
          {isLegendary && (
            <div className="hsrdv-card-countbox" aria-hidden="true">
              <span className="hsrdv-card-count">★</span>
            </div>
          )}
          <span className="hsrdv-card-fade" aria-hidden="true" />
          <span className="hsrdv-card-name">{card.name}</span>
        </div>
      </div>
    </button>
  );
}) as React.FC<{
  card: CardData;
  onClick: () => void;
  onPreviewStart: (card: CardData, anchor: HTMLElement) => void;
  onPreviewEnd: () => void;
}>;



// ─── Legendaries tab ──────────────────────────────────────────────────────────

function winRateBadgeColor(wr: number | null | undefined): string {
  if (!wr) return '#6b7280';
  if (wr >= 60) return '#16a34a';
  if (wr >= 50) return '#2563eb';
  return '#dc2626';
}

const LegendaryCardThumb: React.FC<{
  card: LegendaryCard;
  size: 'lg' | 'sm';
  onClick: () => void;
}> = memo(({ card, size, onClick }) => {
  // Fallback chain: Russian render first, then source image, then English as last resort.
  const sources = uniqueSources([
    card.imageRu || null,
    card.imageHa || null,
    card.cardId  ? hsImgUrl(card.cardId) : null,
    card.cardId  ? hsImgUrl(card.cardId, '256x', 'enUS') : null,
  ]);

  const [srcIdx, setSrcIdx] = useState(0);
  const src = sources[srcIdx] ?? null;
  const wClass = size === 'lg' ? 'w-36' : 'w-20';

  if (src) {
    return (
      <div
        className={`${wClass} flex-shrink-0 cursor-pointer group`}
        onClick={onClick}
        title={card.name}
      >
        <div className="legendary-card-thumb transform transition-all duration-200 group-hover:scale-110">
          <img
            src={src}
            alt={card.name}
            loading="lazy"
            decoding="async"
            width={size === 'lg' ? 180 : 120}
            height={size === 'lg' ? 274 : 183}
            onError={() => setSrcIdx(i => i + 1)}
            className="w-full h-auto"
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${wClass} flex-shrink-0 cursor-pointer rounded-xl bg-[#2c1e16] border-2 border-[#a88a45] flex items-center justify-center p-2 text-center`}
      style={{ minHeight: size === 'lg' ? '120px' : '72px' }}
      onClick={onClick}
      title={card.name}
    >
      <span className="font-hs text-[#fcd34d] text-[10px] leading-tight">{card.name}</span>
    </div>
  );
}) as React.FC<{ card: LegendaryCard; size: 'lg' | 'sm'; onClick: () => void }>;

// CLASS_SECTIONS_LEGEND: sections for legend tab (no neutral)
const LEGEND_CLASSES: Array<{ id: string; name: string; color: string }> = [
  { id: 'all',           name: 'Все',               color: '#4a4a4a' },
  { id: 'death-knight',  name: 'Рыцарь смерти',     color: '#1f252d' },
  { id: 'demon-hunter',  name: 'Охотник на демонов', color: '#224722' },
  { id: 'druid',         name: 'Друид',              color: '#704a16' },
  { id: 'hunter',        name: 'Охотник',            color: '#1d5921' },
  { id: 'mage',          name: 'Маг',                color: '#2b5c85' },
  { id: 'paladin',       name: 'Паладин',            color: '#a88a45' },
  { id: 'priest',        name: 'Жрец',               color: '#888888' },
  { id: 'rogue',         name: 'Разбойник',          color: '#333333' },
  { id: 'shaman',        name: 'Шаман',              color: '#2a2e6b' },
  { id: 'warlock',       name: 'Чернокнижник',       color: '#5c265c' },
  { id: 'warrior',       name: 'Воин',               color: '#7a1e1e' },
  { id: 'any',           name: 'Нейтральные',        color: '#6b6b6b' },
];


// ─── AdminPanel ───────────────────────────────────────────────────────────────

interface AdminForm {
  title: string; tag: string; excerpt: string; image: string; url: string;
}

type AdminSectionId = 'overview' | 'add' | 'list' | 'media';
type AdminMessage = { type: 'ok' | 'err'; text: string };
type AuthUser = {
  id?: string;
  profileId?: string;
  email: string;
  name: string;
  role: 'admin' | 'user' | string;
  country?: string;
  newsletterOptIn?: boolean;
  avatarInitials?: string;
  telegramUsername?: string;
  photoUrl?: string;
  contactVkUrl?: string;
  contactTelegram?: string;
  contactEmail?: string;
  adminAllowed?: boolean;
  contestAdminAllowed?: boolean;
};

type SubscriptionStatus = {
  hasAccess: boolean;
  source: string;
  checkedAt: string | null;
  stale: boolean;
  message: string;
  entitlements?: {
    arena?: boolean;
    battlegrounds?: boolean;
    standard?: boolean;
    contests?: boolean;
    guidesArchive?: boolean;
    arenaArticles?: boolean;
    battlegroundsArticles?: boolean;
  };
  boosty: {
    checked?: boolean;
    found?: boolean;
    hasAccess?: boolean;
    email?: string;
    price?: number;
    levelName?: string;
    message?: string;
  };
  telegram: {
    checked?: boolean;
    hasAccess?: boolean;
    username?: string;
    message?: string;
    chats?: Array<{ chatId: string; ok: boolean; status?: string; isMember?: boolean; error?: string }>;
  };
};

type SubscriptionEntitlementKey = keyof NonNullable<SubscriptionStatus['entitlements']>;

function hasSubscriptionEntitlement(
  subscription: SubscriptionStatus | null | undefined,
  entitlement: SubscriptionEntitlementKey | null,
): boolean {
  if (!subscription) return false;
  if (!entitlement) return Boolean(subscription.hasAccess);
  return Boolean(subscription.entitlements?.[entitlement]);
}

function subscriptionEntitlementLabels(subscription: { hasAccess?: boolean; entitlements?: SubscriptionStatus['entitlements'] } | null | undefined): string[] {
  if (!subscription?.entitlements) return subscription?.hasAccess ? ['Все разделы'] : [];
  const labels: Array<[SubscriptionEntitlementKey, string]> = [
    ['arena', 'Арена'],
    ['battlegrounds', 'Поля Сражений'],
    ['standard', 'Стандарт'],
    ['contests', 'Конкурсы'],
    ['guidesArchive', 'Архив гайдов'],
    ['arenaArticles', 'Статьи Арены'],
    ['battlegroundsArticles', 'Статьи Полей'],
  ];
  return labels.filter(([key]) => subscription.entitlements?.[key]).map(([, label]) => label);
}

type TelegramAuthPayload = {
  id: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number | string;
  hash: string;
};

declare global {
  interface Window {
    onHsArenaTelegramAuth?: (user: TelegramAuthPayload) => void;
  }
}

const EMPTY_FORM: AdminForm = { title: '', tag: '', excerpt: '', image: '', url: '' };
const ADMIN_SECTIONS: { id: AdminSectionId; label: string; description: string }[] = [
  { id: 'overview', label: 'Настройка', description: 'Сводка и быстрые действия' },
  { id: 'add', label: 'Новая статья', description: 'Создание карточки материала' },
  { id: 'list', label: 'Список', description: 'Поиск, фильтрация и удаление' },
  { id: 'media', label: 'Медиа', description: 'Промо-изображения' },
];

const getInitialAdminSection = (): AdminSectionId => {
  if (typeof window === 'undefined') return 'overview';
  const params = new URLSearchParams(window.location.search);
  const rawSection = (params.get('section') || params.get('admin') || '').toLowerCase();
  if (rawSection === 'add' || rawSection === 'new') return 'add';
  if (rawSection === 'list' || rawSection === 'articles') return 'list';
  if (rawSection === 'media') return 'media';
  return 'overview';
};

const ADMIN_INPUT: React.CSSProperties = {
  background: '#f8faff',
  border: '1.5px solid #cbd7ea',
  color: '#1e293b',
  padding: '8px 12px',
  borderRadius: '8px',
  fontSize: '14px',
  width: '100%',
  boxSizing: 'border-box',
};

const ADMIN_SECONDARY_BUTTON: React.CSSProperties = {
  background: 'rgba(37,99,235,0.08)',
  color: '#1f3b63',
  border: '1px solid #9db4d5',
  borderRadius: '8px',
  padding: '8px 12px',
  fontSize: '13px',
  cursor: 'pointer',
};

const AUTH_TOKEN_KEY = 'hs_arena_auth_token';
const AUTH_EMAIL_KEY = 'hs_arena_auth_email';
const AUTH_SESSION_HINT_KEY = 'hs_arena_auth_cookie_hint';
const ARTICLE_COVER_PROXY_HOSTS = new Set([
  'hs-manacost.ru',
  'www.hs-manacost.ru',
  'manacost.ru',
  'www.manacost.ru',
  'kolodahearthstone.ru',
  'www.kolodahearthstone.ru',
]);

function articleImageSrc(value?: string): string {
  const raw = String(value ?? '').trim();
  if (!raw || raw.startsWith('/')) return raw;
  try {
    const url = new URL(raw);
    if (ARTICLE_COVER_PROXY_HOSTS.has(url.hostname.toLowerCase())) {
      return `/api/article-cover?url=${encodeURIComponent(url.href)}`;
    }
  } catch {
    return raw;
  }
  return raw;
}

function isKolodaArticleUrl(value?: string): boolean {
  const raw = String(value ?? '').trim();
  if (!raw) return false;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return host === 'kolodahearthstone.ru' || host === 'www.kolodahearthstone.ru';
  } catch {
    return false;
  }
}

function formatArticleDate(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function isRealAuthEmail(email?: string): boolean {
  return Boolean(email && email.includes('@') && !email.endsWith('@telegram.local') && !email.endsWith('.local'));
}

function formatSubscriptionDate(value: string | null): string {
  if (!value) return 'Еще не проверяли';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function legacyAuthToken(): string {
  try { return sessionStorage.getItem(AUTH_TOKEN_KEY) || ''; } catch { return ''; }
}

function hasAuthSessionHint(): boolean {
  try { return localStorage.getItem(AUTH_SESSION_HINT_KEY) === '1' || Boolean(sessionStorage.getItem(AUTH_TOKEN_KEY)); } catch { return false; }
}

function markAuthSessionHint(): void {
  try {
    localStorage.setItem(AUTH_SESSION_HINT_KEY, '1');
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
  } catch { /* storage may be disabled */ }
}

function clearAuthSessionHint(): void {
  try {
    localStorage.removeItem(AUTH_SESSION_HINT_KEY);
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
  } catch { /* storage may be disabled */ }
}

const COUNTRY_OPTIONS = [
  'Россия',
  'Беларусь',
  'Казахстан',
  'Украина',
  'Польша',
  'Германия',
  'США',
  'Другая страна',
];



function HeaderProfileButton({ user, checking = false }: { user: AuthUser | null; checking?: boolean }) {
  const label = user || checking ? 'Профиль' : 'Войти';
  const hint = checking && !user
    ? 'Проверяем доступ'
    : user
      ? (user.name && user.name !== 'Пользователь Манакост' ? user.name : 'Личный кабинет')
      : 'Личный кабинет';

  if (checking && !user) {
    return (
      <span className="arena-sidebar-profile-content">
        <span className="arena-sidebar-profile-icon">
          <UserCircle size={18} className="opacity-85" />
        </span>
        <span className="arena-sidebar-profile-copy">
          <span className="arena-sidebar-profile-label">{label}</span>
          <span className="arena-sidebar-profile-hint">{hint}</span>
        </span>
      </span>
    );
  }

  if (!user) {
    return (
      <span className="arena-sidebar-profile-content">
        <span className="arena-sidebar-profile-icon">
          <LogIn size={18} className="opacity-85" />
        </span>
        <span className="arena-sidebar-profile-copy">
          <span className="arena-sidebar-profile-label">{label}</span>
          <span className="arena-sidebar-profile-hint">{hint}</span>
        </span>
      </span>
    );
  }
  return (
    <span className="arena-sidebar-profile-content">
      <span className="arena-sidebar-profile-avatar">
        <AuthAvatar user={user} size={34} />
      </span>
      <span className="arena-sidebar-profile-copy">
        <span className="arena-sidebar-profile-label">{label}</span>
        <span className="arena-sidebar-profile-hint">{hint}</span>
      </span>
    </span>
  );
}



function shortProfileIdentifier(value: string) {
  return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}


const AdminArticleRow = memo(function AdminArticleRow({
  article,
  deleting,
  onDelete,
}: {
  article: Article;
  deleting: boolean;
  onDelete: (id: string, title: string) => void;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '10px 14px',
      background: 'rgba(139,69,19,0.06)',
      border: '1px solid #c4a46a',
      borderRadius: '10px',
    }}>
      {article.image ? (
        <img src={articleImageSrc(article.image)} alt=""
          style={{ width: '52px', height: '40px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
      ) : (
        <div style={{ width: '52px', height: '40px', borderRadius: '6px', background: 'rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: '20px', opacity: 0.4 }}>📰</span>
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-display)', color: '#3d2208', fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {article.title}
        </div>
        <div style={{ color: '#8b6c42', fontSize: '11px', marginTop: '2px' }}>
          {article.date}{article.tag ? ` · ${article.tag}` : ''}
        </div>
      </div>
      {article.url && article.url !== '#' && (
        <a href={article.url} target="_blank" rel="noreferrer"
          style={{ fontSize: '11px', color: '#8b4513', textDecoration: 'none', flexShrink: 0 }}>
          ↗
        </a>
      )}
      <button
        onClick={() => onDelete(article.id, article.title)}
        disabled={deleting}
        style={{
          background: '#fee2e2', color: '#991b1b',
          border: '1px solid #fca5a5', borderRadius: '6px',
          padding: '5px 11px', cursor: deleting ? 'not-allowed' : 'pointer',
          fontSize: '12px', flexShrink: 0,
          opacity: deleting ? 0.6 : 1,
        }}
      >
        {deleting ? '…' : 'Удалить'}
      </button>
    </div>
  );
});



// ─── Footer ───────────────────────────────────────────────────────────────────

function SiteFooter({ onNavigate, updatedAt }: { onNavigate: (tab: string) => void; updatedAt: string | null }) {
  const year = new Date().getFullYear();
  const navLinks = [
    { label: 'Главная',    href: '/',            tab: 'home'        },
    { label: 'Классы',     href: '/classes',     tab: 'winrates'    },
    { label: 'Тир-лист',  href: '/tierlist',    tab: 'tierlist'    },
    { label: 'Легендарки', href: '/legendaries', tab: 'legendaries' },
    { label: 'Статьи',     href: '/articles',    tab: 'articles'    },
    { label: 'Галерея',    href: '/gallery',     tab: 'gallery'     },
  ];
  return (
    <footer
      className="arena-footer mt-8"
      style={{
        background: 'linear-gradient(180deg, rgba(8,16,32,0.98) 0%, rgba(3,7,14,0.98) 100%)',
        borderTop: '1px solid rgba(246,206,104,0.22)',
        color: '#c8d5e8',
      }}
      aria-label="Подвал сайта"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 grid grid-cols-2 gap-6">
        {/* Col 1: Навигация */}
        <div>
          <h3 className="font-hs text-[#f6ce68] text-sm mb-3 uppercase">Разделы</h3>
          <nav aria-label="Навигация по сайту">
            <ul className="flex flex-col gap-1.5">
              {navLinks.map(l => (
                <li key={l.tab}>
                  <a
                    href={l.href}
                    onClick={(e: React.MouseEvent) => { e.preventDefault(); onNavigate(l.tab); }}
                    className="text-sm hover:text-[#f6ce68] transition-colors"
                    style={{ color: 'inherit', textDecoration: 'none' }}
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        {/* Col 2: Сообщество */}
        <div>
          <h3 className="font-hs text-[#f6ce68] text-sm mb-3 uppercase">Сообщество</h3>
          <ul className="flex flex-col gap-1.5 text-sm">
            <li><a href="https://t.me/manacost_ru" target="_blank" rel="noopener noreferrer" className="hover:text-[#f6ce68] transition-colors" style={{ color: 'inherit', textDecoration: 'none' }}>Telegram</a></li>
            <li><a href="https://boosty.to/kolodahearthstone" target="_blank" rel="noopener noreferrer" className="hover:text-[#f6ce68] transition-colors" style={{ color: 'inherit', textDecoration: 'none' }}>Boosty</a></li>
          </ul>
        </div>

      </div>

      {/* Bottom bar */}
      <div className="border-t py-4 px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2"
        style={{ borderColor: 'rgba(148,163,184,0.18)' }}>
        <p className="text-xs" style={{ color: '#64748b' }}>
          © 2024–{year} Manacost. Все права защищены.
        </p>
        <p className="text-xs" style={{ color: '#64748b' }}>
          Hearthstone® — зарегистрированная торговая марка Blizzard Entertainment.
        </p>
      </div>
    </footer>
  );
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────

// ─── Breadcrumbs ──────────────────────────────────────────────────────────────


// ─── InternalLinks ────────────────────────────────────────────────────────────


// ─── SectionBanner ────────────────────────────────────────────────────────────


// ─── ArticlesTab ──────────────────────────────────────────────────────────────

interface Article {
  id: string;
  title: string;
  date: string;
  image: string;
  excerpt: string;
  tag?: string;
  mode?: 'arena' | 'battlegrounds' | 'general' | string;
  url: string;
}
interface ArticlesData {
  articles: Article[];
  updatedAt: string | null;
}

interface GalleryItem {
  id: string;
  title: string;
  description?: string;
  tag?: string;
  source?: string;
  width?: number;
  height?: number;
  bytes?: number;
  format?: string;
  previewUrl: string;
  thumbUrl: string;
  imageUrl: string;
  downloadUrl: string;
  createdAt: string;
  updatedAt?: string;
}

interface GalleryData {
  items: GalleryItem[];
  updatedAt: string | null;
}

function articleEntitlement(article: Article): SubscriptionEntitlementKey | null {
  const explicitMode = String(article.mode || '').toLowerCase();
  if (explicitMode === 'battlegrounds') return 'battlegroundsArticles';
  if (explicitMode === 'arena') return 'arenaArticles';
  if (explicitMode === 'general') return null;
  const haystack = [article.tag, article.title, article.excerpt, article.url]
    .map(value => String(value || '').toLowerCase().replace(/ё/g, 'е'))
    .join(' ');
  if (/(поля сражений|полей сражений|battleground|battle grounds|tavern|таверна|боб|bob|бг)/.test(haystack)) return 'battlegroundsArticles';
  if (/(арена|arena)/.test(haystack)) return 'arenaArticles';
  return null;
}

function canAccessArticle(article: Article, subscription: SubscriptionStatus | null | undefined, authUser?: AuthUser | null): boolean {
  if (authUser?.role === 'admin') return true;
  return hasSubscriptionEntitlement(subscription, articleEntitlement(article));
}


// ─── Decks Tab ────────────────────────────────────────────────────────────────

const ALL_DECK_CLASSES = '__all__';
const DECKS_PAGE_SIZE = 10;

const DeckCardLightbox: React.FC<{ card: ArenaDeckCard; onClose: () => void }> = ({ card, onClose }) => {
  const [visible, setVisible] = useState(false);
  const [srcIdx, setSrcIdx] = useState(0);
  const touchOrigin = useRef<{ x: number; y: number } | null>(null);
  const sources = useMemo(() => uniqueSources([
    card.cardId ? hsImgUrl(card.cardId, '512x') : null,
    card.image,
    card.cardId ? hsImgUrl(card.cardId, '512x', 'enUS') : null,
  ]), [card.cardId, card.image]);
  const bigSrc = sources[srcIdx] ?? null;

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  useEffect(() => setSrcIdx(0), [card.cardId]);

  return createPortal(
    <div
      className="deck-card-lightbox"
      style={{
        position: 'fixed', inset: 0,
        zIndex: 99999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.2s ease',
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
      onClick={onClose}
      onTouchStart={e => {
        const t = e.touches[0];
        touchOrigin.current = { x: t.clientX, y: t.clientY };
      }}
      onTouchEnd={e => {
        if (!touchOrigin.current) return;
        const t = e.changedTouches[0];
        const moved = Math.hypot(t.clientX - touchOrigin.current.x, t.clientY - touchOrigin.current.y);
        touchOrigin.current = null;
        if (moved < 12) { e.preventDefault(); onClose(); }
      }}
    >
      <div className="deck-card-lightbox-backdrop" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.87)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }} />
      <div
        className="deck-card-lightbox-panel flex flex-col items-center gap-3"
        style={{
          position: 'relative',
          zIndex: 1,
          width: 'min(92vw, 340px)',
          maxHeight: '90dvh',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          transform: visible ? 'scale(1) translateY(0)' : 'scale(0.75) translateY(36px)',
          transition: 'transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
        onClick={e => e.stopPropagation()}
        onTouchStart={e => e.stopPropagation()}
        onTouchEnd={e => e.stopPropagation()}
      >
        {bigSrc ? (
          <img
            src={bigSrc}
            alt={card.name}
            width={360}
            height={548}
            decoding="async"
            onError={() => setSrcIdx(i => i + 1)}
            draggable={false}
            style={{ width: '100%', maxWidth: '300px', height: 'auto', filter: 'drop-shadow(0 24px 60px rgba(0,0,0,0.95))' }}
          />
        ) : (
          <div className="w-64 h-96 rounded-2xl flex items-center justify-center text-center px-5"
            style={{ background: '#2c1e16', border: '2px solid #a88a45', color: '#fcd34d', fontFamily: 'var(--font-hs)' }}>
            {card.name}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="px-4 py-1.5 rounded-full text-sm font-bold"
            style={{ background: 'rgba(26,17,10,0.86)', border: '1px solid rgba(168,138,69,0.5)', color: '#fcd34d' }}>
            {card.name}
          </span>
          {typeof card.cost === 'number' && (
            <span className="px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5"
              style={{ background: 'rgba(20,40,100,0.85)', border: '1px solid rgba(96,165,250,0.4)', color: '#bfdbfe' }}>
              <img src={MANA_ICON} alt="" width={16} height={16} className="w-4 h-4" /> {card.cost}
            </span>
          )}
          {card.count > 1 && (
            <span className="px-3 py-1.5 rounded-full text-xs font-bold"
              style={{ background: 'rgba(122,30,30,0.9)', border: '1px solid rgba(252,165,165,0.5)', color: '#fff' }}>
              x{card.count}
            </span>
          )}
        </div>
      </div>
      <button
        className="hs-lightbox-close"
        style={{
          position: 'absolute', top: '16px', right: '16px', zIndex: 2,
          width: '44px', height: '44px', borderRadius: '50%',
          background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'rgba(255,255,255,0.78)', cursor: 'pointer',
        }}
        onClick={e => { e.stopPropagation(); onClose(); }}
        aria-label="Закрыть"
      >
        <X size={20} />
      </button>
    </div>,
    document.body,
  );
};

const DeckCardThumb: React.FC<{ card: ArenaDeckCard; compact?: boolean; onOpen?: (card: ArenaDeckCard) => void }> = ({ card, compact = false, onOpen }) => (
  <figure className={`relative flex-shrink-0 ${compact ? 'w-16 sm:w-[4.5rem]' : 'w-[4.6rem] sm:w-20 md:w-[5.25rem]'}`} title={card.name}>
    <button
      type="button"
      onClick={() => onOpen?.(card)}
      className="relative block w-full p-0 border-0 bg-transparent cursor-zoom-in transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fcd34d] focus-visible:ring-offset-2 focus-visible:ring-offset-[#4a3018]"
      aria-label={`Открыть карту ${card.name}`}
      style={{ borderRadius: 8 }}
    >
      <img
        src={card.image}
        alt={card.name}
        loading="lazy"
        decoding="async"
        width={compact ? 120 : 180}
        height={compact ? 183 : 274}
        className="w-full h-auto"
        style={{ filter: 'drop-shadow(0 5px 12px rgba(0,0,0,0.62))' }}
      />
      {card.count > 1 && (
        <span
          className="absolute right-0.5 bottom-1 min-w-6 h-6 px-1.5 flex items-center justify-center rounded-full text-xs font-black text-white"
          style={{
            background: 'linear-gradient(135deg,#7a1e1e,#dc2626)',
            border: '1.5px solid #fca5a5',
            textShadow: '0 1px 2px rgba(0,0,0,0.9)',
          }}
        >
          x{card.count}
        </span>
      )}
    </button>
  </figure>
);


function buildDeckPageItems(page: number, pageCount: number): Array<number | 'gap'> {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  const items: Array<number | 'gap'> = [];
  let prev = 0;
  Array.from(pages)
    .filter(p => p >= 1 && p <= pageCount)
    .sort((a, b) => a - b)
    .forEach(p => {
      if (prev && p - prev > 1) items.push('gap');
      items.push(p);
      prev = p;
    });
  return items;
}




const NETWORK_SITES = [
  {
    id: 'koloda',
    label: 'Koloda',
    href: 'https://kolodahearthstone.ru/',
    icon: '/site-icons/koloda.ico',
    tone: 'neutral',
    current: false,
  },
  {
    id: 'manacost',
    label: 'HS-Manacost',
    href: 'https://hs-manacost.ru/',
    icon: '/site-icons/hs-manacost.png',
    tone: 'stats',
    current: false,
  },
  {
    id: 'arena',
    label: 'HS-Arena',
    href: '/',
    icon: '/arena-logo-icon.webp?v=mana-swirl-20260624',
    tone: 'arena',
    current: true,
  },
] as const;

// ─── Tab transition wrapper ────────────────────────────────────────────────────
function TabTransition({ children }: { tabKey: string; children: React.ReactNode }) {
  return <>{children}</>;
}

const loadDeferredRoutesModule = () => import('./features/DeferredRoutes');
const loadBgLibraryModule = () => import('./features/BgLibrary');
const loadGuidesArchiveModule = () => import('./features/GuidesArchive');
const loadStandardMatchupsModule = () => import('./features/StandardMatchups');
const loadContestsModule = () => import('./features/Contests');
const loadBattlegroundsModule = () => import('./features/Battlegrounds');
const LazyPaywallGate = React.lazy(() => import('./components/PaywallGate'));
const LazyFAQSection = React.lazy(() => import('./components/FAQSection'));
const LazySupportPrompt = React.lazy(() => import('./components/SupportPrompt'));

const LazyWinrates = React.lazy(() => loadDeferredRoutesModule().then(module => ({ default: module.Winrates })));
const LazyTierList = React.lazy(() => loadDeferredRoutesModule().then(module => ({ default: module.TierList })));
const LazyLegendaries = React.lazy(() => loadDeferredRoutesModule().then(module => ({ default: module.Legendaries })));
const LazyLoginPanel = React.lazy(() => loadDeferredRoutesModule().then(module => ({ default: module.LoginPanel })));
const LazyAdminPanel = React.lazy(() => loadDeferredRoutesModule().then(module => ({ default: module.AdminPanel })));
const LazyArticlesTab = React.lazy(() => loadDeferredRoutesModule().then(module => ({ default: module.ArticlesTab })));
const LazyGalleryTab = React.lazy(() => loadDeferredRoutesModule().then(module => ({ default: module.GalleryTab })));
const LazyBgLibrary = React.lazy(loadBgLibraryModule);
const LazyGuidesArchive = React.lazy(loadGuidesArchiveModule);
const LazyStandardMatchupsPage = React.lazy(loadStandardMatchupsModule);
const LazyContestsPage = React.lazy(() => loadContestsModule().then(module => ({ default: module.ContestsPage })));
const LazyContestAdminPanel = React.lazy(() => loadContestsModule().then(module => ({ default: module.ContestAdminPanel })));
const LazyBattlegroundHeroesRoute = React.lazy(() => loadBattlegroundsModule().then(module => ({ default: module.BattlegroundHeroesRoute })));
const LazyBattlegroundTierList = React.lazy(() => loadBattlegroundsModule().then(module => ({ default: module.BattlegroundTierList })));
const LazyBattlegroundStrategyBuilderEmbed = React.lazy(() => loadBattlegroundsModule().then(module => ({ default: module.BattlegroundStrategyBuilderEmbed })));
const LazyBattlegroundTierBuilderEmbed = React.lazy(() => loadBattlegroundsModule().then(module => ({ default: module.BattlegroundTierBuilderEmbed })));

const ROUTE_PRELOADERS: Partial<Record<TabId | 'login', () => Promise<unknown>>> = {
  winrates: loadDeferredRoutesModule,
  tierlist: loadDeferredRoutesModule,
  legendaries: loadDeferredRoutesModule,
  articles: loadDeferredRoutesModule,
  gallery: loadDeferredRoutesModule,
  login: loadDeferredRoutesModule,
  'admin-panel': loadContestsModule,
  contests: loadContestsModule,
  'standard-matchups': loadStandardMatchupsModule,
  'bg-strategies': loadBattlegroundsModule,
  'bg-heroes': loadBattlegroundsModule,
  'bg-tier-list': loadBattlegroundsModule,
  'bg-tier-builder': loadBattlegroundsModule,
  'bg-library': loadBgLibraryModule,
  'guides-archive': loadGuidesArchiveModule,
};

function preloadRouteModule(route: TabId | 'login'): void {
  void ROUTE_PRELOADERS[route]?.().catch(() => {});
}

function RouteFallback({ minHeight = 520 }: { minHeight?: number }) {
  return (
    <div
      className="route-fallback"
      aria-busy="true"
      aria-label="Загрузка раздела"
      style={{
        minHeight,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#8b6c42',
        fontFamily: 'var(--font-display)',
      }}
    >
      Загрузка...
    </div>
  );
}

function SubscriptionLockedPreview({ title }: { title: string }) {
  return (
    <section
      aria-label="Предпросмотр закрытого раздела"
      style={{
        minHeight: 420,
        display: 'grid',
        gap: 14,
        alignContent: 'center',
        padding: 'clamp(1rem, 3vw, 2rem)',
      }}
    >
      <div className="hs-card" style={{ borderRadius: 18, padding: 'clamp(1rem, 3vw, 1.5rem)' }}>
        <p className="modern-eyebrow" style={{ margin: '0 0 10px' }}>Раздел подписчиков</p>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', color: '#1f3654', fontSize: 'clamp(1.7rem, 4vw, 2.6rem)' }}>
          {title}
        </h1>
        <p style={{ maxWidth: 680, margin: '12px 0 0', color: '#52667f', lineHeight: 1.55 }}>
          Статистика, отдельные страницы карт и инструменты Манакоста доступны подписчикам. Главная и страница конкурсов остаются открытыми для всех.
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {['Проверка подписки', 'Доступ к данным', 'VIP-инструменты'].map(item => (
          <div key={item} className="hs-card" style={{ minHeight: 92, borderRadius: 16, padding: 14, display: 'flex', alignItems: 'center', color: '#52667f', fontWeight: 800 }}>
            {item}
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Persistent cache with TTL (survives tab close, expires with data) ────────
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 h — matches server scrape interval
const TIERLIST_CACHE_TTL_MS = 60 * 1000;
const WINRATES_CACHE_KEY: Record<'hsreplay' | 'firestone', string> = {
  hsreplay: 'wr_hsreplay_arena_v2',
  firestone: 'wr_firestone',
};

function cacheGet<T>(key: string, maxAgeMs: number = CACHE_TTL_MS): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw) as { data: T; ts: number };
    if (Date.now() - ts > maxAgeMs) { localStorage.removeItem(key); return null; }
    return data;
  } catch { return null; }
}

function cacheSet(key: string, data: unknown): void {
  try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch { /* quota exceeded — ignore */ }
}

function scheduleIdleTask(task: () => void, timeout = 1200): () => void {
  if (typeof window === 'undefined') return () => {};
  const ric = (window as any).requestIdleCallback as undefined | ((cb: () => void, opts?: { timeout: number }) => number);
  const cic = (window as any).cancelIdleCallback as undefined | ((id: number) => void);
  if (ric && cic) {
    const id = ric(() => task(), { timeout });
    return () => cic(id);
  }
  const id = window.setTimeout(task, Math.min(timeout, 450));
  return () => window.clearTimeout(id);
}

// ─── Conditional fetch with ETag (skips body if data unchanged) ───────────────
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
    const newEtag = res.headers.get('ETag');
    if (newEtag) localStorage.setItem(`etag_${cacheKey}`, newEtag);
    cacheSet(cacheKey, data);
    return { data, fresh: true };
  } catch { return null; }
}

function tierlistCacheKey(src: TierlistSource): string {
  return `tl_ru_cards_v3_${src}`;
}

function tierlistBaseUrl(src: TierlistSource): string {
  return `/api/tierlist?source=${src}&v=ru_cards_v3`;
}

async function fetchTierlistSnapshot(src: TierlistSource, bust = false): Promise<TierlistData | null> {
  const cacheKey = tierlistCacheKey(src);
  const baseUrl = tierlistBaseUrl(src);
  const url = bust ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}t=${Date.now()}` : baseUrl;

  if (bust) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json() as TierlistData;
    cacheSet(cacheKey, data);
    localStorage.removeItem(`etag_${cacheKey}`);
    return data;
  }

  const result = await fetchWithETag(url, cacheKey);
  return result?.data ?? null;
}

export default function App() {
  const redirectToWwwUrl = getCanonicalRedirectUrl(window.location);
  const [activeTab, setActiveTab] = useState<TabId>(() => tabFromPath(window.location.pathname));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileNavGroup, setMobileNavGroup] = useState<'constructors' | 'misc' | null>(null);
  const [sidebarNavGroup, setSidebarNavGroup] = useState<'constructors' | 'misc' | null>(null);
  const mobileMenuRef = useRef<HTMLElement>(null);
  const mobileMenuToggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isKnownPath(window.location.pathname)) return;
    const existing = document.querySelector('meta[name="robots"]');
    if (existing) {
      existing.setAttribute('content', 'noindex, follow');
    } else {
      const meta = document.createElement('meta');
      meta.name = 'robots';
      meta.content = 'noindex, follow';
      document.head.appendChild(meta);
    }
    document.title = 'Страница не найдена | HS-Arena';
  }, []);
  const [locationSearch, setLocationSearch] = useState(() => window.location.search);
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname);
  const locationParams = new URLSearchParams(locationSearch);

  useEffect(() => {
    if (redirectToWwwUrl) {
      window.location.replace(redirectToWwwUrl);
    }
  }, [redirectToWwwUrl]);

  useEffect(() => {
    const match = window.location.pathname.match(/^\/r\/([^/]+)\/?$/);
    if (!match) return;
    const slug = decodeURIComponent(match[1] || '');
    fetch(`/api/referrals/track/${encodeURIComponent(slug)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ landingPath: `${window.location.pathname}${window.location.search}${window.location.hash}` }),
    })
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, data };
      })
      .then(({ ok, data }) => {
        window.location.replace(ok && data.targetUrl ? String(data.targetUrl) : '/');
      })
      .catch(() => window.location.replace('/'));
  }, []);

  useEffect(() => {
    if (isRemovedPagePath(window.location.pathname)) {
      window.history.replaceState({ tab: 'home' }, '', '/');
    }
  }, []);

  useEffect(() => {
    localStorage.removeItem('wr_hsreplay');
    localStorage.removeItem('etag_wr_hsreplay');
  }, []);

  /** Navigate to a tab: update state + browser URL */
  const navigate = useCallback((tab: TabId) => {
    const slug = TABS.find(t => t.id === tab)!.slug;
    preloadRouteModule(tab);
    if (window.location.pathname !== slug || window.location.search || window.location.hash) {
      window.history.pushState({ tab }, '', slug);
    }
    React.startTransition(() => {
      setLocationSearch('');
      setCurrentPath(slug);
      setActiveTab(tab);
      setMobileMenuOpen(false);
    });
    applyPageMeta(tab);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const navigatePath = useCallback((path: string) => {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const tab = tabFromPath(normalizedPath);
    preloadRouteModule(tab);
    if (window.location.pathname !== normalizedPath || window.location.search || window.location.hash) {
      window.history.pushState({ tab }, '', normalizedPath);
    }
    React.startTransition(() => {
      setLocationSearch('');
      setCurrentPath(normalizedPath);
      setActiveTab(tab);
      setMobileMenuOpen(false);
    });
    applyPageMeta(tab);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const navigateLogin = useCallback(() => {
    preloadRouteModule('login');
    const path = '/';
    const search = '?login';
    if (window.location.pathname !== path || window.location.search !== search || window.location.hash) {
      window.history.pushState({ tab: activeTab, login: true }, '', `${path}${search}`);
    }
    React.startTransition(() => {
      setLocationSearch(search);
      setCurrentPath(path);
      setMobileMenuOpen(false);
    });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [activeTab]);

  /** Handle browser back / forward */
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const tab = e.state?.tab ?? tabFromPath(window.location.pathname);
      React.startTransition(() => {
        setLocationSearch(window.location.search);
        setCurrentPath(window.location.pathname);
        setActiveTab(tab);
      });
      applyPageMeta(tab);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  /** Apply initial meta on first mount */
  useEffect(() => { applyPageMeta(activeTab); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const loadedAsset = currentAppAssetPath();
    if (!loadedAsset) return;

    let checking = false;
    const checkForNewBuild = async () => {
      if (checking || document.visibilityState === 'hidden') return;
      checking = true;
      try {
        const res = await fetch(`${window.location.pathname}?build-check=${Date.now()}`, {
          cache: 'no-store',
          credentials: 'same-origin',
        });
        if (!res.ok) return;
        const html = await res.text();
        const latestAsset = appAssetPathFromHtml(html);
        if (latestAsset && latestAsset !== loadedAsset) {
          window.location.reload();
        }
      } catch {
        // Ignore transient network errors; the next focus/interval will retry.
      } finally {
        checking = false;
      }
    };

    const interval = window.setInterval(checkForNewBuild, 5 * 60 * 1000);
    window.addEventListener('focus', checkForNewBuild);
    document.addEventListener('visibilitychange', checkForNewBuild);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', checkForNewBuild);
      document.removeEventListener('visibilitychange', checkForNewBuild);
    };
  }, []);

  // Admin panel: ?admin in URL; access is checked by authenticated user ID.
  const wantsAdmin = locationParams.has('admin');
  const wantsLogin = locationParams.has('login');
  const isAdminMode = wantsAdmin || activeTab === 'admin-panel';
  const [appAuthUser, setAppAuthUser] = useState<AuthUser | null>(null);
  const [appAuthChecking, setAppAuthChecking] = useState(true);
  const [appHasAuthHint, setAppHasAuthHint] = useState(() => hasAuthSessionHint());
  const [appSubscription, setAppSubscription] = useState<SubscriptionStatus | null>(null);
  const [appSubscriptionLoading, setAppSubscriptionLoading] = useState(false);
  const appIsContestAdmin = Boolean(appAuthUser && (
    appAuthUser.contestAdminAllowed
    || appAuthUser.adminAllowed
    || appAuthUser.id === 'user_42368c85b8de'
    || appAuthUser.profileId === 'user_42368c85b8de'
  ));

  useEffect(() => {
    let alive = true;
    const token = legacyAuthToken();
    setAppAuthChecking(true);
    fetch('/api/auth/me', {
      credentials: 'same-origin',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Требуется вход');
        if (!alive) return;
        if (!data.user) {
          clearAuthSessionHint();
          setAppHasAuthHint(false);
          setAppAuthUser(null);
          setAppSubscription(null);
          return;
        }
        markAuthSessionHint();
        setAppHasAuthHint(true);
        setAppAuthUser(data.user);
      })
      .catch(() => {
        if (!alive) return;
        clearAuthSessionHint();
        setAppHasAuthHint(false);
        setAppAuthUser(null);
        setAppSubscription(null);
      })
      .finally(() => {
        if (alive) setAppAuthChecking(false);
      });
    return () => { alive = false; };
  }, []);

  const handleAppAuthChange = useCallback((user: AuthUser | null) => {
    setAppAuthUser(user);
    if (user) markAuthSessionHint();
    else clearAuthSessionHint();
    setAppHasAuthHint(Boolean(user));
    if (!user) setAppSubscription(null);
  }, []);

  const fetchAppSubscription = useCallback(async (force = false) => {
    if (!appAuthUser) {
      setAppSubscription(null);
      return null;
    }
    setAppSubscriptionLoading(true);
    try {
      const res = await fetch(force ? '/api/subscription/refresh' : '/api/subscription/status', {
        method: force ? 'POST' : 'GET',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось проверить подписку');
      setAppSubscription(data);
      return data as SubscriptionStatus;
    } catch {
      setAppSubscription(null);
      return null;
    } finally {
      setAppSubscriptionLoading(false);
    }
  }, [appAuthUser]);

  const activeTabLabel = TABS.find(tab => tab.id === activeTab)?.label || 'Раздел';
  const activeTabEntitlement = PRIVATE_SUBSCRIPTION_TAB_ENTITLEMENTS[activeTab] ?? null;
  const privateRouteActive = Boolean(activeTabEntitlement) && !appIsContestAdmin;
  const privateRouteChecking = privateRouteActive && (appAuthChecking || (Boolean(appAuthUser) && appSubscriptionLoading && !appSubscription));
  const privateRouteLocked = privateRouteActive
    && !privateRouteChecking
    && !hasSubscriptionEntitlement(appSubscription, activeTabEntitlement);

  const renderPrivateRoute = useCallback((children: React.ReactNode, minHeight = 760) => {
    if (privateRouteChecking) return <RouteFallback minHeight={minHeight} />;
    if (privateRouteLocked) {
      return (
        <React.Suspense fallback={<RouteFallback minHeight={minHeight} />}>
          <LazyPaywallGate
            active
            title={`${activeTabLabel} доступны подписчикам`}
            authUser={appAuthUser}
            subscriptionStatus={appSubscription}
            subscriptionLoading={appSubscriptionLoading}
            onRefreshSubscription={() => fetchAppSubscription(true)}
          >
            <SubscriptionLockedPreview title={activeTabLabel} />
          </LazyPaywallGate>
        </React.Suspense>
      );
    }
    return children;
  }, [activeTabLabel, appAuthUser, appSubscription, appSubscriptionLoading, fetchAppSubscription, privateRouteChecking, privateRouteLocked]);

  useEffect(() => {
    if (!appAuthUser) {
      setAppSubscription(null);
      return;
    }
    void fetchAppSubscription(false);
  }, [appAuthUser, fetchAppSubscription]);

  const [winrateSource, setWinrateSource] = useState<'hsreplay' | 'firestone'>('hsreplay');
  const winrateSourceRef = useRef<'hsreplay' | 'firestone'>('hsreplay');
  const [tierlistSource, setTierlistSource] = useState<TierlistSource>('hsreplay');
  const tierlistSourceRef = useRef<TierlistSource>('hsreplay');
  const [switchingTierlistSource, setSwitchingTierlistSource] = useState(false);
  const [legendarySource, setLegendarySource] = useState<LegendarySource>('hsreplay');
  const [switchingLegendarySource, setSwitchingLegendarySource] = useState(false);
  const [winratesData, setWinratesData] = useState<WinratesData>({
    classes: FALLBACK_CLASSES, updatedAt: null, source: 'initial',
  });
  const [tierlistData, setTierlistData] = useState<TierlistData>({
    sections: [], cards: {}, updatedAt: null, source: 'initial',
  });
  const [legendariesData, setLegendariesData] = useState<LegendariesData>({
    groups: [], updatedAt: null, source: 'manacost.ru',
  });
  const [homeSummaryData, setHomeSummaryData] = useState<HomeSummaryData | null>(null);
  const [articlesData, setArticlesData] = useState<ArticlesData>({ articles: [], updatedAt: null });
  const [loadingArticles, setLoadingArticles] = useState(false);
  const [galleryData, setGalleryData] = useState<GalleryData>({ items: [], updatedAt: null });
  const [loadingGallery, setLoadingGallery] = useState(false);

  const [loadingWinrates,    setLoadingWinrates]    = useState(false); // false = show fallback immediately
  const [loadingTierlist,    setLoadingTierlist]    = useState(true);
  const [loadingLegendaries, setLoadingLegendaries] = useState(true);
  const [loadingHomeSummary, setLoadingHomeSummary] = useState(true);
  const [errorWinrates,      setErrorWinrates]      = useState(false);
  const [errorTierlist,      setErrorTierlist]      = useState(false);
  const [errorLegendaries,   setErrorLegendaries]   = useState(false);
  const [switchingSource,    setSwitchingSource]    = useState(false);

  // Generation counters prevent race conditions when two fetches run simultaneously
  const wrGenRef = useRef(0);
  const tlGenRef = useRef(0);
  const lgGenRef = useRef(0);
  const homeSummaryGenRef = useRef(0);
  const homeSummaryRequestedRef = useRef(false);
  const articlesRequestedRef = useRef(false);
  const galleryRequestedRef = useRef(false);
  const tierlistRequestedRef = useRef(false);
  const legendariesRequestedRef = useRef(false);
  const warmedTierlistSourcesRef = useRef<Set<TierlistSource>>(new Set());
  const warmedRoutesRef = useRef<Set<TabId | 'login'>>(new Set());

  const fetchHomeSummary = useCallback(async () => {
    const gen = ++homeSummaryGenRef.current;
    const cacheKey = 'home_summary_v2';
    try {
      const cached = cacheGet<HomeSummaryData>(cacheKey, 5 * 60 * 1000);
      if (cached && gen === homeSummaryGenRef.current) {
        setHomeSummaryData(cached);
        setLoadingHomeSummary(false);
      } else if (gen === homeSummaryGenRef.current) {
        setLoadingHomeSummary(true);
      }

      const result = await fetchWithETag('/api/home/summary', cacheKey);
      if (!result?.data) throw new Error('fetch failed');
      if (gen !== homeSummaryGenRef.current) return;
      setHomeSummaryData(result.data);
    } catch {
      // Keep the static winrate fallback; cards/legendaries stay as skeleton-free empty strips.
    } finally {
      if (gen === homeSummaryGenRef.current) setLoadingHomeSummary(false);
    }
  }, []);

  const fetchWinrates = useCallback(async (src: 'hsreplay' | 'firestone' = 'hsreplay') => {
    const gen = ++wrGenRef.current;
    const cacheKey = WINRATES_CACHE_KEY[src];
    try {
      // Show persisted cache instantly (survives tab close)
      const cached = cacheGet<any>(cacheKey);
      if (cached && gen === wrGenRef.current) setWinratesData(cached);
      // Fetch fresh — ETag skips body if unchanged
      const result = await fetchWithETag(`/api/winrates?source=${src}`, cacheKey);
      if (!result || gen !== wrGenRef.current) return;
      setWinratesData(result.data);
      setErrorWinrates(false);
    } catch { if (gen === wrGenRef.current) setErrorWinrates(true); }
    finally  { if (gen === wrGenRef.current) { setLoadingWinrates(false); setSwitchingSource(false); } }
	  }, []);

  const fetchTierlist = useCallback(async (src: TierlistSource = 'hsreplay', bust = false) => {
    const gen = ++tlGenRef.current;
    const cacheKey = tierlistCacheKey(src);
    try {
      // Show persisted cache instantly
      const cached = bust ? null : cacheGet<TierlistData>(cacheKey, TIERLIST_CACHE_TTL_MS);
      if (cached && gen === tlGenRef.current) { setTierlistData(cached); setLoadingTierlist(false); }
      // ETag: only re-download if data actually changed
      const data = await fetchTierlistSnapshot(src, bust);
      if (!data || gen !== tlGenRef.current) return;
      setTierlistData(data);
      setErrorTierlist(false);
    } catch { if (gen === tlGenRef.current) setErrorTierlist(true); }
    finally  { if (gen === tlGenRef.current) { setLoadingTierlist(false); setSwitchingTierlistSource(false); } }
  }, []);

  const warmTierlistSource = useCallback(async (src: TierlistSource) => {
    if (warmedTierlistSourcesRef.current.has(src)) return;
    const cached = cacheGet<TierlistData>(tierlistCacheKey(src), TIERLIST_CACHE_TTL_MS);
    if (cached) {
      warmedTierlistSourcesRef.current.add(src);
      return;
    }

    warmedTierlistSourcesRef.current.add(src);
    try {
      const data = await fetchTierlistSnapshot(src);
      if (!data) warmedTierlistSourcesRef.current.delete(src);
    } catch {
      warmedTierlistSourcesRef.current.delete(src);
    }
  }, []);

  const fetchLegendaries = useCallback(async (src: LegendarySource = 'hsreplay') => {
    const gen = ++lgGenRef.current;
    const cacheKey = `leg_ru_cards_v4_${src}`;
    const baseUrl = `/api/legendaries?source=${src}&v=ru_cards_v4`;
    try {
      const cached = cacheGet<any>(cacheKey);
      if (cached && gen === lgGenRef.current) { setLegendariesData(cached); setLoadingLegendaries(false); }
      const result = await fetchWithETag(baseUrl, cacheKey);
      if (!result) throw new Error('fetch failed');
      if (gen !== lgGenRef.current) return;
      setLegendariesData(result.data);
      setErrorLegendaries(false);
    } catch { if (gen === lgGenRef.current) setErrorLegendaries(true); }
    finally  { if (gen === lgGenRef.current) { setLoadingLegendaries(false); setSwitchingLegendarySource(false); } }
  }, []);

  const fetchArticles = useCallback(async (options: { bust?: boolean; silent?: boolean } = {}) => {
    const { bust = false, silent = false } = options;
    const cacheKey = 'articles_v2';
    if (!silent) setLoadingArticles(true);
    try {
      const cached = bust ? null : cacheGet<ArticlesData>(cacheKey);
      if (cached) {
        setArticlesData(cached);
        if (!silent) setLoadingArticles(false);
      }

      if (bust) {
        const res = await fetch(`/api/articles?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('not ok');
        const data = await res.json();
        cacheSet(cacheKey, data);
        localStorage.removeItem(`etag_${cacheKey}`);
        setArticlesData(data);
      } else {
        const result = await fetchWithETag('/api/articles', cacheKey);
        if (!result?.data) throw new Error('not ok');
        setArticlesData(result.data);
      }
      articlesRequestedRef.current = true;
    } catch {
      // keep empty
    } finally { setLoadingArticles(false); }
  }, []);

  const fetchGallery = useCallback(async (options: { bust?: boolean; silent?: boolean } = {}) => {
    const { bust = false, silent = false } = options;
    const cacheKey = 'gallery_v1';
    if (!silent) setLoadingGallery(true);
    try {
      const cached = bust ? null : cacheGet<GalleryData>(cacheKey);
      if (cached) {
        setGalleryData(cached);
        if (!silent) setLoadingGallery(false);
      }

      if (bust) {
        const res = await fetch(`/api/gallery?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('not ok');
        const data = await res.json();
        cacheSet(cacheKey, data);
        localStorage.removeItem(`etag_${cacheKey}`);
        setGalleryData(data);
      } else {
        const result = await fetchWithETag('/api/gallery', cacheKey);
        if (!result?.data) throw new Error('not ok');
        setGalleryData(result.data);
      }
      galleryRequestedRef.current = true;
    } catch {
      // keep empty
    } finally { setLoadingGallery(false); }
  }, []);

  const warmRoute = useCallback((route: TabId | 'login') => {
    if (warmedRoutesRef.current.has(route)) return;
    warmedRoutesRef.current.add(route);
    preloadRouteModule(route);

    if (route === 'articles' && !articlesRequestedRef.current) {
      void fetchArticles({ silent: true });
    }
    if (route === 'gallery' && !galleryRequestedRef.current) {
      void fetchGallery({ silent: true });
    }
  }, [fetchArticles, fetchGallery]);

  const globalUpdatedAt = useMemo(
    () => latestHomeSummaryUpdatedAt(homeSummaryData)
      || winratesData.updatedAt
      || tierlistData.updatedAt
      || legendariesData.updatedAt
      || null,
    [homeSummaryData, legendariesData.updatedAt, tierlistData.updatedAt, winratesData.updatedAt],
  );

  useEffect(() => {
    if (activeTab !== 'winrates' || privateRouteChecking || privateRouteLocked) return;
    void fetchWinrates();
  }, [activeTab, fetchWinrates, privateRouteChecking, privateRouteLocked]);

  useEffect(() => {
    if (homeSummaryRequestedRef.current) return;
    homeSummaryRequestedRef.current = true;
    void fetchHomeSummary();
  }, [fetchHomeSummary]);

  useEffect(() => {
    if (tierlistRequestedRef.current) return;

    const loadTierlist = () => {
      tierlistRequestedRef.current = true;
      void fetchTierlist();
    };

    if ((activeTab === 'tierlist' && !privateRouteChecking && !privateRouteLocked) || wantsAdmin) {
      loadTierlist();
      return;
    }
  }, [activeTab, fetchTierlist, privateRouteChecking, privateRouteLocked, wantsAdmin]);

  useEffect(() => {
    if (legendariesRequestedRef.current) return;

    const loadLegendaries = () => {
      legendariesRequestedRef.current = true;
      void fetchLegendaries();
    };

    if (activeTab === 'legendaries' && !privateRouteChecking && !privateRouteLocked) {
      loadLegendaries();
      return;
    }
  }, [activeTab, fetchLegendaries, privateRouteChecking, privateRouteLocked]);

  useEffect(() => {
    if (activeTab !== 'tierlist' || !tierlistRequestedRef.current || privateRouteChecking || privateRouteLocked) return;

    let cancelIdle = () => {};
    const timer = window.setTimeout(() => {
      cancelIdle = scheduleIdleTask(() => {
        TIERLIST_SOURCES.forEach(src => {
          if (src !== tierlistSourceRef.current) void warmTierlistSource(src);
        });
      }, 1400);
    }, 250);
    return () => {
      window.clearTimeout(timer);
      cancelIdle();
    };
  }, [activeTab, privateRouteChecking, privateRouteLocked, tierlistData.updatedAt, warmTierlistSource]);

	  useEffect(() => {
	    const needsArticles = activeTab === 'home' || activeTab === 'articles' || wantsAdmin;
	    if (activeTab === 'articles' && (privateRouteChecking || privateRouteLocked)) return;
	    if (!needsArticles || articlesRequestedRef.current) return;
	    void fetchArticles();
	  }, [activeTab, privateRouteChecking, privateRouteLocked, wantsAdmin, fetchArticles]);

	  useEffect(() => {
	    if (activeTab !== 'gallery' || galleryRequestedRef.current) return;
	    void fetchGallery();
	  }, [activeTab, fetchGallery]);

  // Set of cardIds that are companion cards in legendary groups (not the key legendary itself)
  const companionIds = useMemo(() => {
    const keyIds = new Set(legendariesData.groups.map(g => g.keyCard.cardId));
    const ids = new Set<string>();
    legendariesData.groups.forEach(g =>
      g.cards.forEach(c => { if (!keyIds.has(c.cardId)) ids.add(c.cardId); })
    );
    return ids;
  }, [legendariesData]);
  const isFullWidthBuilder = activeTab === 'standard-matchups' || activeTab === 'bg-heroes' || activeTab === 'bg-library' || activeTab === 'bg-tier-list' || activeTab === 'bg-strategies' || activeTab === 'bg-tier-builder' || activeTab === 'admin-panel' || activeTab === 'guides-archive';
  // Login is its own visual route. Do not inherit the surface class of the
  // page that happened to be open before the profile was requested.
  const isEditorialSurfacePage = !isAdminMode && !wantsLogin && ['articles', 'gallery', 'guides-archive', 'contests'].includes(activeTab);
  const isGameDataSurfacePage = !isAdminMode && !wantsLogin && ['winrates', 'standard-matchups', 'tierlist', 'legendaries'].includes(activeTab);
  const isBattlegroundsSurfacePage = !isAdminMode && !wantsLogin && BG_TAB_IDS.has(activeTab);
  const isOpenSurfacePage = !isAdminMode && (activeTab === 'home' || wantsLogin || isEditorialSurfacePage || isGameDataSurfacePage || isBattlegroundsSurfacePage);
  usePageScrollLock(!isAdminMode && mobileMenuOpen);
  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const menu = mobileMenuRef.current;
    if (!menu) return undefined;
    const focusable: HTMLElement[] = Array.from(menu.querySelectorAll<HTMLElement>('a[href],button:not(:disabled)'));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        mobileMenuToggleRef.current?.focus();
        setMobileMenuOpen(false);
      }
      if (event.key !== 'Tab' || !first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileMenuOpen]);

		  return (
    <div className={`min-h-screen bg-wood text-[#3d2a1e] font-body arena-app-shell ${activeTab === 'home' && !isAdminMode ? 'arena-app-home' : ''} ${wantsLogin && !isAdminMode ? 'arena-app-profile' : ''} ${isEditorialSurfacePage ? `arena-app-editorial arena-app-${activeTab}` : ''} ${isGameDataSurfacePage ? `arena-app-game-data arena-app-${activeTab}` : ''} ${isBattlegroundsSurfacePage ? `arena-app-battlegrounds arena-app-${activeTab}` : ''}`}>
      <a
        className="arena-skip-link"
        href="#main-content"
        onClick={() => document.getElementById('main-content')?.focus()}
      >
        К основному содержимому
      </a>
      {!isAdminMode && <header className="arena-mobile-topbar lg:hidden">
        <a
          href="/"
          onClick={(e) => { e.preventDefault(); navigate('home'); }}
          className="arena-mobile-brand"
          aria-label="На главную"
        >
          <span>Manacost Stats</span>
        </a>
        <button
          ref={mobileMenuToggleRef}
          type="button"
          onClick={() => setMobileMenuOpen(open => {
            if (open) setMobileNavGroup(null);
            return !open;
          })}
          className="arena-mobile-nav-toggle"
          aria-expanded={mobileMenuOpen}
          aria-controls="arena-mobile-menu"
          aria-label={mobileMenuOpen ? 'Закрыть меню' : 'Открыть меню'}
        >
          {mobileMenuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
      </header>}

      {!isAdminMode && mobileMenuOpen && (
        <>
          <button
            type="button"
            className="arena-mobile-drawer-backdrop lg:hidden"
            aria-label="Закрыть меню"
            onClick={() => { setMobileMenuOpen(false); setMobileNavGroup(null); }}
          />
          <nav ref={mobileMenuRef} id="arena-mobile-menu" className="arena-mobile-menu lg:hidden" aria-label="Мобильная навигация">
            {TOP_LEVEL_TABS.map(tab => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <a
                  key={tab.id}
                  href={tab.slug}
                  onPointerEnter={() => warmRoute(tab.id)}
                  onFocus={() => warmRoute(tab.id)}
                  onClick={(e) => { e.preventDefault(); navigate(tab.id); setMobileMenuOpen(false); }}
                  className={`arena-mobile-menu-link ${active ? 'arena-mobile-menu-link-active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon size={18} className="flex-shrink-0" />
                  <span>{tab.label}</span>
                </a>
              );
            })}
            {appIsContestAdmin && ADMIN_TABS.map(tab => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <a
                  key={tab.id}
                  href={tab.slug}
                  onPointerEnter={() => warmRoute(tab.id)}
                  onFocus={() => warmRoute(tab.id)}
                  onClick={(e) => { e.preventDefault(); navigate(tab.id); setMobileMenuOpen(false); }}
                  className={`arena-mobile-menu-link ${active ? 'arena-mobile-menu-link-active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon size={18} className="flex-shrink-0" />
                  <span>{tab.label}</span>
                </a>
              );
            })}
            <div className="arena-mobile-menu-section" aria-label="Раздел Стандарт">
              Стандарт
            </div>
            {STANDARD_TABS.map(tab => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <a
                  key={tab.id}
                  href={tab.slug}
                  onPointerEnter={() => warmRoute(tab.id)}
                  onFocus={() => warmRoute(tab.id)}
                  onClick={(e) => { e.preventDefault(); navigate(tab.id); setMobileMenuOpen(false); }}
                  className={`arena-mobile-menu-link ${active ? 'arena-mobile-menu-link-active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon size={18} className="flex-shrink-0" />
                  <span>{tab.label}</span>
                </a>
              );
            })}
            <div className="arena-mobile-menu-section" aria-label="Раздел Арена">
              Арена
            </div>
            {ARENA_TABS.map(tab => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <a
                  key={tab.id}
                  href={tab.slug}
                  onPointerEnter={() => warmRoute(tab.id)}
                  onFocus={() => warmRoute(tab.id)}
                  onClick={(e) => { e.preventDefault(); navigate(tab.id); setMobileMenuOpen(false); }}
                  className={`arena-mobile-menu-link ${active ? 'arena-mobile-menu-link-active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon size={18} className="flex-shrink-0" />
                  <span>{tab.label}</span>
                </a>
              );
            })}
            <div className="arena-mobile-menu-section" aria-label="Раздел Поля Сражений">
              Поля Сражений
            </div>
            {BG_PRIMARY_TABS.map(tab => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <a
                  key={tab.id}
                  href={tab.slug}
                  onPointerEnter={() => warmRoute(tab.id)}
                  onFocus={() => warmRoute(tab.id)}
                  onClick={(e) => { e.preventDefault(); navigate(tab.id); setMobileMenuOpen(false); }}
                  className={`arena-mobile-menu-link ${active ? 'arena-mobile-menu-link-active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon size={18} className="flex-shrink-0" />
                  <span>{tab.label}</span>
                </a>
              );
            })}
            <div className="arena-mobile-menu-group">
              <button
                type="button"
                className={`arena-mobile-menu-link arena-mobile-menu-group-trigger ${BG_BUILDER_TABS.some(tab => tab.id === activeTab) ? 'arena-mobile-menu-link-active' : ''}`}
                aria-expanded={mobileNavGroup === 'constructors'}
                aria-controls="arena-mobile-constructors"
                onClick={() => setMobileNavGroup(group => group === 'constructors' ? null : 'constructors')}
              >
                <Grid3X3 size={18} className="flex-shrink-0" />
                <span>Конструкторы</span>
                <ChevronDown size={16} className="arena-nav-group-chevron" />
              </button>
              <div id="arena-mobile-constructors" className="arena-mobile-menu-group-items" hidden={mobileNavGroup !== 'constructors'}>
                {BG_BUILDER_TABS.map(tab => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.id;
                  return (
                    <a
                      key={tab.id}
                      href={tab.slug}
                      onPointerEnter={() => warmRoute(tab.id)}
                      onFocus={() => warmRoute(tab.id)}
                      onClick={(e) => { e.preventDefault(); navigate(tab.id); setMobileMenuOpen(false); setMobileNavGroup(null); }}
                      className={`arena-mobile-menu-link arena-mobile-menu-sublink ${active ? 'arena-mobile-menu-link-active' : ''}`}
                      aria-current={active ? 'page' : undefined}
                    >
                      <Icon size={17} className="flex-shrink-0" />
                      <span>{tab.label}</span>
                    </a>
                  );
                })}
              </div>
            </div>
            <div className="arena-mobile-menu-group arena-mobile-menu-group--misc">
              <button
                type="button"
                className={`arena-mobile-menu-link arena-mobile-menu-group-trigger ${MISC_TABS.some(tab => tab.id === activeTab) ? 'arena-mobile-menu-link-active' : ''}`}
                aria-expanded={mobileNavGroup === 'misc'}
                aria-controls="arena-mobile-misc"
                onClick={() => setMobileNavGroup(group => group === 'misc' ? null : 'misc')}
              >
                <Gift size={18} className="flex-shrink-0" />
                <span>Разное</span>
                <ChevronDown size={16} className="arena-nav-group-chevron" />
              </button>
              <div id="arena-mobile-misc" className="arena-mobile-menu-group-items" hidden={mobileNavGroup !== 'misc'}>
                {MISC_TABS.map(tab => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.id;
                  return (
                    <a
                      key={tab.id}
                      href={tab.slug}
                      onPointerEnter={() => warmRoute(tab.id)}
                      onFocus={() => warmRoute(tab.id)}
                      onClick={(e) => { e.preventDefault(); navigate(tab.id); setMobileMenuOpen(false); setMobileNavGroup(null); }}
                      className={`arena-mobile-menu-link arena-mobile-menu-sublink ${active ? 'arena-mobile-menu-link-active' : ''}`}
                      aria-current={active ? 'page' : undefined}
                    >
                      <Icon size={17} className="flex-shrink-0" />
                      <span>{tab.label}</span>
                    </a>
                  );
                })}
              </div>
            </div>
            <a
              href="/?login"
              onPointerEnter={() => warmRoute('login')}
              onFocus={() => warmRoute('login')}
              onClick={(e) => { e.preventDefault(); navigateLogin(); }}
              className={`arena-mobile-menu-link arena-mobile-menu-profile ${wantsLogin ? 'arena-mobile-menu-link-active' : ''}`}
            >
              {appAuthUser ? (
                <AuthAvatar user={appAuthUser} size={28} />
              ) : appAuthChecking && appHasAuthHint ? (
                <UserCircle size={18} className="flex-shrink-0" />
              ) : (
                <LogIn size={18} className="flex-shrink-0" />
              )}
              <span>{appAuthUser || (appAuthChecking && appHasAuthHint) ? 'Профиль' : 'Войти'}</span>
            </a>
          </nav>
        </>
      )}

      <div className="arena-layout-shell">
        {!isAdminMode && (
          <aside className="arena-sidebar" aria-label="Основная навигация">
            <a
              href="/"
              onClick={(e) => { e.preventDefault(); navigate('home'); }}
              className="arena-sidebar-brand"
              aria-label="На главную"
            >
              <span className="arena-sidebar-brand-copy">
                <strong>Manacost Stats</strong>
              </span>
            </a>

            <nav className="arena-sidebar-nav" aria-label="Разделы сайта">
              {TOP_LEVEL_TABS.map(tab => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <a
                    key={tab.id}
                    href={tab.slug}
                    onPointerEnter={() => warmRoute(tab.id)}
                    onFocus={() => warmRoute(tab.id)}
                    onClick={(e: React.MouseEvent) => { e.preventDefault(); navigate(tab.id); }}
                    aria-current={active ? 'page' : undefined}
                    className={`arena-sidebar-link ${active ? 'arena-sidebar-link-active' : ''}`}
                    style={{ textDecoration: 'none' }}
                  >
                    <Icon size={19} className="arena-sidebar-link-icon flex-shrink-0" />
                    <span>{tab.label}</span>
                  </a>
                );
              })}
              {appIsContestAdmin && ADMIN_TABS.map(tab => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <a
                    key={tab.id}
                    href={tab.slug}
                    onPointerEnter={() => warmRoute(tab.id)}
                    onFocus={() => warmRoute(tab.id)}
                    onClick={(e: React.MouseEvent) => { e.preventDefault(); navigate(tab.id); }}
                    aria-current={active ? 'page' : undefined}
                    className={`arena-sidebar-link ${active ? 'arena-sidebar-link-active' : ''}`}
                    style={{ textDecoration: 'none' }}
                  >
                    <Icon size={19} className="arena-sidebar-link-icon flex-shrink-0" />
                    <span>{tab.label}</span>
                  </a>
                );
              })}
              <div className="arena-sidebar-section" aria-label="Раздел Стандарт">
                Стандарт
              </div>
              {STANDARD_TABS.map(tab => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <a
                    key={tab.id}
                    href={tab.slug}
                    onPointerEnter={() => warmRoute(tab.id)}
                    onFocus={() => warmRoute(tab.id)}
                    onClick={(e: React.MouseEvent) => { e.preventDefault(); navigate(tab.id); }}
                    aria-current={active ? 'page' : undefined}
                    className={`arena-sidebar-link ${active ? 'arena-sidebar-link-active' : ''}`}
                    style={{ textDecoration: 'none' }}
                  >
                    <Icon size={19} className="arena-sidebar-link-icon flex-shrink-0" />
                    <span>{tab.label}</span>
                  </a>
                );
              })}
              <div className="arena-sidebar-section" aria-label="Раздел Арена">
                Арена
              </div>
              {ARENA_TABS.map(tab => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <a
                    key={tab.id}
                    href={tab.slug}
                    onPointerEnter={() => warmRoute(tab.id)}
                    onFocus={() => warmRoute(tab.id)}
                    onClick={(e: React.MouseEvent) => { e.preventDefault(); navigate(tab.id); }}
                    aria-current={active ? 'page' : undefined}
                    className={`arena-sidebar-link ${active ? 'arena-sidebar-link-active' : ''}`}
                    style={{ textDecoration: 'none' }}
                  >
                    <Icon size={19} className="arena-sidebar-link-icon flex-shrink-0" />
                    <span>{tab.label}</span>
                  </a>
                );
              })}
              <div className="arena-sidebar-section" aria-label="Раздел Поля Сражений">
                Поля Сражений
              </div>
              {BG_PRIMARY_TABS.map(tab => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <a
                    key={tab.id}
                    href={tab.slug}
                    onPointerEnter={() => warmRoute(tab.id)}
                    onFocus={() => warmRoute(tab.id)}
                    onClick={(e: React.MouseEvent) => { e.preventDefault(); navigate(tab.id); }}
                    aria-current={active ? 'page' : undefined}
                    className={`arena-sidebar-link ${active ? 'arena-sidebar-link-active' : ''}`}
                    style={{ textDecoration: 'none' }}
                  >
                    <Icon size={19} className="arena-sidebar-link-icon flex-shrink-0" />
                    <span>{tab.label}</span>
                  </a>
                );
              })}
              <div
                className="arena-sidebar-nav-group"
                onMouseEnter={() => setSidebarNavGroup('constructors')}
                onMouseLeave={(event) => {
                  if (!event.currentTarget.contains(document.activeElement)) setSidebarNavGroup(null);
                }}
                onFocus={() => setSidebarNavGroup('constructors')}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setSidebarNavGroup(null);
                }}
              >
                <button
                  type="button"
                  className={`arena-sidebar-link arena-sidebar-nav-group-trigger ${BG_BUILDER_TABS.some(tab => tab.id === activeTab) ? 'arena-sidebar-link-active' : ''}`}
                  aria-expanded={sidebarNavGroup === 'constructors'}
                  aria-controls="arena-sidebar-constructors"
                  onClick={() => setSidebarNavGroup(group => group === 'constructors' ? null : 'constructors')}
                >
                  <Grid3X3 size={19} className="arena-sidebar-link-icon flex-shrink-0" />
                  <span>Конструкторы</span>
                  <ChevronDown size={15} className="arena-nav-group-chevron" />
                </button>
                <div id="arena-sidebar-constructors" className="arena-sidebar-nav-group-items" hidden={sidebarNavGroup !== 'constructors'}>
                  {BG_BUILDER_TABS.map(tab => {
                    const Icon = tab.icon;
                    const active = activeTab === tab.id;
                    return (
                      <a
                        key={tab.id}
                        href={tab.slug}
                        onPointerEnter={() => warmRoute(tab.id)}
                        onFocus={() => warmRoute(tab.id)}
                        onClick={(e: React.MouseEvent) => { e.preventDefault(); navigate(tab.id); setSidebarNavGroup(null); }}
                        aria-current={active ? 'page' : undefined}
                        className={`arena-sidebar-link arena-sidebar-sublink ${active ? 'arena-sidebar-link-active' : ''}`}
                        style={{ textDecoration: 'none' }}
                      >
                        <Icon size={17} className="arena-sidebar-link-icon flex-shrink-0" />
                        <span>{tab.label}</span>
                      </a>
                    );
                  })}
                </div>
              </div>
              <div
                className="arena-sidebar-nav-group arena-sidebar-nav-group--misc"
                onMouseEnter={() => setSidebarNavGroup('misc')}
                onMouseLeave={(event) => {
                  if (!event.currentTarget.contains(document.activeElement)) setSidebarNavGroup(null);
                }}
                onFocus={() => setSidebarNavGroup('misc')}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setSidebarNavGroup(null);
                }}
              >
                <button
                  type="button"
                  className={`arena-sidebar-link arena-sidebar-nav-group-trigger ${MISC_TABS.some(tab => tab.id === activeTab) ? 'arena-sidebar-link-active' : ''}`}
                  aria-expanded={sidebarNavGroup === 'misc'}
                  aria-controls="arena-sidebar-misc"
                  onClick={() => setSidebarNavGroup(group => group === 'misc' ? null : 'misc')}
                >
                  <Gift size={19} className="arena-sidebar-link-icon flex-shrink-0" />
                  <span>Разное</span>
                  <ChevronDown size={15} className="arena-nav-group-chevron" />
                </button>
                <div id="arena-sidebar-misc" className="arena-sidebar-nav-group-items" hidden={sidebarNavGroup !== 'misc'}>
                  {MISC_TABS.map(tab => {
                    const Icon = tab.icon;
                    const active = activeTab === tab.id;
                    return (
                      <a
                        key={tab.id}
                        href={tab.slug}
                        onPointerEnter={() => warmRoute(tab.id)}
                        onFocus={() => warmRoute(tab.id)}
                        onClick={(e: React.MouseEvent) => { e.preventDefault(); navigate(tab.id); setSidebarNavGroup(null); }}
                        aria-current={active ? 'page' : undefined}
                        className={`arena-sidebar-link arena-sidebar-sublink ${active ? 'arena-sidebar-link-active' : ''}`}
                        style={{ textDecoration: 'none' }}
                      >
                        <Icon size={17} className="arena-sidebar-link-icon flex-shrink-0" />
                        <span>{tab.label}</span>
                      </a>
                    );
                  })}
                </div>
              </div>
            </nav>

            <div className="arena-sidebar-status" aria-label="Дата обновления данных">
              <span>Обновлено</span>
              <strong>{globalUpdatedAt ? formatDate(globalUpdatedAt) : 'Нет данных'}</strong>
            </div>

            <a
              href="/?login"
              onPointerEnter={() => warmRoute('login')}
              onFocus={() => warmRoute('login')}
              onClick={(e) => { e.preventDefault(); navigateLogin(); }}
              className={`arena-sidebar-profile ${wantsLogin ? 'arena-sidebar-profile-active' : ''}`}
              aria-label={appAuthUser || (appAuthChecking && appHasAuthHint) ? 'Открыть профиль' : 'Войти в профиль'}
              style={{ textDecoration: 'none' }}
            >
              <HeaderProfileButton user={appAuthUser} checking={appAuthChecking && appHasAuthHint} />
            </a>
          </aside>
        )}

	        <div className={`arena-workspace ${isFullWidthBuilder ? 'arena-workspace-wide' : ''} ${isAdminMode ? 'arena-workspace-admin' : ''}`}>
	          <main id="main-content" tabIndex={-1} className={`arena-main relative flex flex-col items-center ${isFullWidthBuilder ? 'arena-main-wide' : ''} ${isAdminMode ? 'arena-main-admin' : ''}`} role="main">
        {/* Parchment container */}
	        <div className={`arena-content w-full max-w-6xl mx-auto bg-parchment rounded-xl border-[3px] sm:border-[4px] border-[#6b4c2a] shadow-[inset_0_0_60px_rgba(139,69,19,0.15),0_0_0_2px_#2c1e16,0_15px_30px_rgba(0,0,0,0.6)] p-3 sm:p-6 md:p-10 relative z-0 ${isFullWidthBuilder ? 'arena-content-wide' : ''} ${isAdminMode ? 'arena-content-admin' : ''} ${isOpenSurfacePage ? 'arena-content-open' : ''}`}>
          {!isAdminMode && !isOpenSurfacePage && <>
            <div className="absolute top-0 left-0 w-8 h-8 sm:w-16 sm:h-16 border-t-2 sm:border-t-4 border-l-2 sm:border-l-4 border-gold rounded-tl-xl opacity-50" />
            <div className="absolute top-0 right-0 w-8 h-8 sm:w-16 sm:h-16 border-t-2 sm:border-t-4 border-r-2 sm:border-r-4 border-gold rounded-tr-xl opacity-50" />
            <div className="absolute bottom-0 left-0 w-8 h-8 sm:w-16 sm:h-16 border-b-2 sm:border-b-4 border-l-2 sm:border-l-4 border-gold rounded-bl-xl opacity-50" />
            <div className="absolute bottom-0 right-0 w-8 h-8 sm:w-16 sm:h-16 border-b-2 sm:border-b-4 border-r-2 sm:border-r-4 border-gold rounded-br-xl opacity-50" />
          </>}

          {wantsLogin ? (
            <TabTransition tabKey="login">
              <React.Suspense fallback={<RouteFallback minHeight={760} />}>
                <LazyLoginPanel
                  initialAuthUser={appAuthUser}
                  parentAuthChecking={appAuthChecking}
                  onAuthChange={handleAppAuthChange}
                />
              </React.Suspense>
            </TabTransition>
          ) : isAdminMode ? (
            <TabTransition tabKey="admin">
	            <React.Suspense fallback={<RouteFallback minHeight={620} />}><LazyContestAdminPanel authUser={appAuthUser} authChecking={appAuthChecking} /></React.Suspense>
            </TabTransition>
          ) : (
            <TabTransition tabKey={`${activeTab}:${currentPath}`}>
              <>
                {activeTab === 'home' && (
                  <HomeTab
                    homeSummaryData={homeSummaryData}
                    loadingHomeSummary={loadingHomeSummary}
                    articles={articlesData.articles}
                    loadingArticles={loadingArticles}
                    onNavigate={(tab: string) => navigate(tab as TabId)}
                    faq={<React.Suspense fallback={null}><LazyFAQSection /></React.Suspense>}
                  />
                )}
                {activeTab === 'standard-matchups' && (
                  renderPrivateRoute(
                    <React.Suspense fallback={<RouteFallback minHeight={720} />}><LazyStandardMatchupsPage /></React.Suspense>,
                    720,
                  )
                )}
	                {activeTab === 'winrates' && (
                  renderPrivateRoute(
                    <React.Suspense fallback={<RouteFallback minHeight={720} />}>
	                    <LazyWinrates classes={winratesData.classes} loading={loadingWinrates} error={errorWinrates}
	                      updatedAt={winratesData.updatedAt}
	                      winrateSource={winrateSource}
	                      switching={switchingSource}
                      onNavigate={(tab: string) => navigate(tab as TabId)}
                      authUser={appAuthUser}
                      subscriptionStatus={appSubscription}
                      subscriptionLoading={appAuthChecking || appSubscriptionLoading}
                      onRefreshSubscription={() => fetchAppSubscription(true)}
                      onSourceChange={async (src) => {
                        setWinrateSource(src);
                        winrateSourceRef.current = src;
                        setSwitchingSource(true);
                        await fetchWinrates(src);
                      }} />
                    </React.Suspense>
                    ,
                    720,
                  )
                )}
	                {activeTab === 'tierlist' && (
                  renderPrivateRoute(
                    <React.Suspense fallback={<RouteFallback minHeight={820} />}>
	                    <LazyTierList data={tierlistData} loading={loadingTierlist} error={errorTierlist}
	                      companionIds={companionIds}
	                      tierlistSource={tierlistSource}
                      switchingTierlistSource={switchingTierlistSource}
                      onNavigate={(tab: string) => navigate(tab as TabId)}
                      authUser={appAuthUser}
                      subscriptionStatus={appSubscription}
                      subscriptionLoading={appAuthChecking || appSubscriptionLoading}
                      onRefreshSubscription={() => fetchAppSubscription(true)}
                      onTierlistSourceChange={async (src) => {
                        setTierlistSource(src);
                        tierlistSourceRef.current = src;
                        setLoadingTierlist(false); // keep showing current data while switching
                        const cached = cacheGet<TierlistData>(tierlistCacheKey(src), TIERLIST_CACHE_TTL_MS);
                        if (cached) {
                          setTierlistData(cached);
                          setErrorTierlist(false);
                          setSwitchingTierlistSource(false);
                          void fetchTierlist(src);
                        } else {
                          setSwitchingTierlistSource(true);
                          await fetchTierlist(src);
                        }
                      }} />
                    </React.Suspense>
                    ,
                    820,
                  )
                )}
                {activeTab === 'legendaries' && (
                  renderPrivateRoute(
                  <React.Suspense fallback={<RouteFallback minHeight={760} />}>
                    <LazyLegendaries
                      data={legendariesData}
                      loading={loadingLegendaries}
                      error={errorLegendaries}
                      legendarySource={legendarySource}
                      switchingLegendarySource={switchingLegendarySource}
                      onNavigate={(tab: string) => navigate(tab as TabId)}
                      authUser={appAuthUser}
                      subscriptionStatus={appSubscription}
                      subscriptionLoading={appAuthChecking || appSubscriptionLoading}
                      onRefreshSubscription={() => fetchAppSubscription(true)}
                      onLegendarySourceChange={async (src) => {
                        setLegendarySource(src);
                        setSwitchingLegendarySource(true);
                        setLoadingLegendaries(false);
                        await fetchLegendaries(src);
                      }}
                    />
                  </React.Suspense>
                    ,
                    760,
                  )
                )}
                {activeTab === 'bg-strategies' && (
                  renderPrivateRoute(
                    <React.Suspense fallback={<RouteFallback minHeight={760} />}><LazyBattlegroundStrategyBuilderEmbed /></React.Suspense>,
                    760,
                  )
                )}
                {activeTab === 'bg-heroes' && (
                  renderPrivateRoute(
                    <React.Suspense fallback={<RouteFallback minHeight={760} />}><LazyBattlegroundHeroesRoute path={currentPath} onNavigate={navigatePath} /></React.Suspense>,
                    760,
                  )
                )}
                {activeTab === 'bg-library' && (
                  renderPrivateRoute(
                    <React.Suspense fallback={<RouteFallback minHeight={760} />}>
                      <LazyBgLibrary currentPath={currentPath} navigatePath={navigatePath} />
                    </React.Suspense>,
                    760,
                  )
                )}
                {activeTab === 'bg-tier-list' && (
                  renderPrivateRoute(
                    <React.Suspense fallback={<RouteFallback minHeight={760} />}><LazyBattlegroundTierList /></React.Suspense>,
                    760,
                  )
                )}
                {activeTab === 'bg-tier-builder' && (
                  renderPrivateRoute(
                    <React.Suspense fallback={<RouteFallback minHeight={760} />}><LazyBattlegroundTierBuilderEmbed /></React.Suspense>,
                    760,
                  )
                )}
                {activeTab === 'articles' && (
                  <React.Suspense fallback={<RouteFallback minHeight={640} />}>
                    <LazyArticlesTab
                      data={articlesData}
                      loading={loadingArticles}
                      onNavigate={(tab: string) => navigate(tab as TabId)}
                      authUser={appAuthUser}
                      subscriptionStatus={appSubscription}
                      subscriptionLoading={appAuthChecking || appSubscriptionLoading}
                    />
                  </React.Suspense>
                )}
                {activeTab === 'gallery' && (
                  <React.Suspense fallback={<RouteFallback minHeight={640} />}>
                    <LazyGalleryTab
                      data={galleryData}
                      loading={loadingGallery}
                      onNavigate={(tab: string) => navigate(tab as TabId)}
                    />
                  </React.Suspense>
                )}
                {activeTab === 'guides-archive' && (
                  renderPrivateRoute(
                    <React.Suspense fallback={<RouteFallback minHeight={760} />}>
                      <LazyGuidesArchive currentPath={currentPath} navigatePath={navigatePath} />
                    </React.Suspense>,
                    760,
                  )
                )}
                {activeTab === 'contests' && (
                  <React.Suspense fallback={<RouteFallback minHeight={620} />}><LazyContestsPage
                    authUser={appAuthUser}
                    subscriptionStatus={appSubscription}
                    subscriptionLoading={appAuthChecking || appSubscriptionLoading}
                    onRefreshSubscription={() => fetchAppSubscription(true)}
                  /></React.Suspense>
                )}
                {activeTab === 'admin-panel' && (
	                  <React.Suspense fallback={<RouteFallback minHeight={620} />}><LazyContestAdminPanel authUser={appAuthUser} authChecking={appAuthChecking} /></React.Suspense>
                )}
              </>
            </TabTransition>
          )}
          </div>
        </main>

	        {!isAdminMode && <SiteFooter onNavigate={(tab: string) => navigate(tab as TabId)} updatedAt={globalUpdatedAt} />}
	        {!isAdminMode && <React.Suspense fallback={null}><LazySupportPrompt /></React.Suspense>}
        </div>
      </div>
    </div>
  );
}

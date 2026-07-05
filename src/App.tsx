/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef, useMemo, memo, useDeferredValue } from 'react';
import { createPortal } from 'react-dom';
import { Trophy, Scroll, RefreshCw, AlertTriangle, X, Search, Star, Home, BookOpen, Menu, ChevronLeft, ChevronRight, Grid3X3, List, LogIn, Eye, EyeOff, UserCircle, Library, Gift, ShieldCheck, Send, Swords, Image as ImageIcon } from 'lucide-react';
import { getCanonicalRedirectUrl } from './config/domain';

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

interface HomeSummaryData {
  topClasses: ClassData[];
  topCards: HomeSummaryCard[];
  topLegendaries: HomeSummaryLegendary[];
  updatedAt: {
    winrates: string | null;
    tierlist: string | null;
    legendaries: string | null;
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

const CARD_IMAGE_PROXY_VERSION = 'card_img_v1';
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

function ClassMatchupMatrix({ classes, data, loading, error }: {
  classes: ClassData[];
  data: ClassMatchupsData;
  loading: boolean;
  error: boolean;
}) {
  const visibleClasses = useMemo(() => {
    const seen = new Set<string>();
    return classes.filter(cls => {
      if (seen.has(cls.id) || !CLASS_ICON_BY_ID[cls.id]) return false;
      seen.add(cls.id);
      return true;
    });
  }, [classes]);

  const matchupsByKey = useMemo(() => {
    const map = new Map<string, ClassMatchup>();
    data.matchups.forEach(matchup => {
      map.set(`${matchup.classAId}|${matchup.classBId}`, matchup);
    });
    return map;
  }, [data.matchups]);

  const getTone = (winrate: number): React.CSSProperties => {
    if (winrate >= 52) {
      return {
        background: 'linear-gradient(180deg,#2f7d46,#1e5f35)',
        border: '1px solid #62c47a',
        color: '#f6fff5',
        boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.16), 0 0 10px rgba(34,197,94,0.22)',
      };
    }
    if (winrate >= 50) {
      return {
        background: 'linear-gradient(180deg,#9a742d,#74531d)',
        border: '1px solid #d6a94f',
        color: '#fff8df',
        boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.14)',
      };
    }
    if (winrate >= 48) {
      return {
        background: 'linear-gradient(180deg,#8b5731,#653718)',
        border: '1px solid #c07a3d',
        color: '#fff1df',
        boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.12)',
      };
    }
    return {
      background: 'linear-gradient(180deg,#7a2e2e,#561818)',
      border: '1px solid #bb5555',
      color: '#ffe7e7',
      boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.1)',
    };
  };

  const hasMatchups = data.matchups.length > 0 && visibleClasses.length > 0;

  return (
    <section className="mt-8" aria-label="Матрица двухклассовых матчапов HSReplay">
      <div className="flex items-end justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="font-hs text-lg sm:text-xl text-[#3d2208] tracking-wide">Матрица двухклассовых матчапов</h2>
          <p className="text-xs sm:text-sm text-[#7a5a35] mt-1">HSReplay: основной класс + сила героя второго класса</p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs"
          style={{
            background: 'linear-gradient(135deg,#3a2210,#2c1e16)',
            border: '1.5px solid #6b4c2a',
            color: '#e8d5a5',
            boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
          }}>
          <RefreshCw size={11} className="text-[#a88a45]" />
          <span>{data.updatedAt ? formatDate(data.updatedAt) : loading ? 'Загрузка…' : 'нет данных'}</span>
        </div>
      </div>

      {(error || data.warning) && (
        <div className="flex items-center gap-2 text-[#8b6c42] text-xs mb-3 px-3 py-2 rounded-lg bg-[#8b4513]/10 border border-[#8b4513]/20">
          <AlertTriangle size={13} /><span>Матрица временно не обновилась — показаны последние доступные данные</span>
        </div>
      )}

      <div className="rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(135deg,#f4e8cc,#e4c98f)',
          border: '1.5px solid #b8904a',
          boxShadow: 'inset 0 1px 3px rgba(139,69,19,0.18), 0 4px 10px rgba(0,0,0,0.14)',
        }}>
        {!hasMatchups ? (
          <div className="py-10 px-4 text-center text-sm text-[#7a5a35]">
            {loading ? 'Матрица загружается…' : 'Матрица матчапов пока недоступна'}
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-hs">
            <table className="w-full min-w-[920px] border-separate border-spacing-0">
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 z-20 text-left px-3 py-3 min-w-[168px]"
                    style={{
                      background: 'linear-gradient(135deg,#5a3000,#3d1e00)',
                      color: '#fcd34d',
                      borderRight: '1px solid rgba(252,211,77,0.25)',
                    }}>
                    <span className="block font-hs text-xs sm:text-sm leading-tight">Основной класс</span>
                    <span className="block text-[10px] text-[#d8bd73] leading-tight mt-0.5">сила героя →</span>
                  </th>
                  {visibleClasses.map(cls => (
                    <th key={cls.id} scope="col" className="px-2 py-2 text-center w-[68px]"
                      style={{
                        background: 'linear-gradient(135deg,#5a3000,#3d1e00)',
                        color: '#fcd34d',
                        borderLeft: '1px solid rgba(252,211,77,0.12)',
                      }}>
                      <img src={CLASS_ICON_BY_ID[cls.id]} alt={cls.name} title={cls.name}
                        className="w-8 h-8 mx-auto object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.45)]"
                        draggable={false}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleClasses.map((rowCls, rowIndex) => (
                  <tr key={rowCls.id}
                    style={{ background: rowIndex % 2 === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(80,42,12,0.06)' }}>
                    <th scope="row" className="sticky left-0 z-10 px-3 py-2 text-left"
                      style={{
                        background: rowIndex % 2 === 0
                          ? 'linear-gradient(135deg,#ead6a6,#dcc187)'
                          : 'linear-gradient(135deg,#e2c993,#d4b675)',
                        borderRight: '1px solid rgba(107,76,42,0.22)',
                      }}>
                      <div className="flex items-center gap-2 min-h-[44px]">
                        <img src={CLASS_ICON_BY_ID[rowCls.id]} alt="" className="w-8 h-8 object-contain flex-shrink-0"
                          draggable={false}
                        />
                        <span className="font-hs text-xs sm:text-sm text-[#3d2208] leading-tight">{rowCls.name}</span>
                      </div>
                    </th>
                    {visibleClasses.map(colCls => {
                      const matchup = matchupsByKey.get(`${rowCls.id}|${colCls.id}`);
                      const isSame = rowCls.id === colCls.id;
                      return (
                        <td key={`${rowCls.id}-${colCls.id}`} className="p-1.5 text-center align-middle">
                          <div className="h-11 min-w-[54px] rounded-lg flex items-center justify-center font-bold text-xs sm:text-sm"
                            title={matchup ? `${rowCls.name} + ${colCls.name}: ${matchup.winrate.toFixed(2)}%` : ''}
                            style={matchup && !isSame
                              ? getTone(matchup.winrate)
                              : {
                                  background: 'rgba(69,39,14,0.12)',
                                  border: '1px solid rgba(107,76,42,0.18)',
                                  color: '#8b6c42',
                                }}
                          >
                            {matchup && !isSame ? `${matchup.winrate.toFixed(1)}%` : '—'}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {hasMatchups && (
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[#6b4c2a]">
          <span className="px-2 py-1 rounded-full bg-[#2f7d46]/15 border border-[#2f7d46]/30">52%+ сильные пары</span>
          <span className="px-2 py-1 rounded-full bg-[#9a742d]/15 border border-[#9a742d]/30">50-52% ровные пары</span>
          <span className="px-2 py-1 rounded-full bg-[#7a2e2e]/15 border border-[#7a2e2e]/30">ниже 48% рискованные пары</span>
        </div>
      )}
    </section>
  );
}

function SubscriptionPurchaseButtons() {
  const items = [
    {
      href: BOOSTY_SUBSCRIPTION_URL,
      icon: '/ad/boosty.png',
      title: 'Оформить на Boosty',
      text: 'Уровень Любитель Арены и выше',
      background: 'linear-gradient(135deg, rgba(255,247,237,0.96), rgba(239,246,255,0.94))',
      border: '#f97316',
      glow: 'rgba(249,115,22,0.18)',
    },
    {
      href: TELEGRAM_TRIBUTE_URL,
      icon: '/ad/telegram.png',
      title: 'Оформить в Telegram',
      text: 'Подписка через Tribute',
      background: 'linear-gradient(135deg, rgba(239,246,255,0.98), rgba(224,242,254,0.94))',
      border: '#38bdf8',
      glow: 'rgba(56,189,248,0.20)',
    },
  ];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
      gap: '10px',
      margin: '0 0 14px',
    }}>
      {items.map(item => (
        <a
          key={item.href}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'grid',
            gridTemplateColumns: '42px 1fr auto',
            alignItems: 'center',
            gap: '10px',
            minHeight: 70,
            padding: '12px',
            borderRadius: '14px',
            border: `1.5px solid ${item.border}`,
            background: item.background,
            boxShadow: `0 14px 30px ${item.glow}, inset 0 1px 0 rgba(255,255,255,0.86)`,
            textDecoration: 'none',
            textAlign: 'left',
            transition: 'transform 160ms ease, box-shadow 160ms ease',
          }}
        >
          <span style={{
            width: 42,
            height: 42,
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            background: '#fff',
            boxShadow: '0 6px 14px rgba(15,23,42,0.14)',
          }}>
            <img src={item.icon} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} draggable={false} />
          </span>
          <span style={{ minWidth: 0 }}>
            <strong style={{ display: 'block', color: '#142238', fontSize: '14px', lineHeight: 1.2 }}>
              {item.title}
            </strong>
            <span style={{ display: 'block', color: '#52647a', fontSize: '12px', marginTop: '4px', lineHeight: 1.35 }}>
              {item.text}
            </span>
          </span>
          <span style={{
            width: 28,
            height: 28,
            borderRadius: '999px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#12233f',
            color: '#e5eefc',
            fontWeight: 800,
            flexShrink: 0,
          }}>
            →
          </span>
        </a>
      ))}
    </div>
  );
}

function PaywallGate({
  active,
  title,
  authUser,
  subscriptionStatus,
  subscriptionLoading,
  onRefreshSubscription,
  children,
}: {
  active: boolean;
  title: string;
  authUser: AuthUser | null;
  subscriptionStatus: SubscriptionStatus | null;
  subscriptionLoading: boolean;
  onRefreshSubscription: () => Promise<SubscriptionStatus | null>;
  children: React.ReactNode;
}) {
  if (!active) return <>{children}</>;
  const blockedContentProps = { 'aria-hidden': true, inert: '' } as unknown as React.HTMLAttributes<HTMLDivElement>;

  return (
    <div style={{
      position: 'relative',
      minHeight: 760,
      paddingBottom: 48,
    }}>
      <div {...blockedContentProps} style={{
        minHeight: 660,
        filter: 'blur(6px)',
        opacity: 0.55,
        pointerEvents: 'none',
        userSelect: 'none',
        transition: 'filter 180ms ease',
      }}>
        {children}
      </div>
      <div style={{
        position: 'absolute',
        inset: 0,
        minHeight: 720,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '48px 16px 72px',
        background: 'linear-gradient(180deg, rgba(238,243,255,0.22), rgba(238,243,255,0.72) 42%, rgba(238,243,255,0.96))',
        borderRadius: '14px',
      }}>
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="paywall-gate-title"
          aria-describedby="paywall-gate-description"
          style={{
          width: 'min(680px, 94%)',
          borderRadius: '14px',
          border: '1.5px solid #8fa7c8',
          background: 'linear-gradient(180deg, #f8faff, #e9f0fb)',
          boxShadow: '0 20px 46px rgba(15,23,42,0.24)',
          padding: '20px',
          textAlign: 'center',
        }}>
          <p style={{ margin: '0 0 6px', color: '#45617f', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Раздел для подписчиков
          </p>
          <h3 id="paywall-gate-title" style={{ margin: '0 0 10px', color: '#142238', fontFamily: 'var(--font-display)', fontSize: '1.25rem' }}>
            {title}
          </h3>
          <p id="paywall-gate-description" style={{ margin: '0 0 14px', color: '#42566f', fontSize: '13px', lineHeight: 1.55 }}>
            Подписка открывает закрытые инструменты Арены и помогает Манакосту держать данные свежими.
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: '10px',
            margin: '0 0 14px',
            textAlign: 'left',
          }}>
            <div style={{
              padding: '12px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, rgba(239,246,255,0.92), rgba(219,234,254,0.72))',
              border: '1px solid rgba(96,165,250,0.34)',
            }}>
              <strong style={{ display: 'block', color: '#142238', fontSize: '13px', marginBottom: '5px' }}>
                Платная статистика HSReplay
              </strong>
              <span style={{ color: '#4b5f78', fontSize: '12px', lineHeight: 1.45 }}>
                Удобный доступ к платным данным по Арене: тир-листы, винрейты и быстрые срезы по текущему патчу.
              </span>
            </div>
            <div style={{
              padding: '12px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, rgba(255,247,237,0.94), rgba(254,243,199,0.62))',
              border: '1px solid rgba(249,115,22,0.28)',
            }}>
              <strong style={{ display: 'block', color: '#142238', fontSize: '13px', marginBottom: '5px' }}>
                Авторские мета-отчёты
              </strong>
              <span style={{ color: '#4b5f78', fontSize: '12px', lineHeight: 1.45 }}>
                Разборы от топ-игрока и стримера Арены: что брать, чем играть и где сейчас преимущество.
              </span>
            </div>
          </div>
          <p style={{ margin: '0 0 16px', color: '#42566f', fontSize: '12px', lineHeight: 1.5 }}>
            Доступ откроется через Boosty уровня Любитель Арены и выше или через участие в VIP Telegram-канале.
          </p>
          <SubscriptionPurchaseButtons />
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {!authUser ? (
              <a href="/?login" style={{
                ...ADMIN_SECONDARY_BUTTON,
                textDecoration: 'none',
                background: 'linear-gradient(135deg,#12365d,#0a1c32)',
                color: '#e5f2ff',
                borderColor: '#60a5fa',
              }}>
                Войти в профиль
              </a>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => { void onRefreshSubscription(); }}
                  disabled={subscriptionLoading}
                  style={{
                    ...ADMIN_SECONDARY_BUTTON,
                    background: 'linear-gradient(135deg,#12365d,#0a1c32)',
                    color: '#e5f2ff',
                    borderColor: '#60a5fa',
                    cursor: subscriptionLoading ? 'wait' : 'pointer',
                  }}
                >
                  {subscriptionLoading ? 'Проверяем...' : 'Обновить подписку'}
                </button>
                <a href="/?login" style={{ ...ADMIN_SECONDARY_BUTTON, textDecoration: 'none', background: '#f8faff', color: '#1f3b63', borderColor: '#9db4d5' }}>
                  Открыть профиль
                </a>
              </>
            )}
          </div>
          {subscriptionStatus?.message && (
            <p style={{ margin: '12px 0 0', color: '#64748b', fontSize: '12px', lineHeight: 1.4 }}>
              {subscriptionStatus.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Winrates({ classes, loading, switching, error, updatedAt, winrateSource, onSourceChange, onNavigate, authUser, subscriptionStatus, subscriptionLoading, onRefreshSubscription }: {
  classes: ClassData[]; loading: boolean; switching: boolean; error: boolean;
  updatedAt: string | null;
  winrateSource: 'hsreplay' | 'firestone';
  onSourceChange: (src: 'hsreplay' | 'firestone') => void;
  onNavigate: (tab: string) => void;
  authUser: AuthUser | null;
  subscriptionStatus: SubscriptionStatus | null;
  subscriptionLoading: boolean;
  onRefreshSubscription: () => Promise<SubscriptionStatus | null>;
}) {
  // Trigger bar fill animation after mount
  const [barsVisible, setBarsVisible] = useState(false);
  useEffect(() => {
    if (!loading) {
      const t = setTimeout(() => setBarsVisible(true), 80);
      return () => clearTimeout(t);
    }
  }, [loading]);

  const maxWinrate = useMemo(() => Math.max(...classes.map(c => c.winrate), 1), [classes]);
  const paywallActive = !subscriptionLoading && !hasSubscriptionEntitlement(subscriptionStatus, 'arena');

  return (
    <div>
      <SectionBanner title="Классы" subtitle="Статистика побед на Арене — текущий патч" />
      <Breadcrumbs items={[
        { name: 'Главная', href: '/', onClick: () => onNavigate('home') },
        { name: 'Классы', href: '/classes' },
      ]} />
      <section aria-label="Описание раздела">
        <p className="text-[#6b4c2a] text-sm leading-relaxed mb-5 px-1"
          style={{ borderLeft: '3px solid #c4a46a', paddingLeft: '12px' }}>
          Винрейт классов на Арене Hearthstone показывает процент побед каждого из 11 классов.
          Данные основаны на миллионах реальных партий и обновляются автоматически каждые 6 часов.
          Рейтинг помогает выбрать лучший класс для драфта на текущем патче.
        </p>
      </section>
      <PaywallGate
        active={paywallActive}
        title="Подтвердите подписку Манакоста для доступа к классам"
        authUser={authUser}
        subscriptionStatus={subscriptionStatus}
        subscriptionLoading={subscriptionLoading}
        onRefreshSubscription={onRefreshSubscription}
      >
      {/* UpdateBadge row */}
      <div className="flex items-center justify-end mb-6 -mt-2">
        <UpdateBadge updatedAt={updatedAt} />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-[#8b6c42] text-xs mb-5 px-3 py-2 rounded-lg bg-[#8b4513]/10 border border-[#8b4513]/20">
          <AlertTriangle size={13} /><span>Нет соединения — показаны кэшированные данные</span>
        </div>
      )}

      <div className="space-y-2.5 sm:space-y-3 relative">
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl pointer-events-none"
          style={{
            background: 'rgba(237,224,192,0.6)',
            backdropFilter: switching && !loading ? 'blur(3px)' : 'blur(0px)',
            opacity: switching && !loading ? 1 : 0,
            transition: 'opacity 0.25s ease, backdrop-filter 0.25s ease',
          }}>
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl font-hs text-sm"
            style={{ background: 'linear-gradient(135deg,#5a3000,#3d1e00)', color: '#fcd34d',
              transform: switching && !loading ? 'scale(1)' : 'scale(0.9)',
              transition: 'transform 0.25s cubic-bezier(0.16,1,0.3,1)',
            }}>
            <RefreshCw size={14} style={{ animation: 'spin 0.8s linear infinite' }} />
            Загрузка HSReplay…
          </div>
        </div>
        {loading
          ? Array.from({ length: 11 }).map((_, i) => (
              <div key={i} className="skeleton h-16 sm:h-[72px] w-full" style={{ animationDelay: `${i * 0.06}s` }} />
            ))
          : classes.map((cls, index) => {
              const icon    = CLASS_ICON_BY_ID[cls.id];
              const barPct  = barsVisible ? Math.max((cls.winrate / maxWinrate) * 100, 6) : 0;
              const delay   = `${0.05 + index * 0.06}s`;
              const barDelay = `${0.2 + index * 0.06}s`;

              return (
                <div
                  key={cls.id}
                  className="anim-fade-up row-hover group relative flex items-center gap-3 sm:gap-4 rounded-2xl overflow-hidden cursor-default"
                  style={{
                    animationDelay: delay,
                    background: 'linear-gradient(135deg, #ede0c0 0%, #e2cfa0 50%, #d8c090 100%)',
                    border: '1.5px solid #c9a86c',
                    padding: '10px 14px',
                  }}
                >
                  {/* Class icon */}
                  {icon && (
                    <img src={icon} alt={cls.name}
                      className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]"
                      draggable={false}
                    />
                  )}

                  {/* Class name */}
                  <div className="flex-shrink-0 w-28 sm:w-40">
                    <span className="font-hs text-sm sm:text-base text-[#3d2208] tracking-wide leading-tight">
                      {cls.name}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="flex-grow relative h-7 sm:h-8 rounded-full overflow-hidden"
                    style={{
                      background: 'linear-gradient(180deg,#1a0e06 0%,#2c1a0e 100%)',
                      boxShadow: 'inset 0 3px 8px rgba(0,0,0,0.85), inset 0 -1px 2px rgba(255,255,255,0.05)',
                      border: '1.5px solid #0a0502',
                    }}>
                    {/* Fill */}
                    <div className="absolute inset-y-0 left-0 flex items-center overflow-hidden rounded-full"
                      style={{
                        width:      `${barPct}%`,
                        transition: `width 1.1s cubic-bezier(0.4, 0, 0.2, 1) ${barDelay}`,
                        backgroundImage: `linear-gradient(180deg, ${cls.color}ff 0%, ${cls.color}cc 100%)`,
                        boxShadow: `inset 0 2px 5px rgba(255,255,255,0.25), inset 0 -2px 5px rgba(0,0,0,0.35), 0 0 12px ${cls.color}66`,
                      }}>
                      {/* Shine stripe */}
                      <div className="absolute inset-x-0 top-0 h-[40%] rounded-t-full"
                        style={{ background: 'linear-gradient(180deg,rgba(255,255,255,0.3),transparent)' }} />
                      {/* Winrate label inside bar */}
                      <span className="relative z-10 pl-3 font-bold text-xs sm:text-sm tracking-wide"
                        style={{
                          color: cls.textDark ? 'rgba(0,0,0,0.85)' : '#fff',
                          textShadow: cls.textDark ? 'none' : '0 1px 4px rgba(0,0,0,0.9)',
                          opacity: barsVisible ? 1 : 0,
                          transition: `opacity 0.3s ease ${parseFloat(barDelay) + 0.6}s`,
                        }}>
                        {cls.winrate.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Games count */}
                  {(cls.games ?? 0) > 0 && (
                    <div className="flex-shrink-0 hidden lg:block text-right min-w-[88px]">
                      <span className="text-xs text-[#8b6c42] font-medium">
                        {cls.games!.toLocaleString('ru-RU')} игр
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
      </div>

      <InternalLinks links={[
        { label: 'Тир-лист карт →', href: '/tierlist', onClick: () => onNavigate('tierlist') },
        { label: 'Легендарки →', href: '/legendaries', onClick: () => onNavigate('legendaries') },
        { label: 'Статьи о Арене →', href: '/articles', onClick: () => onNavigate('articles') },
      ]} />
      </PaywallGate>
      <FAQSection />
    </div>
  );
}

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

function HSReplayCardsTable({ tiers, onCardOpen, previewSuppressed = false }: {
  tiers: Array<TierSection & { cards: CardData[] }>;
  onCardOpen: (card: CardData, tier: string) => void;
  previewSuppressed?: boolean;
}) {
  const canHoverPreview = useFineHoverPointer();
  const rows = useMemo(
    () => tiers.flatMap(tier => tier.cards.map(card => ({ tier: tier.tier, card }))),
    [tiers],
  );
  const [preview, setPreview] = useState<{ card: CardData; position: CardRenderTooltipPosition } | null>(null);
  const suppressPreviewRef = useRef(false);
  const hidePreview = useCallback(() => setPreview(null), []);
  const allowPreview = useCallback(() => {
    suppressPreviewRef.current = false;
  }, []);
  const hidePreviewAfterViewportShift = useCallback(() => {
    suppressPreviewRef.current = true;
    setPreview(null);
  }, []);
  const showPreview = useCallback((card: CardData, anchor: HTMLElement) => {
    if (previewSuppressed) return;
    if (!canHoverPreview) return;
    if (suppressPreviewRef.current) return;
    setPreview(current => (
      current?.card.cardId === card.cardId
        ? current
        : { card, position: getCardRenderTooltipPosition(anchor) }
    ));
  }, [canHoverPreview, previewSuppressed]);

  useEffect(() => {
    if (!preview) return;
    window.addEventListener('scroll', hidePreviewAfterViewportShift, true);
    window.addEventListener('resize', hidePreviewAfterViewportShift);
    return () => {
      window.removeEventListener('scroll', hidePreviewAfterViewportShift, true);
      window.removeEventListener('resize', hidePreviewAfterViewportShift);
    };
  }, [preview, hidePreviewAfterViewportShift]);

  useEffect(() => {
    if (!canHoverPreview) setPreview(null);
  }, [canHoverPreview]);

  useEffect(() => {
    if (previewSuppressed) setPreview(null);
  }, [previewSuppressed]);

  if (!rows.length) {
    return (
      <div className="text-center py-14 rounded-2xl"
        style={{ background: 'linear-gradient(135deg,#ede0c0,#e0cc9e)', border: '2px dashed #c4a46a' }}>
        <div className="text-4xl mb-3">🃏</div>
        <p className="text-xl font-hs text-[#8b4513] tracking-wide">Карты не найдены</p>
        <p className="text-[#8b6c42] mt-2 text-sm">Попробуйте изменить фильтры.</p>
      </div>
    );
  }

  return (
    <>
      {!previewSuppressed && preview && <CardRenderTooltip card={preview.card} position={preview.position} />}

      <div
        className="hsreplay-mobile-table sm:hidden flex flex-col gap-3"
        onMouseMoveCapture={allowPreview}
        onMouseLeave={hidePreview}
      >
        {rows.map(({ tier, card }, idx) => (
          <article
            key={`${tier}-${card.cardId}-${idx}-mobile`}
            className="rounded-xl border border-[#c4a46a]/70 bg-[#fff4d4]/85 p-2.5 shadow-[0_8px_22px_rgba(72,43,12,0.14)]"
          >
            <div className="flex items-center gap-2">
              <span className={`inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 text-xs font-hs shadow ${TIER_COLORS[tier] || TIER_COLORS.C}`}>
                {tier}
              </span>
              <div className="min-w-0 flex-1">
                <HSTableCardThumb
                  card={card}
                  onClick={() => onCardOpen(card, tier)}
                  onPreviewStart={showPreview}
                  onPreviewEnd={hidePreview}
                />
              </div>
            </div>

            <dl className="mt-2 grid grid-cols-2 gap-1.5">
              {MOBILE_TABLE_METRIC_KEYS.map(key => {
                const col = TABLE_METRIC_COLUMNS.find(item => item.key === key);
                if (!col) return null;
                const raw = key === 'deckWinrate' ? (card.deckWinrate ?? card.winrate) : card[key];
                const tone = key === 'arenaScore' ? metricTone(raw, 'score') : metricTone(raw, 'pct');
                return (
                  <div key={key} className="rounded-lg border border-[#c4a46a]/35 bg-[#f5e2b8]/70 px-2 py-1">
                    <dt className="text-[10px] font-bold uppercase leading-tight text-[#8b6c42]">{col.label}</dt>
                    <dd className={`mt-0.5 text-sm font-black leading-none ${tone}`}>{tableMetricValue(card, key)}</dd>
                  </div>
                );
              })}
            </dl>
          </article>
        ))}
      </div>

      <div
        className="hidden overflow-x-auto rounded-2xl border border-[#c4a46a]/70 bg-[#f5e2b8]/70 shadow-[0_10px_32px_rgba(72,43,12,0.18)] sm:block"
        onMouseMoveCapture={allowPreview}
        onMouseLeave={hidePreview}
        onScroll={hidePreviewAfterViewportShift}
      >
        <table className="min-w-[1060px] w-full border-collapse text-[13px]">
        <thead>
          <tr className="bg-gradient-to-r from-[#7a4a16] via-[#5a3000] to-[#7a4a16] text-[#ffe7a8]">
            <th className="sticky left-0 z-20 w-[340px] bg-[#6b3b0b] px-2.5 py-1.5 text-left font-hs text-xs tracking-wide">Карта</th>
            <th className="w-14 px-2 py-1.5 text-center font-hs text-xs tracking-wide">Tier</th>
            {TABLE_METRIC_COLUMNS.map(col => (
              <th key={col.key} className="px-2 py-1.5 text-right text-[10px] font-bold uppercase tracking-wide" title={col.hint}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ tier, card }, idx) => (
            <tr
              key={`${tier}-${card.cardId}-${idx}`}
              className="border-b border-[#c4a46a]/30 transition-colors odd:bg-[#fff6df]/80 even:bg-[#f3dfb5]/80 hover:bg-[#fff1c8]"
            >
              <td className="sticky left-0 z-10 bg-inherit px-2.5 py-1">
                <HSTableCardThumb
                  card={card}
                  onClick={() => onCardOpen(card, tier)}
                  onPreviewStart={showPreview}
                  onPreviewEnd={hidePreview}
                />
              </td>
              <td className="px-2 py-1 text-center">
                <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-hs shadow ${TIER_COLORS[tier] || TIER_COLORS.C}`}>
                  {tier}
                </span>
              </td>
              {TABLE_METRIC_COLUMNS.map(col => {
                const raw = col.key === 'deckWinrate' ? (card.deckWinrate ?? card.winrate) : card[col.key];
                const tone = col.key === 'arenaScore' ? metricTone(raw, 'score') : metricTone(raw, 'pct');
                return (
                  <td key={col.key} className={`px-2 py-1 text-right font-bold ${tone}`}>
                    {tableMetricValue(card, col.key)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        </table>
      </div>
    </>
  );
}

function TierList({ data, loading, error, companionIds, tierlistSource, onTierlistSourceChange, switchingTierlistSource, onNavigate, authUser, subscriptionStatus, subscriptionLoading, onRefreshSubscription }: {
  data: TierlistData; loading: boolean; error: boolean;
  companionIds: Set<string>;
  tierlistSource: TierlistSource;
  onTierlistSourceChange: (src: TierlistSource) => void;
  switchingTierlistSource: boolean;
  onNavigate: (tab: string) => void;
  authUser: AuthUser | null;
  subscriptionStatus: SubscriptionStatus | null;
  subscriptionLoading: boolean;
  onRefreshSubscription: () => Promise<SubscriptionStatus | null>;
}) {
  const [activeClassId, setActiveClassId] = useState<string>(ALL_CARDS_ID);
  const [searchQuery, setSearchQuery]     = useState('');
  const [selectedRarity, setSelectedRarity] = useState<string>('all');
  const [selectedManaCost, setSelectedManaCost] = useState<ManaFilterValue>('all');
  const [viewMode, setViewMode] = useState<TierlistViewMode>('gallery');
  const [modalCard, setModalCard] = useState<{ card: CardData; tier: string } | null>(null);
  const isSmallViewport = useSmallViewport();
  const canHoverPreview = useFineHoverPointer();
  const [galleryPreview, setGalleryPreview] = useState<{ card: CardData; position: CardTooltipPosition } | null>(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const normalizedSearchQuery = useMemo(
    () => deferredSearchQuery.trim().toLowerCase(),
    [deferredSearchQuery],
  );
  const cardPageSize = isSmallViewport ? INITIAL_TIERLIST_CARDS_MOBILE : INITIAL_TIERLIST_CARDS_DESKTOP;
  const cardPageStep = isSmallViewport ? TIERLIST_CARDS_STEP_MOBILE : TIERLIST_CARDS_STEP_DESKTOP;
  const [visibleCardLimit, setVisibleCardLimit] = useState(INITIAL_TIERLIST_CARDS_DESKTOP);

  const sections = data.sections;
  const cards    = data.cards;

  // Virtual "all cards" section — best tier per unique cardId across all sections
  const allCardsSection = useMemo(() => {
    const TIER_RANK: Record<string, number> = { S:6, A:5, B:4, C:3, D:2, E:1, F:0, U:-1 };
    const best = new Map<string, { card: TierCard; tier: string }>();
    const shouldHideCompanions = tierlistSource !== 'hsreplay';
    for (const sec of sections) {
      for (const tierGroup of sec.tiers) {
        for (const card of tierGroup.cards) {
          if (shouldHideCompanions && companionIds.has(card.cardId)) continue;
          const prev = best.get(card.cardId);
          if (!prev || (TIER_RANK[tierGroup.tier] ?? 0) > (TIER_RANK[prev.tier] ?? 0)) {
            best.set(card.cardId, { card, tier: tierGroup.tier });
          }
        }
      }
    }
    // Group deduplicated cards by tier
    const tierMap = new Map<string, TierCard[]>();
    for (const { card, tier } of best.values()) {
      if (!tierMap.has(tier)) tierMap.set(tier, []);
      tierMap.get(tier)!.push(card);
    }
    const tierOrder = ['S','A','B','C','D','E','F','U'];
    return {
      id: ALL_CARDS_ID, name: 'Все карты', color: '#5a3000',
      totalCards: best.size,
      tiers: tierOrder
        .filter(t => tierMap.has(t))
        .map(t => ({
          tier: t, label: TIER_LABEL_FULL[t] ?? t,
          description: TIER_DESC_MAP[t] ?? '',
          cards: tierMap.get(t)!,
        })),
    };
  }, [sections, companionIds, tierlistSource]);

  // Find active section (virtual "all" or real class)
  const activeSection = activeClassId === ALL_CARDS_ID
    ? allCardsSection
    : (sections.find(s => s.id === activeClassId) ?? sections[0]);

  // When class changes, reset filters
  const handleClassChange = (id: string) => {
    setActiveClassId(id);
    setSearchQuery('');
    setSelectedRarity('all');
    setSelectedManaCost('all');
  };

  const isNeutralTab    = activeClassId === 'any';
  const isAllCardsTab   = activeClassId === ALL_CARDS_ID;
  const canUseTableView = tierlistSource === 'hsreplay';
  const hideGalleryPreview = useCallback(() => setGalleryPreview(null), []);
  const showGalleryPreview = useCallback((card: CardData, anchor: HTMLElement) => {
    if (!canHoverPreview) return;
    setGalleryPreview(current => (
      current?.card.cardId === card.cardId
        ? current
        : { card, position: getCardStatsTooltipPosition(anchor) }
    ));
  }, [canHoverPreview]);

  useEffect(() => {
    if (!canUseTableView && viewMode === 'table') setViewMode('gallery');
  }, [canUseTableView, viewMode]);

  useEffect(() => {
    if (!galleryPreview) return;
    window.addEventListener('scroll', hideGalleryPreview, true);
    window.addEventListener('resize', hideGalleryPreview);
    return () => {
      window.removeEventListener('scroll', hideGalleryPreview, true);
      window.removeEventListener('resize', hideGalleryPreview);
    };
  }, [galleryPreview, hideGalleryPreview]);

  useEffect(() => {
    if (!canHoverPreview) setGalleryPreview(null);
  }, [canHoverPreview]);

  useEffect(() => {
    if (modalCard) setGalleryPreview(null);
  }, [modalCard]);

  useEffect(() => {
    setGalleryPreview(null);
  }, [viewMode, tierlistSource, activeClassId, selectedRarity, selectedManaCost, normalizedSearchQuery]);

  useEffect(() => {
    setVisibleCardLimit(cardPageSize);
  }, [cardPageSize, activeClassId, selectedRarity, selectedManaCost, normalizedSearchQuery, tierlistSource, viewMode]);

  const filteredTiers = useMemo(() =>
    (activeSection?.tiers ?? []).map(t => ({
      ...t,
      cards: t.cards
        .map(tc => mergeCard(tc, cards))
        .filter(c => {
          const matchSearch = !normalizedSearchQuery || c.name.toLowerCase().includes(normalizedSearchQuery);
          const matchRarity = selectedRarity === 'all' || c.rarity === selectedRarity;
          const matchMana = selectedManaCost === 'all'
            || (typeof c.cost === 'number' && (selectedManaCost === 10 ? c.cost >= 10 : c.cost === selectedManaCost));
          const matchClass  = isNeutralTab ? true : isAllCardsTab ? true : c.classKey !== 'any';
          const isLegendaryCompanion = tierlistSource !== 'hsreplay' && c.rarity === 'legendary' && companionIds.has(c.cardId);
          return matchSearch && matchRarity && matchMana && matchClass && !isLegendaryCompanion;
        })
    })).filter(t => t.cards.length > 0),
  [activeSection, normalizedSearchQuery, selectedRarity, selectedManaCost, isNeutralTab, isAllCardsTab, companionIds, cards, tierlistSource]);

  const totalFilteredCards = useMemo(
    () => filteredTiers.reduce((sum, tier) => sum + tier.cards.length, 0),
    [filteredTiers],
  );

  const visibleTiers = useMemo(() => {
    let remaining = visibleCardLimit;
    return filteredTiers
      .map(tier => {
        const visibleCards = remaining > 0 ? tier.cards.slice(0, remaining) : [];
        remaining -= visibleCards.length;
        return {
          ...tier,
          cards: visibleCards,
          totalCardsInTier: tier.cards.length,
        };
      })
      .filter(tier => tier.cards.length > 0);
  }, [filteredTiers, visibleCardLimit]);

  const visibleCardCount = useMemo(
    () => visibleTiers.reduce((sum, tier) => sum + tier.cards.length, 0),
    [visibleTiers],
  );
  const hiddenCardCount = Math.max(0, totalFilteredCards - visibleCardCount);
  const paywallActive = !subscriptionLoading && !hasSubscriptionEntitlement(subscriptionStatus, 'arena');

  return (
    <div>
      <SectionBanner title="Тир-лист" subtitle="Оценки карт для каждого класса — текущий патч" />
      <Breadcrumbs items={[
        { name: 'Главная', href: '/', onClick: () => onNavigate('home') },
        { name: 'Тир-лист', href: '/tierlist' },
      ]} />
      <section aria-label="Описание раздела">
        <p className="text-[#6b4c2a] text-sm leading-relaxed mb-5 px-1"
          style={{ borderLeft: '3px solid #c4a46a', paddingLeft: '12px' }}>
          Тир-лист карт Арены Hearthstone — рейтинг всех карт по классам с оценками от S (авто-пик) до F (не брать).
          Выберите класс, чтобы увидеть лучшие карты для текущего патча.
          Данные обновляются автоматически на основе HSReplay, HearthArena и Firestone.
        </p>
      </section>
      <PaywallGate
        active={paywallActive}
        title="Подтвердите подписку Манакоста для доступа к тир-листу"
        authUser={authUser}
        subscriptionStatus={subscriptionStatus}
        subscriptionLoading={subscriptionLoading}
        onRefreshSubscription={onRefreshSubscription}
      >
      {/* Source toggle + UpdateBadge row */}
      <div className="tierlist-source-row flex items-center justify-between mb-4 -mt-2 flex-wrap gap-2">
        {/* Source switcher */}
        <div
          className="tierlist-source-toggle dashboard-filter-shell flex items-center gap-1 p-1 rounded-xl"
          role="group"
          aria-label="Источник данных тир-листа"
        >
          {TIERLIST_SOURCES.map(src => {
            const active = tierlistSource === src;
            return (
              <SourceToggleButton
                key={src}
                source={src}
                label={TIERLIST_SOURCE_LABEL[src]}
                active={active}
                busy={switchingTierlistSource}
                onClick={() => { if (!active && !switchingTierlistSource) onTierlistSourceChange(src); }}
              />
            );
          })}
        </div>
        <UpdateBadge updatedAt={data.updatedAt} />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-[#8b6c42] text-xs mb-4 opacity-70">
          <AlertTriangle size={13} /><span>Сервер недоступен — показаны кэшированные данные</span>
        </div>
      )}

      {/* External dataset warning */}
      {data.warning && !loading && (
        <div className="flex items-center gap-3 mb-5 px-4 py-3 rounded-2xl"
          style={{ background: 'linear-gradient(135deg,#1a2a3a,#0f1e2d)', border: '1.5px solid rgba(96,165,250,0.35)' }}>
          <AlertTriangle size={15} style={{ color: '#93c5fd', flexShrink: 0 }} />
          <span style={{ color: '#bfdbfe', fontSize: '13px' }}>
            Внешний источник временно недоступен — показан последний сохраненный срез
          </span>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center py-20 gap-5">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-4 border-[#a88a45]/20" />
            <div className="absolute inset-0 rounded-full border-4 border-t-[#fcd34d] border-r-transparent border-b-transparent border-l-transparent"
              style={{ animation: 'spin 1s linear infinite' }} />
            <div className="absolute inset-2 rounded-full border-2 border-t-transparent border-r-[#a88a45]/60 border-b-transparent border-l-transparent"
              style={{ animation: 'spin 0.7s linear infinite reverse' }} />
          </div>
          <p className="font-hs text-[#6b4c2a] text-xl tracking-wide">Загрузка тир-листа…</p>
          <p className="text-[#8b6c42] text-sm">Получаем данные из API статистики</p>
        </div>
      ) : (
        <>
          {/* Nav bar: class icons + search */}
          <div className="mb-5">
            <ClassTabs
              sections={sections}
              activeId={activeClassId}
              onChange={handleClassChange}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />
          </div>

          {/* Active class header + rarity filter */}
          <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
            {activeSection && (
              <div className="flex items-center gap-3">
                {CLASS_ICON[activeSection.id] ? (
                  <img src={CLASS_ICON[activeSection.id]} alt={activeSection.name}
                    className="w-9 h-9 object-contain drop-shadow-md" />
                ) : (
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-lg"
                    style={{ background: activeSection.color }}>⚔</div>
                )}
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-hs text-lg sm:text-xl text-[#4a3018] leading-tight">{activeSection.name}</h3>
                    {activeSection.classPosition && (
                      <span className="tierlist-class-position text-[11px] sm:text-xs px-2 py-0.5 rounded-full">
                        Позиция: {activeSection.classPosition}
                      </span>
                    )}
                  </div>
                  <span className="text-[#8b6c42] text-xs">
                    {isAllCardsTab
                      ? `${allCardsSection.totalCards} уникальных карт`
                      : isNeutralTab
                        ? `${activeSection.totalCards} нейтральных карт`
                        : `${activeSection.tiers.flatMap(t => t.cards).filter(c => c.classKey !== 'any').length} карт класса`}
                  </span>
                </div>
              </div>
            )}
            <div className="tierlist-control-panel flex items-center gap-2 flex-wrap justify-end">
              {canUseTableView && (
                <div
                  className="tierlist-view-toggle dashboard-filter-shell flex items-center gap-1 p-1 rounded-xl flex-shrink-0"
                  role="group"
                  aria-label="Вид тир-листа"
                >
                  {([
                    { id: 'gallery' as const, label: 'Галерея', icon: Grid3X3 },
                    { id: 'table' as const, label: 'Таблица', icon: List },
                  ]).map(item => {
                    const active = viewMode === item.id;
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setViewMode(item.id)}
                        aria-pressed={active}
                        data-active={active ? 'true' : 'false'}
                        className="dashboard-filter-button flex min-h-[34px] items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-hs transition-all"
                      >
                        <Icon size={14} />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {/* Rarity filter — icon buttons */}
              <div
                className="tierlist-rarity-filter dashboard-filter-shell flex items-center gap-1 p-1 rounded-xl flex-shrink-0"
                role="group"
                aria-label="Фильтр по редкости"
              >
                {RARITY_OPTIONS.map(r => {
                  const active = selectedRarity === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelectedRarity(r.id)}
                      title={r.name}
                      aria-label={r.name}
                      aria-pressed={active}
                      data-active={active ? 'true' : 'false'}
                      className="dashboard-filter-button tierlist-icon-filter-button flex items-center justify-center rounded-lg transition-all"
                      style={{
                        padding: r.icon ? '4px' : '4px 10px',
                      }}
                    >
                      {r.icon
                        ? <img src={r.icon} alt={r.name} className="w-6 h-6 object-contain"
                            draggable={false} />
                        : <span className="tierlist-filter-label font-hs text-xs">Все</span>
                      }
                    </button>
                  );
                })}
              </div>
              <div
                className="tierlist-mana-filter dashboard-filter-shell flex max-w-full items-center gap-1 overflow-x-auto p-1 rounded-xl flex-shrink-0"
                role="group"
                aria-label="Фильтр по мане"
              >
                {MANA_FILTER_OPTIONS.map(mana => {
                  const active = selectedManaCost === mana.id;
                  const isAll = mana.id === 'all';
                  return (
                    <button
                      key={String(mana.id)}
                      type="button"
                      onClick={() => setSelectedManaCost(mana.id)}
                      title={mana.name}
                      aria-label={mana.name}
                      aria-pressed={active}
                      data-active={active ? 'true' : 'false'}
                      className={`dashboard-filter-button tierlist-icon-filter-button relative flex h-8 items-center justify-center rounded-lg transition-all ${isAll ? 'w-11 px-2' : 'w-8 flex-shrink-0'}`}
                    >
                      {isAll ? (
                        <span className="tierlist-filter-label font-hs text-xs leading-none">
                          Все
                        </span>
                      ) : (
                        <>
                          <img
                            src={MANA_ICON}
                            alt=""
                            aria-hidden="true"
                            className="absolute inset-0 m-auto h-8 w-8 object-contain"
                            draggable={false}
                          />
                          <span className={`relative font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,1)] ${mana.id === 10 ? 'text-[8px]' : 'text-[11px]'}`}>
                            {mana.label}
                          </span>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Tiers */}
          {canUseTableView && viewMode === 'table' ? (
            <HSReplayCardsTable
              tiers={visibleTiers}
              onCardOpen={(card, tier) => setModalCard({ card, tier })}
              previewSuppressed={Boolean(modalCard)}
            />
          ) : (
          <div className="space-y-10">
            {visibleTiers.length > 0 ? visibleTiers.map((tierGroup, tierIdx) => {
              const tierTotal = tierGroup.totalCardsInTier ?? tierGroup.cards.length;
              return (
              <div key={tierGroup.tier} className="anim-fade-up"
                style={{
                  animationDelay: `${tierIdx * 0.07}s`,
                }}>
                {/* Tier header */}
                <div className="flex items-center gap-4 mb-5">
                  <div className={`tier-rank-badge w-12 h-12 md:w-14 md:h-14 flex-shrink-0 flex items-center justify-center text-2xl md:text-3xl font-hs rounded-full border-[3px] shadow-[0_4px_14px_rgba(0,0,0,0.7),inset_0_4px_6px_rgba(255,255,255,0.35),inset_0_-4px_6px_rgba(0,0,0,0.45)] ${TIER_COLORS[tierGroup.tier] || TIER_COLORS['C']}`}>
                    <span className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">{tierGroup.tier}</span>
                  </div>
                  <div className="flex-grow">
                    <div className="flex items-baseline gap-2">
                      <h3 className="text-xl md:text-2xl font-hs text-[#3d2208] tracking-wide">{TIER_LABEL_FULL[tierGroup.tier] ?? tierGroup.label}</h3>
                      <span className="text-xs font-medium text-[#8b6c42] bg-[#8b6c42]/10 px-2 py-0.5 rounded-full border border-[#8b6c42]/20">
                        {tierGroup.cards.length === tierTotal
                          ? `${tierGroup.cards.length} карт`
                          : `${tierGroup.cards.length} из ${tierTotal} карт`}
                      </span>
                    </div>
                    <p className="text-sm text-[#6b4c2a] mt-0.5">{tierGroup.description}</p>
                  </div>
                </div>

                {/* Cards grid — cards are already merged in filteredTiers useMemo */}
                <div className="flex flex-wrap gap-3 md:gap-5 justify-center md:justify-start">
                  {tierGroup.cards.map((card, idx) => (
                    <div
                      key={`${card.cardId}-${idx}`}
                      className="anim-scale-in"
                      style={{
                        // Cap animation delay: past 20 cards the stagger is imperceptible
                        animationDelay: idx < 20 ? `${tierIdx * 0.05 + idx * 0.015}s` : '0s',
                      }}
                    >
                      <HSCard
                        card={card}
                        onClick={() => setModalCard({ card, tier: tierGroup.tier })}
                        previewEnabled={canHoverPreview && viewMode === 'gallery'}
                        onPreviewStart={showGalleryPreview}
                        onPreviewEnd={hideGalleryPreview}
                      />
                    </div>
                  ))}
                </div>
              </div>
              );
            }) : (
              <div className="text-center py-14 rounded-2xl"
                style={{ background: 'linear-gradient(135deg,#ede0c0,#e0cc9e)', border: '2px dashed #c4a46a' }}>
                <div className="text-4xl mb-3">🃏</div>
                <p className="text-xl font-hs text-[#8b4513] tracking-wide">Карты не найдены</p>
                <p className="text-[#8b6c42] mt-2 text-sm">Попробуйте изменить фильтры.</p>
              </div>
            )}
          </div>
          )}

          {hiddenCardCount > 0 && (
            <div className="mt-6 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => setVisibleCardLimit(limit => limit + cardPageStep)}
                className="rounded-xl px-5 py-2.5 font-hs text-sm transition-all"
                style={{
                  background: 'linear-gradient(135deg,#5a3000,#3d1e00)',
                  color: '#fcd34d',
                  border: '1.5px solid #b8904a',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.28)',
                }}
              >
                Показать ещё {Math.min(cardPageStep, hiddenCardCount)}
              </button>
              <span className="text-xs text-[#8b6c42]">
                Показано {visibleCardCount} из {totalFilteredCards}
              </span>
            </div>
          )}
        </>
      )}

      {!modalCard && galleryPreview && <CardStatsTooltip card={galleryPreview.card} position={galleryPreview.position} />}

      {modalCard && (
        <CardModal card={modalCard.card} tier={modalCard.tier} onClose={() => setModalCard(null)} />
      )}

      <InternalLinks links={[
        { label: 'Винрейт классов →', href: '/classes', onClick: () => onNavigate('winrates') },
        { label: 'Легендарки →', href: '/legendaries', onClick: () => onNavigate('legendaries') },
        { label: 'Статьи о Арене →', href: '/articles', onClick: () => onNavigate('articles') },
      ]} />
      </PaywallGate>
      <FAQSection />
    </div>
  );
}

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

function Legendaries({ data, loading, error, legendarySource, onLegendarySourceChange, switchingLegendarySource, onNavigate, authUser, subscriptionStatus, subscriptionLoading, onRefreshSubscription }: {
  data: LegendariesData; loading: boolean; error: boolean;
  legendarySource: LegendarySource;
  onLegendarySourceChange: (src: LegendarySource) => void;
  switchingLegendarySource: boolean;
  onNavigate: (tab: string) => void;
  authUser: AuthUser | null;
  subscriptionStatus: SubscriptionStatus | null;
  subscriptionLoading: boolean;
  onRefreshSubscription: () => Promise<SubscriptionStatus | null>;
}) {
  const [activeClass, setActiveClass] = useState<string>('all');
  const [modalCard, setModalCard] = useState<{ card: CardData; tier: string } | null>(null);
  const classScrollRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const groups = data.groups ?? [];
    const base = activeClass === 'all' ? groups : groups.filter(g => g.classKey === activeClass);
    return [...base].sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0));
  }, [data.groups, activeClass]);

  const toLegendaryCardData = useCallback((lc: LegendaryCard): CardData => ({
    name:     lc.name,
    score:    0,
    rarity:   lc.rarity ?? 'legendary',
    cardId:   lc.cardId,
    classKey: lc.classKey ?? 'any',
    source:   lc.source,
    statsContext: lc.statsContext,
    type:     lc.type,
    winrate:  lc.winrate,
    deckWinrate: lc.deckWinrate,
    pickRate: lc.pickRate,
    playedWinrate: lc.playedWinrate,
    inDecks: lc.inDecks,
    arenaScore: lc.arenaScore,
    offerRate: lc.offerRate,
    discardRate: lc.discardRate,
    drawnWinrate: lc.drawnWinrate,
    mulliganWinrate: lc.mulliganWinrate,
    keptRate: lc.keptRate,
    avgCopies: lc.avgCopies,
    totalGames: lc.totalGames,
    cost:     lc.cost,
    imageHa:  lc.imageHa,
    imageRu:  lc.imageRu ?? null,
  }), []);
  const paywallActive = !subscriptionLoading && !hasSubscriptionEntitlement(subscriptionStatus, 'arena');

  return (
    <div>
      <SectionBanner title="Легендарки" subtitle="Наборы карт для выбора первой легендарки на Арене" />
      <Breadcrumbs items={[
        { name: 'Главная', href: '/', onClick: () => onNavigate('home') },
        { name: 'Легендарки', href: '/legendaries' },
      ]} />
      <section aria-label="Описание раздела">
        <p className="text-[#6b4c2a] text-sm leading-relaxed mb-5 px-1"
          style={{ borderLeft: '3px solid #c4a46a', paddingLeft: '12px' }}>
          На Арене Hearthstone легендарная карта предлагается в качестве первого выбора.
          На этой странице собраны все группы первого выбора с винрейтом каждой группы.
          Выбирайте группу с наивысшим процентом побед для максимальной эффективности на текущем патче.
        </p>
      </section>
      <div style={{ position: 'relative' }}>
        <div style={{
          filter: paywallActive ? 'blur(7px)' : 'none',
          pointerEvents: paywallActive ? 'none' : 'auto',
          userSelect: paywallActive ? 'none' : 'auto',
          transition: 'filter 180ms ease',
        }}>
      {/* Source toggle + count row */}
      <div className="flex items-center justify-between mb-4 -mt-2 flex-wrap gap-2">
        <div className="legendary-source-toggle flex items-center gap-1 p-1 rounded-xl"
          style={{ background: 'linear-gradient(135deg,#e8d5a0,#d4b87a)', border: '1.5px solid #b8904a' }}>
          {(['hsreplay', 'firestone'] as const).map(src => {
            const active = legendarySource === src;
            return (
              <SourceToggleButton
                key={src}
                source={src}
                label={LEGENDARY_SOURCE_LABEL[src]}
                active={active}
                busy={switchingLegendarySource}
                onClick={() => { if (!active && !switchingLegendarySource) onLegendarySourceChange(src); }}
              />
            );
          })}
        </div>
        <div className="legendary-count-pill text-sm font-bold px-3 py-1.5 rounded-full flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#ede0c0,#e0cc9e)', border: '1.5px solid #c4a46a' }}>
          {filtered.length} групп
        </div>
      </div>

      {/* Class filter nav */}
      <div className="mb-5">
        <div
          ref={classScrollRef}
          className="legendary-class-tabs flex items-center gap-1.5 sm:gap-2 px-3 py-2.5 rounded-2xl overflow-x-auto scrollbar-hs"
          style={{
            background: 'linear-gradient(135deg,#f4e8cc,#ede0c0)',
            border: '1.5px solid #c4a46a',
            boxShadow: 'inset 0 1px 3px rgba(139,69,19,0.15), 0 2px 6px rgba(0,0,0,0.12)',
          }}
        >
          {LEGEND_CLASSES.map(cls => {
            const isActive = cls.id === activeClass;
            const iconSrc = cls.id !== 'all' && cls.id !== 'any' ? CLASS_ICON[cls.id] : null;
            return (
              <button
                key={cls.id}
                onClick={() => setActiveClass(cls.id)}
                title={cls.name}
                className="flex-shrink-0 relative transition-all duration-200"
                style={{ transform: isActive ? 'scale(1.15)' : 'scale(1)', filter: isActive ? 'none' : 'grayscale(0.2) brightness(0.85)' }}
              >
                <div
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center overflow-hidden"
                  style={{
                    background: `radial-gradient(circle at 35% 35%, ${cls.color}ff, ${cls.color}aa)`,
                    boxShadow: isActive
                      ? `0 0 0 2.5px #fcd34d, 0 0 10px rgba(252,211,77,0.55), 0 3px 8px rgba(0,0,0,0.45)`
                      : `0 0 0 1.5px rgba(0,0,0,0.35), 0 2px 5px rgba(0,0,0,0.3), inset 0 1px 2px rgba(255,255,255,0.2)`,
                  }}
                >
                  {cls.id === 'all' ? (
                    <Star size={16} className="text-[#fcd34d]" />
                  ) : iconSrc ? (
                    <img src={iconSrc} alt={cls.name} className="w-6 h-6 sm:w-7 sm:h-7 object-contain" draggable={false} />
                  ) : (
                    <span className="text-white/80 text-sm font-hs">⚔</span>
                  )}
                </div>
                {isActive && (
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#fcd34d]"
                    style={{ boxShadow: '0 0 4px rgba(252,211,77,0.8)' }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-[#8b6c42] text-xs mb-5 px-3 py-2 rounded-lg bg-[#8b4513]/10 border border-[#8b4513]/20">
          <AlertTriangle size={13} /><span>Нет данных — возможно, scraper ещё не запущен</span>
        </div>
      )}

      {data.warning && !loading && (
        <div className="flex items-center gap-2 text-[#8b6c42] text-xs mb-5 px-3 py-2 rounded-lg bg-[#1a2a3a]/10 border border-[#60a5fa]/20">
          <AlertTriangle size={13} /><span>Внешний источник временно недоступен — показан последний сохраненный срез</span>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="skeleton h-64 w-full rounded-2xl" style={{ animationDelay: `${i * 0.05}s` }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-14 rounded-2xl"
          style={{ background: 'linear-gradient(135deg,#ede0c0,#e0cc9e)', border: '2px dashed #c4a46a' }}>
          <div className="text-4xl mb-3">⭐</div>
          <p className="text-xl font-hs text-[#8b4513] tracking-wide">Нет данных</p>
          <p className="text-[#8b6c42] mt-2 text-sm">Запустите npm run scrape для загрузки легендарных групп.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((group, idx) => (
            <div
              key={`${group.keyCard.cardId}-${idx}`}
              className="legendary-group-card anim-scale-in card-hover rounded-2xl flex flex-col items-center p-4 gap-3 cursor-default"
              style={{
                animationDelay: `${Math.min(idx, 20) * 0.04}s`,
                background: 'linear-gradient(145deg,#ede0c0,#e0cc9e)',
                border: '1.5px solid #c4a46a',
              }}
            >
              {/* Key card image */}
              <LegendaryCardThumb
                card={group.keyCard}
                size="lg"
                onClick={() => setModalCard({ card: toLegendaryCardData(group.keyCard), tier: 'S' })}
              />

              {/* Key card name + win rate */}
              <div className="flex flex-col items-center gap-1 w-full">
                <span className="font-hs text-[#3d2208] text-base text-center leading-tight">{group.keyCard.name}</span>
                <span
                  className="legendary-winrate-badge px-3 py-1 rounded-full text-white text-xs font-bold shadow-md"
                  style={{ background: winRateBadgeColor(group.winRate) }}
                >
                  {group.winRate != null ? `${group.winRate.toFixed(1)}%` : '—'} винрейт
                </span>
              </div>

              {group.cards.length > 0 && (
                <>
                  {/* Divider */}
                  <div className="legendary-group-divider w-full h-px" />

                  {/* Package cards */}
                  <div className="flex gap-2 justify-center flex-wrap">
                    {group.cards.map((pc, ci) => (
                      <div key={`${pc.cardId}-${ci}`} className="flex flex-col items-center gap-0.5">
                        <LegendaryCardThumb
                          card={pc}
                          size="sm"
                          onClick={() => setModalCard({ card: toLegendaryCardData(pc), tier: 'C' })}
                        />
                        <span className="text-[9px] text-[#6b4c2a] text-center leading-tight max-w-[80px]">{pc.name}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {modalCard && (
        <CardModal card={modalCard.card} tier={modalCard.tier} onClose={() => setModalCard(null)} />
      )}

      <InternalLinks links={[
        { label: 'Тир-лист карт →', href: '/tierlist', onClick: () => onNavigate('tierlist') },
        { label: 'Винрейт классов →', href: '/classes', onClick: () => onNavigate('winrates') },
        { label: 'Статьи о Арене →', href: '/articles', onClick: () => onNavigate('articles') },
      ]} />
        </div>
        {paywallActive && (
          <div style={{
            position: 'absolute',
            inset: 0,
            minHeight: 420,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            paddingTop: 84,
            background: 'linear-gradient(180deg, rgba(238,243,255,0.10), rgba(238,243,255,0.62) 42%, rgba(238,243,255,0.86))',
            borderRadius: '14px',
          }}>
            <div style={{
              width: 'min(680px, 94%)',
              borderRadius: '14px',
              border: '1.5px solid #8fa7c8',
              background: 'linear-gradient(180deg, #f8faff, #e9f0fb)',
              boxShadow: '0 20px 46px rgba(15,23,42,0.24)',
              padding: '20px',
              textAlign: 'center',
            }}>
              <p style={{ margin: '0 0 6px', color: '#45617f', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Раздел для подписчиков
              </p>
              <h3 style={{ margin: '0 0 10px', color: '#142238', fontFamily: 'var(--font-display)', fontSize: '1.25rem' }}>
                Подтвердите подписку Манакоста
              </h3>
              <p style={{ margin: '0 0 14px', color: '#42566f', fontSize: '13px', lineHeight: 1.55 }}>
                Подписка открывает закрытые инструменты Арены и помогает Манакосту держать данные свежими.
              </p>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                gap: '10px',
                margin: '0 0 14px',
                textAlign: 'left',
              }}>
                <div style={{
                  padding: '12px',
                  borderRadius: '14px',
                  background: 'linear-gradient(135deg, rgba(239,246,255,0.92), rgba(219,234,254,0.72))',
                  border: '1px solid rgba(96,165,250,0.34)',
                }}>
                  <strong style={{ display: 'block', color: '#142238', fontSize: '13px', marginBottom: '5px' }}>
                    Платная статистика HSReplay
                  </strong>
                  <span style={{ color: '#4b5f78', fontSize: '12px', lineHeight: 1.45 }}>
                    Удобный доступ к платным данным по Арене: тир-листы, винрейты и быстрые срезы по текущему патчу.
                  </span>
                </div>
                <div style={{
                  padding: '12px',
                  borderRadius: '14px',
                  background: 'linear-gradient(135deg, rgba(255,247,237,0.94), rgba(254,243,199,0.62))',
                  border: '1px solid rgba(249,115,22,0.28)',
                }}>
                  <strong style={{ display: 'block', color: '#142238', fontSize: '13px', marginBottom: '5px' }}>
                    Авторские мета-отчёты
                  </strong>
                  <span style={{ color: '#4b5f78', fontSize: '12px', lineHeight: 1.45 }}>
                    Разборы от топ-игрока и стримера Арены: что брать, чем играть и где сейчас преимущество.
                  </span>
                </div>
              </div>
              <p style={{ margin: '0 0 16px', color: '#42566f', fontSize: '12px', lineHeight: 1.5 }}>
                Доступ откроется через Boosty уровня Любитель Арены и выше или через участие в VIP Telegram-канале.
              </p>
              <SubscriptionPurchaseButtons />
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                {!authUser ? (
                  <a href="/?login" style={{
                    ...ADMIN_SECONDARY_BUTTON,
                    textDecoration: 'none',
                    background: 'linear-gradient(135deg,#12365d,#0a1c32)',
                    color: '#e5f2ff',
                    borderColor: '#60a5fa',
                  }}>
                    Войти в профиль
                  </a>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => { void onRefreshSubscription(); }}
                      disabled={subscriptionLoading}
                      style={{
                        ...ADMIN_SECONDARY_BUTTON,
                        background: 'linear-gradient(135deg,#12365d,#0a1c32)',
                        color: '#e5f2ff',
                        borderColor: '#60a5fa',
                        cursor: subscriptionLoading ? 'wait' : 'pointer',
                      }}
                    >
                      {subscriptionLoading ? 'Проверяем...' : 'Обновить подписку'}
                    </button>
                    <a href="/?login" style={{ ...ADMIN_SECONDARY_BUTTON, textDecoration: 'none', background: '#f8faff', color: '#1f3b63', borderColor: '#9db4d5' }}>
                      Открыть профиль
                    </a>
                  </>
                )}
              </div>
              {subscriptionStatus?.message && (
                <p style={{ margin: '12px 0 0', color: '#64748b', fontSize: '12px', lineHeight: 1.4 }}>
                  {subscriptionStatus.message}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

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
const MANACOST_AVATAR_URL = '/assets/manacost-avatar.jpeg';
const BOOSTY_SUBSCRIPTION_URL = 'https://boosty.to/kolodahearthstone';
const TELEGRAM_TRIBUTE_URL = 'https://web.tribute.tg/s/xz9';
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

function authInitials(user: Pick<AuthUser, 'name' | 'email' | 'avatarInitials'>): string {
  const raw = user.avatarInitials || user.name || user.email;
  return raw
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || 'HS';
}

function AuthAvatar({ user, size = 52 }: { user: AuthUser; size?: number }) {
  const avatarSrc = user.photoUrl || MANACOST_AVATAR_URL;
  return (
    <span style={{
      width: size,
      height: size,
      borderRadius: '50%',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      background: 'radial-gradient(circle at 30% 20%, #e0f2fe, #38bdf8 46%, #0f172a 100%)',
      border: '2px solid rgba(147,197,253,0.86)',
      boxShadow: '0 12px 28px rgba(8,16,32,0.34), inset 0 1px 0 rgba(255,255,255,0.55)',
      color: '#e5eefc',
      fontFamily: 'var(--font-display)',
      fontSize: Math.max(11, Math.round(size * 0.34)),
      fontWeight: 800,
      lineHeight: 1,
      overflow: 'hidden',
    }}>
      <img
        src={avatarSrc}
        alt=""
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        draggable={false}
        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
      />
    </span>
  );
}

function PasswordInput({
  value,
  onChange,
  placeholder = 'Пароль',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...ADMIN_INPUT, paddingRight: '42px' }}
        autoComplete="current-password"
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
        title={visible ? 'Скрыть пароль' : 'Показать пароль'}
        style={{
          position: 'absolute',
          top: '50%',
          right: '8px',
          transform: 'translateY(-50%)',
          width: '30px',
          height: '30px',
          borderRadius: '8px',
          border: '1px solid rgba(139,69,19,0.18)',
          background: 'rgba(255,255,255,0.34)',
          color: '#6b4c2a',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

function AuthCheckingCard({ delayMs = 180 }: { delayMs?: number }) {
  const [visible, setVisible] = useState(delayMs <= 0);

  useEffect(() => {
    if (delayMs <= 0) {
      setVisible(true);
      return;
    }
    const timer = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs]);

  return (
    <div style={{
      minHeight: 220,
      padding: '18px 0',
      opacity: visible ? 1 : 0,
      transition: 'opacity 180ms ease',
    }}>
      <div style={{
        maxWidth: 460,
        margin: '0 auto',
        borderRadius: '16px',
        border: '1px solid rgba(148,163,184,0.42)',
        background: 'linear-gradient(180deg, rgba(248,250,255,0.98), rgba(235,241,252,0.94))',
        boxShadow: '0 24px 54px rgba(4,10,20,0.24), inset 0 1px 0 rgba(255,255,255,0.75)',
        padding: '28px 24px',
        textAlign: 'center',
      }}>
        <div style={{
          width: 58,
          height: 58,
          margin: '0 auto 14px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg,#12233f,#081020)',
          color: '#93c5fd',
          border: '2px solid rgba(56,189,248,0.45)',
          boxShadow: '0 12px 26px rgba(15,23,42,0.22)',
        }}>
          <RefreshCw size={28} className="animate-spin" />
        </div>
        <strong style={{ display: 'block', color: '#1e293b', fontFamily: 'var(--font-display)', fontSize: '1.15rem' }}>
          Проверяем профиль
        </strong>
        <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: '13px', lineHeight: 1.45 }}>
          Подключаем сессию Экосистемы Манакоста.
        </p>
      </div>
    </div>
  );
}

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


function AdminStatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div style={{
      background: 'linear-gradient(180deg,#f8faff,#ebf1fc)',
      border: '1px solid #cbd7ea',
      borderRadius: '12px',
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      boxShadow: '0 8px 18px rgba(15,23,42,0.06)',
    }}>
      <span style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      <strong style={{ color: '#1e293b', fontFamily: 'var(--font-display)', fontSize: '1.05rem' }}>{value}</strong>
      <span style={{ color: '#475569', fontSize: '12px' }}>{hint}</span>
    </div>
  );
}

function shortProfileIdentifier(value: string) {
  return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

function ProfileStatCard({
  label,
  value,
  hint,
  title,
  compact = false,
}: {
  label: string;
  value: string;
  hint: string;
  title?: string;
  compact?: boolean;
}) {
  return (
    <div className={`profile-stat-card${compact ? ' profile-stat-card-compact' : ''}`}>
      <span className="profile-stat-label">{label}</span>
      <strong className="profile-stat-value" title={title || value}>{value}</strong>
      <span className="profile-stat-hint">{hint}</span>
    </div>
  );
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

function LoginPanel({
  onAuthChange,
  initialAuthUser = null,
  parentAuthChecking = false,
}: {
  onAuthChange?: (user: AuthUser | null) => void;
  initialAuthUser?: AuthUser | null;
  parentAuthChecking?: boolean;
}) {
  const [authToken, setAuthToken] = useState(() => legacyAuthToken());
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => initialAuthUser);
  const [authChecking, setAuthChecking] = useState(parentAuthChecking);
  const [authStep, setAuthStep] = useState<'password' | 'code'>('password');
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'reset'>('login');
  const [email, setEmail] = useState(() => sessionStorage.getItem(AUTH_EMAIL_KEY) || '');
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [newsletterOptIn, setNewsletterOptIn] = useState(false);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<AdminMessage | null>(null);
  const [telegramAuthUrl, setTelegramAuthUrl] = useState('');
  const [telegramBotUsername, setTelegramBotUsername] = useState('');
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [telegramAttemptPending, setTelegramAttemptPending] = useState(false);
  const [telegramLinkCode, setTelegramLinkCode] = useState('');
  const [telegramLinkExpiresAt, setTelegramLinkExpiresAt] = useState('');
  const [telegramLinkLoading, setTelegramLinkLoading] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [subscriptionChecked, setSubscriptionChecked] = useState(false);
  const [boostyEmail, setBoostyEmail] = useState('');
  const [boostyCode, setBoostyCode] = useState('');
  const [boostyStep, setBoostyStep] = useState<'email' | 'code'>('email');
  const [profileCountry, setProfileCountry] = useState('');
  const [profileNewsletter, setProfileNewsletter] = useState(false);
  const [profileVkUrl, setProfileVkUrl] = useState('');
  const [profileTelegram, setProfileTelegram] = useState('');
  const [profileContactEmail, setProfileContactEmail] = useState('');

  const authHeaders = useCallback((extra: Record<string, string> = {}) => ({
    ...extra,
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  }), [authToken]);

  const applyAuthUser = useCallback((user: AuthUser, token = '') => {
    markAuthSessionHint();
    setAuthToken(token);
    setAuthUser(user);
    setProfileCountry(user?.country || '');
    setProfileNewsletter(Boolean(user?.newsletterOptIn));
    setProfileVkUrl(user?.contactVkUrl || '');
    setProfileTelegram(user?.contactTelegram || user?.telegramUsername || '');
    setProfileContactEmail(user?.contactEmail || (isRealAuthEmail(user?.email) ? user.email : ''));
    setTelegramLinkCode('');
    setTelegramLinkExpiresAt('');
    onAuthChange?.(user);
  }, [onAuthChange]);

  const refreshAuthFromSession = useCallback(async (showSuccess = false): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin', headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.user) return false;
      applyAuthUser(data.user);
      setTelegramAttemptPending(false);
      if (showSuccess) setMsg({ type: 'ok', text: 'Telegram-вход подтвержден.' });
      return true;
    } catch {
      return false;
    }
  }, [applyAuthUser, authHeaders]);

  const telegramLoginHref = useMemo(() => {
    const raw = telegramAuthUrl || '/api/auth/telegram/start';
    try {
      const url = new URL(raw, window.location.origin);
      if (url.pathname === '/api/auth/telegram/start' && !url.searchParams.has('returnTo')) {
        url.searchParams.set('returnTo', '/?login&telegram=ok');
      }
      return url.toString();
    } catch {
      return raw;
    }
  }, [telegramAuthUrl]);

  useEffect(() => {
    fetch('/api/auth/telegram/config')
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.enabled || !data.authUrl) return;
        setTelegramAuthUrl(String(data.authUrl || '/api/auth/telegram/start'));
        setTelegramBotUsername(String(data.botUsername || ''));
        setTelegramEnabled(true);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (parentAuthChecking) {
      setAuthChecking(true);
      return;
    }

    setAuthChecking(false);
    setAuthUser(initialAuthUser);
    if (initialAuthUser) {
      setBoostyEmail(isRealAuthEmail(initialAuthUser.email) ? initialAuthUser.email : '');
      setProfileCountry(initialAuthUser.country || '');
      setProfileNewsletter(Boolean(initialAuthUser.newsletterOptIn));
      setProfileVkUrl(initialAuthUser.contactVkUrl || '');
      setProfileTelegram(initialAuthUser.contactTelegram || initialAuthUser.telegramUsername || '');
      setProfileContactEmail(initialAuthUser.contactEmail || (isRealAuthEmail(initialAuthUser.email) ? initialAuthUser.email : ''));
      setTelegramLinkCode('');
      setTelegramLinkExpiresAt('');
      return;
    }

    setAuthToken('');
    setAuthStep('password');
  }, [initialAuthUser, parentAuthChecking]);

  const fetchSubscription = useCallback(async (force = false) => {
    setSubscriptionLoading(true);
    try {
      const res = await fetch(force ? '/api/subscription/refresh' : '/api/subscription/status', {
        method: force ? 'POST' : 'GET',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось проверить подписку');
      setSubscription(data);
      return data as SubscriptionStatus;
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message });
      return null;
    } finally {
      setSubscriptionChecked(true);
      setSubscriptionLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    if (!authUser) {
      setSubscription(null);
      setSubscriptionChecked(false);
      return;
    }
    setSubscriptionChecked(false);
    void fetchSubscription(false);
  }, [authUser, fetchSubscription]);

  useEffect(() => {
    if (!telegramAttemptPending || authUser) return;
    const check = () => {
      if (document.visibilityState !== 'hidden') void refreshAuthFromSession(true);
    };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    const timer = window.setInterval(check, 5000);
    return () => {
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
      window.clearInterval(timer);
    };
  }, [authUser, refreshAuthFromSession, telegramAttemptPending]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка входа');
      sessionStorage.setItem(AUTH_EMAIL_KEY, email);
      if (data.user) {
        applyAuthUser(data.user, data.token || '');
        setPassword('');
        setMsg(null);
        return;
      }
      setAuthStep('code');
      setPassword('');
      setMsg({ type: 'ok', text: 'Код отправлен на почту.' });
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, country, newsletterOptIn, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка регистрации');
      sessionStorage.setItem(AUTH_EMAIL_KEY, email);
      setAuthStep('code');
      setPassword('');
      setMsg({ type: 'ok', text: 'Аккаунт создан. Код отправлен на почту.' });
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/auth/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Не удалось отправить код');
      sessionStorage.setItem(AUTH_EMAIL_KEY, email);
      setAuthStep('code');
      setPassword('');
      setMsg({ type: 'ok', text: data.message || 'Код отправлен на почту.' });
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleResetConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Не удалось обновить пароль');
      setAuthMode('login');
      setAuthStep('password');
      setCode('');
      setPassword('');
      setMsg({ type: 'ok', text: 'Пароль обновлен. Теперь можно войти.' });
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Неверный код');
      sessionStorage.setItem(AUTH_EMAIL_KEY, email);
      applyAuthUser(data.user, data.token || '');
      setCode('');
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleBoostyEmailRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubscriptionLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/subscription/email/request', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ email: boostyEmail }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось отправить код');
      setBoostyStep('code');
      setMsg({ type: 'ok', text: 'Код отправлен на почту Boosty.' });
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const handleBoostyEmailConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubscriptionLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/subscription/email/confirm', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ email: boostyEmail, code: boostyCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось подтвердить почту');
      setAuthUser(data.user);
      setProfileCountry(data.user?.country || '');
      setProfileNewsletter(Boolean(data.user?.newsletterOptIn));
      setProfileVkUrl(data.user?.contactVkUrl || '');
      setProfileTelegram(data.user?.contactTelegram || data.user?.telegramUsername || '');
      setProfileContactEmail(data.user?.contactEmail || (isRealAuthEmail(data.user?.email) ? data.user.email : ''));
      onAuthChange?.(data.user);
      setSubscription(data.subscription);
      setSubscriptionChecked(true);
      setBoostyCode('');
      setBoostyStep('email');
      setMsg({ type: 'ok', text: 'Почта привязана, подписка обновлена.' });
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const handleTelegramLinkCodeRequest = async () => {
    setTelegramLinkLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/auth/telegram/link-code', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось создать Telegram-код');
      setTelegramLinkCode(String(data.code || ''));
      setTelegramLinkExpiresAt(String(data.expiresAt || ''));
      if (data.botUsername) setTelegramBotUsername(String(data.botUsername));
      setMsg({ type: 'ok', text: 'ID-код создан. Отправьте его боту Telegram.' });
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setTelegramLinkLoading(false);
    }
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          country: profileCountry,
          newsletterOptIn: profileNewsletter,
          contactVkUrl: profileVkUrl,
          contactTelegram: profileTelegram,
          contactEmail: profileContactEmail,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось сохранить профиль');
      setAuthUser(data.user);
      onAuthChange?.(data.user);
      setMsg({ type: 'ok', text: 'Профиль обновлен.' });
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    fetch('/api/auth/logout', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
    }).catch(() => {});
    clearAuthSessionHint();
    setAuthToken('');
    setAuthUser(null);
    setSubscription(null);
    setSubscriptionChecked(false);
    setTelegramLinkCode('');
    setTelegramLinkExpiresAt('');
    onAuthChange?.(null);
    setAuthStep('password');
    setPassword('');
    setCode('');
    setMsg(null);
    setAuthChecking(false);
  };

  if (authChecking && !authUser) {
    return <AuthCheckingCard />;
  }

  if (authUser) {
    const profileName = authUser.name?.trim() === 'Пользователь Манакост'
      ? 'Пользователь Манакоста'
      : (authUser.name?.trim() || 'Пользователь Манакоста');
    const profileContact = isRealAuthEmail(authUser.email)
      ? authUser.email
      : authUser.telegramUsername
        ? `@${authUser.telegramUsername}`
        : authUser.email;
    const subscriptionPending = subscriptionLoading || !subscriptionChecked;
    const profileRoleLabel = authUser.role === 'admin'
      ? 'Администратор'
      : subscription?.hasAccess
        ? 'Платный подписчик'
        : 'Участник';
    const subscriptionLabel = subscriptionPending
      ? 'Проверяем подписку'
      : subscription?.hasAccess
        ? 'Подписка активна'
        : 'Подписка не подтверждена';
    const subscriptionAccessLabels = subscriptionEntitlementLabels(subscription);
    const identityLabel = authUser.telegramUsername
      ? 'Telegram привязан'
      : isRealAuthEmail(authUser.email)
        ? 'Email привязан'
        : 'Профиль без email';
    const profileId = authUser.profileId || authUser.id || '—';
    const profileIdDisplay = shortProfileIdentifier(profileId);
    const telegramLinkBotUrl = telegramBotUsername && telegramLinkCode
      ? `https://t.me/${telegramBotUsername}?start=${encodeURIComponent(telegramLinkCode)}`
      : '';
    const telegramLinkExpiresLabel = telegramLinkExpiresAt ? formatSubscriptionDate(telegramLinkExpiresAt) : '';

    return (
      <div className="profile-page" style={{ padding: '18px 0' }}>
        <div className="profile-card" style={{
          maxWidth: 900,
          margin: '0 auto',
          borderRadius: '20px',
          border: '1px solid rgba(148,163,184,0.42)',
          background: 'linear-gradient(180deg, rgba(248,250,255,0.98), rgba(235,241,252,0.94))',
          boxShadow: '0 28px 70px rgba(4,10,20,0.34), inset 0 1px 0 rgba(255,255,255,0.82)',
          padding: '24px',
          overflow: 'hidden',
        }}>
          <div className="profile-hero" style={{
            position: 'relative',
            margin: '-24px -24px 20px',
            minHeight: 230,
            padding: '26px',
            display: 'flex',
            alignItems: 'flex-end',
            overflow: 'hidden',
            backgroundImage: 'linear-gradient(90deg, rgba(4,10,20,0.96) 0%, rgba(8,16,32,0.82) 44%, rgba(8,16,32,0.34) 100%), linear-gradient(180deg, rgba(4,10,20,0.10), rgba(4,10,20,0.44)), image-set(url("/wallpaper/profile-hero-hth.webp") type("image/webp"), url("/wallpaper/profile-hero-hth.jpg") type("image/jpeg"))',
            backgroundSize: 'cover',
            backgroundPosition: 'center 48%',
          }}>
            <img
              src="/assets/arena_icon.webp"
              alt=""
              draggable={false}
              style={{
                position: 'absolute',
                right: 22,
                top: 18,
                width: 54,
                height: 54,
                objectFit: 'contain',
                opacity: 0.76,
                filter: 'drop-shadow(0 10px 22px rgba(56,189,248,0.28))',
                pointerEvents: 'none',
              }}
            />
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: '18px', width: '100%', minWidth: 0 }}>
              <AuthAvatar user={{ ...authUser, name: profileName }} size={92} />
              <div style={{ minWidth: 0, textAlign: 'left', flex: 1 }}>
                <p style={{ color: '#93c5fd', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px', fontWeight: 700 }}>
                  Экосистема Манакоста
                </p>
                <h2 style={{
                  fontFamily: 'var(--font-display)',
                  color: '#f8faff',
                  fontSize: 'clamp(1.55rem, 4vw, 2.25rem)',
                  margin: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  textShadow: '0 8px 24px rgba(0,0,0,0.46)',
                }}>
                  {profileName}
                </h2>
                <p style={{ color: '#c8d5e8', fontSize: '14px', marginTop: '7px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {profileContact}
                </p>
                <div className="profile-status-chips" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '13px' }}>
                  {[profileRoleLabel, subscriptionLabel, identityLabel].map((item, index) => (
                    <span key={`${index}-${item}`} className="profile-status-chip" style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      minHeight: 30,
                      padding: '6px 10px',
                      borderRadius: '999px',
                      background: index === 1 && subscription?.hasAccess ? 'rgba(16,185,129,0.18)' : 'rgba(248,250,255,0.10)',
                      border: index === 1 && subscription?.hasAccess ? '1px solid rgba(52,211,153,0.54)' : '1px solid rgba(147,197,253,0.22)',
                      color: index === 1 && subscription?.hasAccess ? '#bbf7d0' : '#e5eefc',
                      fontSize: '12px',
                      fontWeight: 700,
                      backdropFilter: 'blur(10px)',
                    }}>
                      {index === 0 ? <UserCircle size={14} /> : index === 1 ? <Star size={14} /> : <LogIn size={14} />}
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div style={{
              position: 'absolute',
              left: 26,
              bottom: 18,
              zIndex: 2,
              color: '#9fb1ca',
              fontSize: '11px',
              display: 'none',
            }} />
          </div>
          <div className="profile-summary-strip" style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            marginBottom: '18px',
            padding: '12px 14px',
            borderRadius: '14px',
            background: 'linear-gradient(135deg, rgba(15,23,42,0.06), rgba(37,99,235,0.08))',
            border: '1px solid rgba(148,163,184,0.38)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              <img src="/assets/manacost-avatar.jpeg" alt="" style={{ width: 36, height: 36, borderRadius: '10px', objectFit: 'cover', flexShrink: 0 }} />
              <div style={{ minWidth: 0, textAlign: 'left' }}>
                <strong style={{ display: 'block', color: '#1e293b', fontSize: '14px' }}>Паспорт профиля Манакоста</strong>
                <span style={{ display: 'block', color: '#64748b', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  ID: <code className="profile-summary-id" title={profileId} style={{ background: '#e2e8f0', padding: '1px 6px', borderRadius: '6px' }}>{profileIdDisplay}</code>
                </span>
              </div>
            </div>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 10px',
              borderRadius: '999px',
            background: subscriptionPending ? '#e0f2fe' : subscription?.hasAccess ? '#dcfce7' : '#f1f5f9',
            color: subscriptionPending ? '#075985' : subscription?.hasAccess ? '#065f46' : '#334155',
            border: subscriptionPending ? '1px solid #7dd3fc' : subscription?.hasAccess ? '1px solid #86efac' : '1px solid #cbd5e1',
              fontSize: '12px',
              fontWeight: 800,
              flexShrink: 0,
            }}>
              <Trophy size={14} />
              {subscriptionPending ? 'Проверяем доступ' : subscription?.hasAccess ? 'Платный подписчик' : 'Участник'}
            </span>
          </div>
          {msg && (
            <div style={{
              marginBottom: '14px',
              padding: '9px 12px',
              borderRadius: '8px',
              background: msg.type === 'ok' ? '#d1fae5' : '#fee2e2',
              color: msg.type === 'ok' ? '#065f46' : '#991b1b',
              fontSize: '12px',
            }}>
              {msg.text}
            </div>
          )}
          <div className="profile-stat-grid">
            <ProfileStatCard label="ID профиля" value={profileIdDisplay} title={profileId} hint="Единая база Манакоста" compact />
            <ProfileStatCard label="Роль" value={profileRoleLabel} hint="Уровень доступа" />
            <ProfileStatCard label="Страна" value={authUser.country || 'Не указана'} hint="Данные профиля" />
            <ProfileStatCard label="Рассылка" value={authUser.newsletterOptIn ? 'Подписан' : 'Не подписан'} hint="Новости и обновления" />
          </div>
          <form
            onSubmit={handleProfileSave}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '10px',
              alignItems: 'end',
              marginBottom: '18px',
              padding: '14px',
              borderRadius: '14px',
              border: '1px solid #cbd7ea',
              background: 'rgba(248,250,255,0.72)',
            }}
          >
            <div style={{ gridColumn: '1 / -1', textAlign: 'left' }}>
              <strong style={{ display: 'block', color: '#1e293b', fontSize: '15px' }}>Настройки профиля</strong>
              <span style={{ display: 'block', color: '#64748b', fontSize: '12px', marginTop: '3px' }}>
                Страна и рассылка используются во всей экосистеме Манакоста.
              </span>
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: '#334155', fontSize: '12px', textAlign: 'left' }}>
              Страна
              <select value={profileCountry} onChange={e => setProfileCountry(e.target.value)} style={ADMIN_INPUT}>
                <option value="">Не указана</option>
                {COUNTRY_OPTIONS.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="profile-checkbox-row" style={{ display: 'flex', gap: '9px', alignItems: 'center', color: '#334155', fontSize: '13px', textAlign: 'left', minHeight: 42 }}>
              <input
                className="profile-checkbox"
                type="checkbox"
                checked={profileNewsletter}
                onChange={e => setProfileNewsletter(e.target.checked)}
                style={{ accentColor: '#2563eb' }}
              />
              <span>Получать рассылку Манакоста</span>
            </label>
            <div style={{ gridColumn: '1 / -1', textAlign: 'left', marginTop: '4px' }}>
              <strong style={{ display: 'block', color: '#1e293b', fontSize: '15px' }}>Каналы связи</strong>
              <span style={{ display: 'block', color: '#64748b', fontSize: '12px', marginTop: '3px' }}>
                Эти контакты помогут связаться с вами по конкурсам и призам.
              </span>
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: '#334155', fontSize: '12px', textAlign: 'left' }}>
              VK
              <input
                value={profileVkUrl}
                onChange={e => setProfileVkUrl(e.target.value)}
                placeholder="https://vk.com/username"
                style={ADMIN_INPUT}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: '#334155', fontSize: '12px', textAlign: 'left' }}>
              Telegram
              <input
                value={profileTelegram}
                onChange={e => setProfileTelegram(e.target.value)}
                placeholder="@username"
                style={ADMIN_INPUT}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', color: '#334155', fontSize: '12px', textAlign: 'left' }}>
              Почта для связи
              <input
                type="email"
                value={profileContactEmail}
                onChange={e => setProfileContactEmail(e.target.value)}
                placeholder="mail@example.com"
                style={ADMIN_INPUT}
              />
            </label>
            <button type="submit" disabled={loading} style={{
              ...ADMIN_SECONDARY_BUTTON,
              minHeight: 42,
              background: 'linear-gradient(135deg,#2563eb,#0f4eb8)',
              color: '#f8faff',
              borderColor: '#60a5fa',
              cursor: loading ? 'wait' : 'pointer',
            }}>
              Сохранить
            </button>
          </form>
          <div className="profile-subscription-panel" style={{
            marginBottom: '18px',
            padding: '16px',
            borderRadius: '14px',
            background: subscription?.hasAccess
              ? 'linear-gradient(135deg, rgba(220,252,231,0.82), rgba(239,253,244,0.58))'
              : 'linear-gradient(135deg, rgba(235,241,252,0.94), rgba(248,250,255,0.72))',
            border: subscription?.hasAccess ? '1.5px solid #34d399' : '1.5px solid #9db4d5',
            textAlign: 'left',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
              <div>
                <p style={{ margin: 0, color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Подписка Манакоста
                </p>
                <strong style={{ display: 'block', marginTop: '4px', color: subscription?.hasAccess ? '#065f46' : '#1e3a5f', fontSize: '1rem' }}>
                  {subscriptionPending
                    ? 'Проверяем...'
                    : subscription?.hasAccess
                      ? 'Активна'
                      : 'Не подтверждена'}
                </strong>
              </div>
              <button
                type="button"
                onClick={() => { void fetchSubscription(true); }}
                disabled={subscriptionLoading}
                style={{
                  ...ADMIN_SECONDARY_BUTTON,
                  background: '#f8faff',
                  color: '#1f3b63',
                  borderColor: '#9db4d5',
                  cursor: subscriptionLoading ? 'wait' : 'pointer',
                }}
              >
                {subscriptionLoading ? 'Проверяем...' : 'Обновить'}
              </button>
            </div>
            <p style={{ margin: '0 0 10px', color: '#334155', fontSize: '13px', lineHeight: 1.45 }}>
              {subscription?.message || 'Подтвердите подписку через Boosty или Telegram VIP-канал.'}
            </p>
            {subscriptionAccessLabels.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '0 0 12px' }}>
                {subscriptionAccessLabels.map(label => (
                  <span key={label} style={{
                    padding: '5px 8px',
                    borderRadius: '999px',
                    background: 'rgba(16,185,129,0.12)',
                    border: '1px solid rgba(5,150,105,0.28)',
                    color: '#065f46',
                    fontSize: '11px',
                    fontWeight: 800,
                  }}>
                    {label}
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', marginBottom: '12px' }}>
              <div className="profile-subscription-source" style={{ padding: '10px', borderRadius: '10px', background: 'rgba(248,250,255,0.82)', border: '1px solid #cbd7ea', display: 'grid', gridTemplateColumns: '34px 1fr', gap: '9px', alignItems: 'center' }}>
                <img src="/ad/boosty.png" alt="" style={{ width: 34, height: 34, objectFit: 'contain', borderRadius: '9px', background: '#fff' }} />
                <div>
                <strong style={{ color: '#1e293b', fontSize: '13px' }}>Boosty</strong>
                <p style={{ margin: '4px 0 0', color: '#475569', fontSize: '12px', lineHeight: 1.35 }}>
                  {subscription?.boosty?.hasAccess
                    ? `${subscription.boosty.levelName || 'Уровень'} · ${subscription.boosty.price || 0} RUB`
                    : subscription?.boosty?.message || 'Почта еще не проверена.'}
                </p>
                </div>
              </div>
              <div className="profile-subscription-source" style={{ padding: '10px', borderRadius: '10px', background: 'rgba(248,250,255,0.82)', border: '1px solid #cbd7ea', display: 'grid', gridTemplateColumns: '34px 1fr', gap: '9px', alignItems: 'flex-start' }}>
                <img src="/ad/telegram.png" alt="" style={{ width: 34, height: 34, objectFit: 'contain', borderRadius: '9px', background: '#eff6ff' }} />
                <div>
                <strong style={{ color: '#1e293b', fontSize: '13px' }}>Telegram</strong>
                <p style={{ margin: '4px 0 0', color: '#475569', fontSize: '12px', lineHeight: 1.35 }}>
                  {subscription?.telegram?.hasAccess
                    ? 'Найден в VIP-канале'
                    : subscription?.telegram?.message || 'Войдите через Telegram для проверки каналов.'}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginTop: '9px' }}>
                  <button
                    type="button"
                    onClick={() => { void handleTelegramLinkCodeRequest(); }}
                    disabled={telegramLinkLoading || !telegramBotUsername}
                    style={{
                      ...ADMIN_SECONDARY_BUTTON,
                      minHeight: 34,
                      padding: '7px 10px',
                      background: '#eff6ff',
                      color: '#1d4ed8',
                      borderColor: '#93c5fd',
                      cursor: telegramLinkLoading ? 'wait' : 'pointer',
                    }}
                  >
                    {telegramLinkLoading ? 'Создаем...' : 'ID-код для бота'}
                  </button>
                  {telegramLinkCode && (
                    <code style={{
                      padding: '6px 9px',
                      borderRadius: '8px',
                      background: '#0f172a',
                      color: '#e0f2fe',
                      fontWeight: 800,
                      letterSpacing: '0.08em',
                    }}>
                      {telegramLinkCode}
                    </code>
                  )}
                  {telegramLinkBotUrl && (
                    <a
                      href={telegramLinkBotUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: '#1d4ed8', fontSize: '12px', fontWeight: 800, textDecoration: 'none' }}
                    >
                      Открыть @{telegramBotUsername}
                    </a>
                  )}
                  {telegramLinkExpiresLabel && (
                    <span style={{ color: '#64748b', fontSize: '11px' }}>до {telegramLinkExpiresLabel}</span>
                  )}
                </div>
                <p style={{ margin: '7px 0 0', color: '#64748b', fontSize: '11px', lineHeight: 1.35 }}>
                  В боте также можно привязать Boosty-почту командой /email name@example.com.
                </p>
                </div>
              </div>
            </div>
            <p style={{ margin: '0 0 12px', color: '#64748b', fontSize: '11px' }}>
              Последняя проверка: {formatSubscriptionDate(subscription?.checkedAt ?? null)}
            </p>
            <form
              onSubmit={boostyStep === 'email' ? handleBoostyEmailRequest : handleBoostyEmailConfirm}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                padding: '12px',
                borderRadius: '12px',
                background: 'rgba(255,247,237,0.82)',
                border: '1px solid #fed7aa',
              }}
            >
              <p style={{ margin: 0, color: '#334155', fontSize: '12px', lineHeight: 1.4 }}>
                Для Boosty подтвердите почту, которая указана в вашем Boosty-профиле. Это отдельная проверка от Telegram.
              </p>
              <input
                type="email"
                value={boostyEmail}
                onChange={e => setBoostyEmail(e.target.value)}
                placeholder="Email из Boosty"
                style={ADMIN_INPUT}
              />
              {boostyStep === 'code' && (
                <input
                  type="text"
                  inputMode="numeric"
                  value={boostyCode}
                  onChange={e => setBoostyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6-значный код"
                  style={{ ...ADMIN_INPUT, textAlign: 'center', letterSpacing: '0.18em' }}
                />
              )}
              <button type="submit" disabled={subscriptionLoading} style={{
                ...ADMIN_SECONDARY_BUTTON,
                justifyContent: 'center',
                background: '#fff7ed',
                color: '#9a3412',
                borderColor: '#fdba74',
                cursor: subscriptionLoading ? 'wait' : 'pointer',
              }}>
                {subscriptionLoading
                  ? 'Проверяем...'
                  : boostyStep === 'email'
                    ? 'Подтвердить Boosty-почту'
                    : 'Подтвердить код Boosty'}
              </button>
            </form>
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {authUser.role === 'admin' && (
              <a href="/?admin&section=list" style={{
                ...ADMIN_SECONDARY_BUTTON,
                display: 'inline-flex',
                alignItems: 'center',
                textDecoration: 'none',
                background: 'linear-gradient(135deg,#12233f,#081020)',
                color: '#e5eefc',
                borderColor: '#60a5fa',
              }}>
                Настроить статьи
              </a>
            )}
            <button type="button" onClick={handleLogout} style={{
              ...ADMIN_SECONDARY_BUTTON,
              background: 'rgba(153,27,27,0.08)',
              color: '#991b1b',
              borderColor: '#fca5a5',
            }}>
              Выйти
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page" style={{ padding: '18px 0' }}>
      <div className="login-card" style={{
        maxWidth: 460,
        margin: '0 auto',
        borderRadius: '16px',
        border: '1.5px solid #cbd7ea',
        background: 'linear-gradient(180deg, rgba(248,250,255,0.98), rgba(235,241,252,0.94))',
        boxShadow: '0 24px 54px rgba(4,10,20,0.30), inset 0 1px 0 rgba(255,255,255,0.75)',
        padding: '24px',
        textAlign: 'center',
      }}>
      <div style={{
        width: 58,
        height: 58,
        margin: '0 auto 12px',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg,#12233f,#081020)',
        color: '#93c5fd',
        border: '2px solid rgba(56,189,248,0.45)',
        boxShadow: '0 12px 26px rgba(15,23,42,0.22)',
      }}>
        <UserCircle size={30} />
      </div>
      <h2 style={{ fontFamily: 'var(--font-display)', color: '#1e293b', fontSize: '1.55rem', marginBottom: '8px' }}>
        {authMode === 'register' ? 'Регистрация' : authMode === 'reset' ? 'Восстановление пароля' : 'Войти в экосистему Манакост'}
      </h2>
      <p style={{ color: '#475569', fontSize: '13px', marginBottom: '18px', lineHeight: 1.5 }}>
        {authMode === 'register'
          ? 'Укажите данные профиля, затем подтвердите почту кодом.'
          : authMode === 'reset'
            ? 'Укажите почту, получите код и задайте новый пароль.'
            : 'Войдите по почте, паролю и коду подтверждения.'}
      </p>
      {msg && (
        <div style={{
          maxWidth: '340px',
          margin: '0 auto 14px',
          padding: '9px 12px',
          borderRadius: '8px',
          background: msg.type === 'ok' ? '#d1fae5' : '#fee2e2',
          color: msg.type === 'ok' ? '#065f46' : '#991b1b',
          fontSize: '12px',
        }}>
          {msg.text}
        </div>
      )}
      {authStep === 'password' && (
        <div style={{ display: 'inline-flex', gap: '4px', padding: '4px', borderRadius: '10px', background: 'rgba(37,99,235,0.08)', marginBottom: '14px' }}>
          {(['login', 'register'] as const).map(mode => (
            <button key={mode} type="button" onClick={() => { setAuthMode(mode); setMsg(null); setAuthStep('password'); }}
              style={{
                border: '1px solid ' + (authMode === mode ? '#60a5fa' : 'transparent'),
                background: authMode === mode ? '#f8faff' : 'transparent',
                color: authMode === mode ? '#1e293b' : '#64748b',
                borderRadius: '8px',
                padding: '7px 12px',
                cursor: 'pointer',
                fontFamily: 'var(--font-display)',
                fontSize: '13px',
              }}>
              {mode === 'login' ? 'Вход' : 'Регистрация'}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={authStep === 'password'
          ? (authMode === 'login' ? handleLogin : authMode === 'register' ? handleRegister : handleResetRequest)
          : (authMode === 'reset' ? handleResetConfirm : handleVerify)}
        style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '320px', margin: '0 auto' }}>
        {authStep === 'password' ? (
          <>
            {authMode === 'register' && (
              <>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Имя"
                  style={ADMIN_INPUT}
                  autoComplete="name"
                />
                <select
                  value={country}
                  onChange={e => setCountry(e.target.value)}
                  style={ADMIN_INPUT}
                  required
                >
                  <option value="">Страна</option>
                  {COUNTRY_OPTIONS.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
              </>
            )}
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email"
              style={ADMIN_INPUT}
              autoComplete="email"
              autoFocus
            />
            {authMode !== 'reset' && <PasswordInput value={password} onChange={setPassword} />}
            {authMode === 'register' && (
              <label style={{
                display: 'flex',
                gap: '9px',
                alignItems: 'flex-start',
                textAlign: 'left',
                color: '#6b4c2a',
                fontSize: '12px',
                lineHeight: 1.35,
                cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={newsletterOptIn}
                  onChange={e => setNewsletterOptIn(e.target.checked)}
                  required
                  style={{ marginTop: '2px', accentColor: '#8b5a1a' }}
                />
                <span>Подтверждаю согласие получать рассылку HS-Arena с новостями, гайдами и обновлениями.</span>
              </label>
            )}
          </>
        ) : (
          <>
            <p style={{ color: '#8b6c42', fontSize: '12px', margin: 0 }}>
              Код отправлен на <b>{email}</b>
            </p>
            <input
              type="text"
              inputMode="numeric"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6-значный код"
              style={{ ...ADMIN_INPUT, textAlign: 'center', letterSpacing: '0.18em', fontSize: '18px' }}
              autoComplete="one-time-code"
              autoFocus
            />
            <button type="button" onClick={() => { setAuthStep('password'); setCode(''); setMsg(null); }}
              style={{ background: 'none', border: 'none', color: '#8b4513', fontSize: '12px', cursor: 'pointer' }}>
              Изменить email или пароль
            </button>
            {authMode === 'reset' && (
              <PasswordInput value={password} onChange={setPassword} placeholder="Новый пароль" />
            )}
          </>
        )}
        <button type="submit" style={{
          background: 'linear-gradient(135deg,#2563eb,#0f4eb8)',
          color: '#f8faff',
          border: '1.5px solid #60a5fa',
          borderRadius: '8px',
          padding: '10px',
          fontFamily: 'var(--font-display)',
          fontSize: '15px',
          cursor: loading ? 'wait' : 'pointer',
          opacity: loading ? 0.75 : 1,
        }} disabled={loading}>
          {loading ? 'Проверяем...' : authStep === 'password' ? 'Получить код' : authMode === 'reset' ? 'Сменить пароль' : 'Войти'}
        </button>
      </form>
      {authStep === 'password' && authMode === 'login' && telegramEnabled && (
        <div style={{ maxWidth: 320, margin: '16px auto 0' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            color: '#8b6c42',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: '12px',
          }}>
            <span style={{ flex: 1, height: 1, background: 'rgba(139,69,19,0.22)' }} />
            <span>или</span>
            <span style={{ flex: 1, height: 1, background: 'rgba(139,69,19,0.22)' }} />
          </div>
	          <a
	            href={telegramLoginHref}
	            target="_blank"
	            rel="noopener noreferrer"
	            onClick={() => {
	              setTelegramAttemptPending(true);
	              setMsg({ type: 'ok', text: 'Telegram открыт в отдельной вкладке. После подтверждения вход появится здесь автоматически.' });
	            }}
	            style={{
	              display: 'flex',
	              minHeight: 44,
              justifyContent: 'center',
              alignItems: 'center',
              gap: '10px',
              borderRadius: '10px',
              border: '1.5px solid #2aabee',
              background: 'linear-gradient(135deg,#2aabee,#1d7fb8)',
              color: '#f8fbff',
              fontFamily: 'var(--font-display)',
              fontSize: '14px',
              textDecoration: 'none',
              boxShadow: '0 10px 22px rgba(42,171,238,0.22)',
              opacity: loading ? 0.7 : 1,
              pointerEvents: loading ? 'none' : 'auto',
            }}
	          >
            <span aria-hidden="true" style={{ width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg viewBox="0 0 24 24" width="22" height="22" focusable="false" style={{ display: 'block' }}>
                <path fill="#ffffff" d="M21.7 3.3c.3-.9-.6-1.6-1.4-1.2L2.9 8.8c-1 .4-.9 1.8.1 2.1l4.4 1.4 1.7 5.3c.3.9 1.5 1.1 2.1.4l2.4-2.8 4.6 3.4c.8.6 1.9.1 2.1-.9l2.9-14.4ZM8.1 11.8l9.5-5.9-7.4 7.7-.3 3.2-1.8-5Z" />
              </svg>
            </span>
	            <span>Войти через Telegram</span>
	          </a>
	          {telegramAttemptPending && (
	            <div style={{
	              marginTop: '10px',
	              padding: '9px 10px',
	              borderRadius: '8px',
	              border: '1px solid rgba(42,171,238,0.24)',
	              background: 'rgba(239,246,255,0.78)',
	              color: '#1e3a5f',
	              fontSize: '12px',
	              lineHeight: 1.4,
	            }}>
	              Если Telegram не отвечает, вкладку можно закрыть и продолжить вход по почте.
	            </div>
	          )}
	        </div>
	      )}
      {authStep === 'password' && authMode === 'login' && (
        <button
          type="button"
          onClick={() => { setAuthMode('reset'); setMsg(null); }}
          style={{ marginTop: '12px', background: 'none', border: 'none', color: '#6b4c2a', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}
        >
          Забыли пароль?
        </button>
      )}
      {authStep === 'password' && authMode === 'reset' && (
        <button
          type="button"
          onClick={() => { setAuthMode('login'); setMsg(null); }}
          style={{ marginTop: '12px', background: 'none', border: 'none', color: '#6b4c2a', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}
        >
          Вернуться ко входу
        </button>
      )}
      </div>
    </div>
  );
}

function AdminPanel({
  articles,
  loadingArticles,
  articlesUpdatedAt,
  tierlistSections,
  onRefresh,
  onRefreshTierlist,
}: {
  articles: Article[];
  loadingArticles: boolean;
  articlesUpdatedAt: string | null;
  tierlistSections: ClassSection[];
  onRefresh: (options?: { bust?: boolean; silent?: boolean }) => Promise<void>;
  onRefreshTierlist: () => Promise<void>;
}) {
  const [authToken, setAuthToken] = useState(() => legacyAuthToken());
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authStep, setAuthStep] = useState<'password' | 'code'>('password');
  const [email, setEmail] = useState(() => sessionStorage.getItem(AUTH_EMAIL_KEY) || '');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const authed = Boolean(authUser);
  const [activeSection, setActiveSection] = useState<AdminSectionId>(() => getInitialAdminSection());
  const [form,      setForm]      = useState<AdminForm>(EMPTY_FORM);
  const [saving,    setSaving]    = useState(false);
  const [deleting,  setDeleting]  = useState<string | null>(null);
  const [msg,       setMsg]       = useState<AdminMessage | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [tagFilter, setTagFilter] = useState<'all' | string>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'title'>('newest');
  const [classPositionsDraft, setClassPositionsDraft] = useState<Record<string, string>>({});
  const [savingPositions, setSavingPositions] = useState(false);

  const authHeaders = useCallback((extra: Record<string, string> = {}) => ({
    ...extra,
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  }), [authToken]);

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'same-origin', headers: authHeaders() })
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Требуется вход');
        if (!data.adminAllowed) throw new Error('Нужны права администратора');
        markAuthSessionHint();
        setAuthUser(data.user);
      })
      .catch(() => {
        clearAuthSessionHint();
        setAuthToken('');
        setAuthUser(null);
        setAuthStep('password');
      });
  }, [authToken, authHeaders]);

  // ── Image generation state ────────────────────────────────────────────────
  const [genBusy,   setGenBusy]   = useState(false);
  const [genLog,    setGenLog]    = useState<string[]>([]);
  const [genImgUrl, setGenImgUrl] = useState<string | null>(null);
  const genPollRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = useCallback(() => {
    if (genPollRef.current) { clearInterval(genPollRef.current); genPollRef.current = null; }
  }, []);

  useEffect(() => () => stopPoll(), [stopPoll]);

  const articleTags = useMemo(() => {
    const tags = new Set<string>();
    articles.forEach(article => {
      const tag = article.tag?.trim();
      if (tag) tags.add(tag);
    });
    return Array.from(tags).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [articles]);

  useEffect(() => {
    const nextDraft = Object.fromEntries(
      tierlistSections.map(section => [section.id, section.classPosition ?? ''])
    );
    setClassPositionsDraft(nextDraft);
  }, [tierlistSections]);

  const filteredArticles = useMemo(() => {
    const normalizedSearch = deferredSearchTerm.trim().toLowerCase();
    const list = articles.filter(article => {
      if (tagFilter !== 'all' && (article.tag?.trim() || '') !== tagFilter) return false;
      if (!normalizedSearch) return true;
      const haystack = [article.title, article.excerpt, article.tag, article.url]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedSearch);
    });

    list.sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title, 'ru');
      const direction = sortBy === 'oldest' ? 1 : -1;
      return (new Date(a.date).getTime() - new Date(b.date).getTime()) * direction;
    });

    return list;
  }, [articles, deferredSearchTerm, sortBy, tagFilter]);

  const handleGenImage = async () => {
    if (genBusy) return;
    setGenBusy(true);
    setGenLog(['⏳ Запускаем генерацию...']);
    setGenImgUrl(null);
    try {
      const res = await fetch('/api/admin/gen-image', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ type: 'legendaries' }),
      });
      // Guard against non-JSON responses (e.g. 404 HTML when server not restarted)
      const text = await res.text();
      if (!text.trim()) throw new Error(`Сервер вернул пустой ответ (HTTP ${res.status}). Перезапусти сервер: npm run dev`);
      let data: any = {};
      try { data = JSON.parse(text); } catch { throw new Error(`Не JSON: ${text.slice(0, 120)}`); }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setGenLog(prev => [...prev, '🚀 ' + data.message]);
      const outUrl = data.outUrl as string;

      // Poll until the server is no longer busy
      stopPoll();
      genPollRef.current = setInterval(async () => {
        try {
          const st = await fetch('/api/admin/gen-status', { headers: authHeaders() });
          const { busy } = await st.json();
          if (!busy) {
            stopPoll();
            setGenBusy(false);
            setGenImgUrl(outUrl + '?t=' + Date.now());
            setGenLog(prev => [...prev, '✅ Готово! Картинка сгенерирована.']);
          } else {
            setGenLog(prev => {
              const last = prev[prev.length - 1];
              if (last?.startsWith('⌛')) return [...prev.slice(0, -1), '⌛ Генерируется' + '.'.repeat((last.length - 12) % 4 + 1)];
              return [...prev, '⌛ Генерируется.'];
            });
          }
        } catch { /* ignore poll errors */ }
      }, 2000);
    } catch (err: any) {
      setGenBusy(false);
      setGenLog(prev => [...prev, '❌ ' + err.message]);
    }
  };

  const field = (key: keyof AdminForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка входа');
      sessionStorage.setItem(AUTH_EMAIL_KEY, email);
      if (data.user) {
        if (!data.adminAllowed) throw new Error('У этого аккаунта нет прав администратора');
        markAuthSessionHint();
        setAuthToken(data.token || '');
        setAuthUser(data.user);
        setPassword('');
        setMsg(null);
        return;
      }
      setAuthStep('code');
      setPassword('');
      setMsg({ type: 'ok', text: 'Код отправлен на почту.' });
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Неверный код');
      if (!data.adminAllowed) throw new Error('У этого аккаунта нет прав администратора');
      sessionStorage.setItem(AUTH_EMAIL_KEY, email);
      markAuthSessionHint();
      setAuthToken(data.token || '');
      setAuthUser(data.user);
      setCode('');
      setMsg(null);
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    fetch('/api/auth/logout', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
    }).catch(() => {});
    clearAuthSessionHint();
    setAuthToken('');
    setAuthUser(null);
    setAuthStep('password');
    setPassword('');
    setCode('');
    setMsg(null);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true); setMsg(null);
    try {
      const res = await fetch('/api/admin-articles', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ article: form }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка');
      setMsg({ type: 'ok', text: '✓ Статья добавлена!' });
      setForm(EMPTY_FORM);
      setActiveSection('list');
      await onRefresh({ bust: true });
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`Удалить «${title}»?`)) return;
    setDeleting(id);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin-articles?t=${Date.now()}`, {
        method: 'DELETE',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        cache: 'no-store',
        body: JSON.stringify({ id }),
      });
      let data: any = {};
      try { data = await res.json(); } catch { /* non-json body */ }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setMsg({ type: 'ok', text: '✓ Статья удалена' });
      await onRefresh({ bust: true });
    } catch (err: any) {
      setMsg({ type: 'err', text: `Ошибка удаления: ${err.message}` });
    } finally {
      setDeleting(null);
    }
  };

  const handlePositionChange = (classId: string, value: string) => {
    setClassPositionsDraft(current => ({ ...current, [classId]: value }));
  };

  const handleSaveClassPositions = async () => {
    setSavingPositions(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin-class-positions', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ positions: classPositionsDraft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка сохранения');
      setMsg({ type: 'ok', text: 'Позиции классов сохранены.' });
      await onRefreshTierlist();
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setSavingPositions(false);
    }
  };

  // ── Login screen ──────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🔐</div>
        <h2 style={{ fontFamily: 'var(--font-display)', color: '#3d2208', fontSize: '1.4rem', marginBottom: '8px' }}>
          Панель администратора
        </h2>
        <p style={{ color: '#8b6c42', fontSize: '12px', marginBottom: '20px' }}>
          Доступ проверяется по ID профиля Манакоста.
        </p>
        {msg && (
          <div style={{
            maxWidth: '340px',
            margin: '0 auto 14px',
            padding: '9px 12px',
            borderRadius: '8px',
            background: msg.type === 'ok' ? '#d1fae5' : '#fee2e2',
            color: msg.type === 'ok' ? '#065f46' : '#991b1b',
            fontSize: '12px',
          }}>
            {msg.text}
          </div>
        )}
        <form onSubmit={authStep === 'password' ? handleAuth : handleVerifyCode}
          style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '280px', margin: '0 auto' }}>
          {authStep === 'password' ? (
            <>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Email"
                style={ADMIN_INPUT}
                autoComplete="email"
                autoFocus
              />
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Пароль"
                style={ADMIN_INPUT}
                autoComplete="current-password"
              />
            </>
          ) : (
            <>
              <p style={{ color: '#8b6c42', fontSize: '12px', margin: 0 }}>
                Код отправлен на <b>{email}</b>
              </p>
              <input
                type="text"
                inputMode="numeric"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-значный код"
                style={{ ...ADMIN_INPUT, textAlign: 'center', letterSpacing: '0.18em', fontSize: '18px' }}
                autoComplete="one-time-code"
                autoFocus
              />
              <button type="button" onClick={() => { setAuthStep('password'); setCode(''); setMsg(null); }}
                style={{ background: 'none', border: 'none', color: '#8b4513', fontSize: '12px', cursor: 'pointer' }}>
                Изменить email или пароль
              </button>
            </>
          )}
          <button type="submit" style={{
            background: 'linear-gradient(135deg,#6b4c2a,#3a2210)',
            color: '#fcd34d',
            border: '1.5px solid #a88a45',
            borderRadius: '8px',
            padding: '10px',
            fontFamily: 'var(--font-display)',
            fontSize: '15px',
            cursor: authLoading ? 'wait' : 'pointer',
            opacity: authLoading ? 0.75 : 1,
          }} disabled={authLoading}>
            {authLoading ? 'Проверяем...' : authStep === 'password' ? 'Получить код' : 'Войти'}
          </button>
        </form>
      </div>
    );
  }

  // ── Main admin UI ─────────────────────────────────────────────────────────
  return (
    <div className="anim-fade-up" style={{ padding: '0' }}>

      {/* Global status message — visible from both add and delete actions */}
      {msg && (
        <div style={{
          marginBottom: '16px',
          padding: '10px 16px',
          borderRadius: '8px',
          background: msg.type === 'ok' ? '#d1fae5' : '#fee2e2',
          color: msg.type === 'ok' ? '#065f46' : '#991b1b',
          fontSize: '13px',
          lineHeight: '1.5',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
        }}>
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', opacity: 0.5, lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: '18px', paddingBottom: '16px', borderBottom: '2px solid #c4a46a', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', color: '#3d2208', fontSize: '1.5rem' }}>
            Настройка страницы «Статьи»
          </h2>
          <p style={{ color: '#8b6c42', fontSize: '13px', marginTop: '4px' }}>
            Публикации, обложки и промо-материалы для раздела <b>/articles</b>.
          </p>
          {authUser && (
            <p style={{ color: '#6b4c2a', fontSize: '12px', marginTop: '6px' }}>
              Администратор: <b>{authUser.name}</b> · <code style={{ fontFamily: 'monospace' }}>{authUser.id || authUser.profileId}</code>
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <a href="/articles" style={{ ...ADMIN_SECONDARY_BUTTON, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
            Открыть статьи
          </a>
          <button type="button" onClick={() => { void onRefresh({ bust: true }); }} style={{ ...ADMIN_SECONDARY_BUTTON, cursor: 'pointer' }}>
            Обновить
          </button>
          <button onClick={handleLogout} style={{
            background: 'rgba(153,27,27,0.1)',
            color: '#991b1b',
            border: '1px solid #fca5a5',
            borderRadius: '8px',
            padding: '8px 12px',
            fontSize: '13px',
            cursor: 'pointer',
            flexShrink: 0,
          }}>Выйти</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px', marginBottom: '18px' }}>
        {ADMIN_SECTIONS.map(section => {
          const active = section.id === activeSection;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
              style={{
                textAlign: 'left',
                padding: '11px 13px',
                borderRadius: '10px',
                border: active ? '1.5px solid #60a5fa' : '1px solid #c4a46a',
                background: active ? 'linear-gradient(135deg, rgba(37,99,235,0.14), rgba(248,250,255,0.92))' : 'rgba(255,255,255,0.46)',
                color: active ? '#1f3b63' : '#5a3517',
                cursor: 'pointer',
              }}
            >
              <span style={{ display: 'block', fontFamily: 'var(--font-display)', fontSize: '14px' }}>{section.label}</span>
              <span style={{ display: 'block', marginTop: '3px', fontSize: '11px', lineHeight: 1.3, color: active ? '#45607f' : '#8b6c42' }}>{section.description}</span>
            </button>
          );
        })}
      </div>

      {activeSection === 'overview' && (
      <div style={{
        background: 'rgba(139,69,19,0.07)',
        border: '1.5px solid #c4a46a',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '32px',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '18px' }}>
          <AdminStatCard label="Статей" value={String(articles.length)} hint="Текущий опубликованный список" />
          <AdminStatCard
            label="Показываем"
            value={loadingArticles ? 'Загрузка...' : `${filteredArticles.length} из ${articles.length}`}
            hint="С учётом поиска и фильтров"
          />
          <AdminStatCard
            label="Обновлено"
            value={articlesUpdatedAt ? new Date(articlesUpdatedAt).toLocaleString('ru-RU') : '—'}
            hint="Последняя синхронизация списка"
          />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '22px' }}>
          <button type="button" onClick={() => setActiveSection('add')} style={{ ...ADMIN_SECONDARY_BUTTON, cursor: 'pointer' }}>
            Добавить статью
          </button>
          <button type="button" onClick={() => setActiveSection('list')} style={{ ...ADMIN_SECONDARY_BUTTON, cursor: 'pointer' }}>
            Управлять списком
          </button>
          <button type="button" onClick={() => setActiveSection('media')} style={{ ...ADMIN_SECONDARY_BUTTON, cursor: 'pointer' }}>
            Медиа для статей
          </button>
        </div>

        <div style={{
          background: 'rgba(61,34,8,0.05)',
          border: '1.5px solid #c4a46a',
          borderRadius: '12px',
          padding: '18px',
          marginBottom: '22px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ fontFamily: 'var(--font-display)', color: '#6b4c2a', marginBottom: '6px', fontSize: '1rem' }}>
                Позиции классов для тир-листа
              </h3>
              <p style={{ color: '#8b6c42', fontSize: '13px' }}>
                Эти значения показываются на странице тир-листа у классов и в их иконках.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSaveClassPositions}
              disabled={savingPositions}
              style={{
                ...ADMIN_SECONDARY_BUTTON,
                opacity: savingPositions ? 0.7 : 1,
                cursor: savingPositions ? 'not-allowed' : 'pointer',
              }}
            >
              {savingPositions ? 'Сохраняем...' : 'Сохранить позиции'}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
            {tierlistSections.map(section => (
              <label
                key={section.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  padding: '12px',
                  borderRadius: '10px',
                  background: 'rgba(255,255,255,0.42)',
                  border: '1px solid #d3b372',
                }}
              >
                <span style={{ color: '#5a3517', fontSize: '13px', fontWeight: 600 }}>{section.name}</span>
                <input
                  style={ADMIN_INPUT}
                  value={classPositionsDraft[section.id] ?? ''}
                  onChange={e => handlePositionChange(section.id, e.target.value)}
                  placeholder="Например: #1"
                />
              </label>
            ))}
          </div>
        </div>
      </div>
      )}

      {activeSection === 'add' && (
      <div style={{
        background: 'rgba(139,69,19,0.07)',
        border: '1.5px solid #c4a46a',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '32px',
      }}>
        <h3 style={{ fontFamily: 'var(--font-display)', color: '#6b4c2a', marginBottom: '16px', fontSize: '1rem' }}>
          Новая статья
        </h3>
        <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', color: '#6b4c2a', fontSize: '12px', marginBottom: '4px', fontWeight: 600 }}>Заголовок *</label>
              <input style={ADMIN_INPUT} value={form.title} onChange={field('title')} placeholder="Лучшие классы Арены — март 2026" required />
            </div>
            <div>
              <label style={{ display: 'block', color: '#6b4c2a', fontSize: '12px', marginBottom: '4px', fontWeight: 600 }}>Тег</label>
              <input style={ADMIN_INPUT} value={form.tag} onChange={field('tag')} placeholder="Мета / Гайд / Обучение" />
            </div>
            <div>
              <label style={{ display: 'block', color: '#6b4c2a', fontSize: '12px', marginBottom: '4px', fontWeight: 600 }}>Ссылка на статью</label>
              <input style={ADMIN_INPUT} value={form.url} onChange={field('url')} placeholder="https://manacost.ru/..." />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', color: '#6b4c2a', fontSize: '12px', marginBottom: '4px', fontWeight: 600 }}>URL обложки</label>
              <input style={ADMIN_INPUT} value={form.image} onChange={field('image')} placeholder="https://..." />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', color: '#6b4c2a', fontSize: '12px', marginBottom: '4px', fontWeight: 600 }}>Описание (краткое)</label>
              <textarea
                style={{ ...ADMIN_INPUT, minHeight: '80px', resize: 'vertical' }}
                value={form.excerpt}
                onChange={field('excerpt')}
                placeholder="Разбор текущего мета: какие классы показывают наилучший винрейт..."
              />
            </div>
          </div>

          {/* Preview if image URL set */}
          {form.image && (
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '10px', background: 'rgba(255,255,255,0.4)', borderRadius: '8px' }}>
              <img src={articleImageSrc(form.image)} alt="preview"
                style={{ width: '64px', height: '48px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #c4a46a' }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              <span style={{ fontSize: '12px', color: '#8b6c42' }}>Предпросмотр обложки</span>
            </div>
          )}

          <button type="submit" disabled={saving} style={{
            background: saving ? '#aaa' : 'linear-gradient(135deg,#6b4c2a,#3a2210)',
            color: '#fcd34d',
            border: '1.5px solid #a88a45',
            borderRadius: '8px',
            padding: '10px 20px',
            fontFamily: 'var(--font-display)',
            fontSize: '15px',
            cursor: saving ? 'not-allowed' : 'pointer',
            alignSelf: 'flex-start',
          }}>
            {saving ? 'Сохранение...' : 'Добавить статью'}
          </button>
        </form>
      </div>
      )}

      {/* ── Image generator ────────────────────────────────────────────── */}
      {activeSection === 'media' && (
      <div style={{
        background: 'rgba(61,34,8,0.06)',
        border: '1.5px solid #c4a46a',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '32px',
      }}>
        <h3 style={{ fontFamily: 'var(--font-display)', color: '#6b4c2a', marginBottom: '6px', fontSize: '1rem' }}>
          🖼 Генерация картинки
        </h3>
        <p style={{ color: '#8b6c42', fontSize: '13px', marginBottom: '16px' }}>
          Создаёт PNG 1200×680 с топ-10 легендарками и пергаментным фоном.
        </p>

        <button
          onClick={handleGenImage}
          disabled={genBusy}
          style={{
            background: genBusy ? 'rgba(139,69,19,0.3)' : 'linear-gradient(135deg,#6b4c2a,#3a2210)',
            color: genBusy ? '#a88a45' : '#fcd34d',
            border: '1.5px solid #a88a45',
            borderRadius: '8px',
            padding: '10px 22px',
            fontFamily: 'var(--font-display)',
            fontSize: '15px',
            cursor: genBusy ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {genBusy ? (
            <>
              <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', fontSize: '16px' }}>⚙</span>
              Генерируется…
            </>
          ) : '🎨 Создать картинку'}
        </button>

        {/* Log output */}
        {genLog.length > 0 && (
          <div style={{
            marginTop: '14px',
            background: 'rgba(0,0,0,0.06)',
            border: '1px solid #c4a46a',
            borderRadius: '8px',
            padding: '10px 14px',
            fontSize: '12px',
            color: '#5a3a1a',
            fontFamily: 'monospace',
            maxHeight: '100px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}>
            {genLog.map((line, i) => <span key={i}>{line}</span>)}
          </div>
        )}

        {/* Preview + download */}
        {genImgUrl && (
          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <img
              src={genImgUrl}
              alt="Топ легендарки"
              style={{
                width: '100%',
                maxWidth: '600px',
                borderRadius: '10px',
                border: '2px solid #c4a46a',
                boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
              }}
            />
            <a
              href={genImgUrl}
              download="top_legendaries.png"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 18px',
                background: 'linear-gradient(135deg,#1d5921,#0f3012)',
                color: '#86efac',
                border: '1.5px solid #4ade80',
                borderRadius: '8px',
                textDecoration: 'none',
                fontFamily: 'var(--font-display)',
                fontSize: '14px',
                alignSelf: 'flex-start',
              }}
            >
              ⬇ Скачать PNG
            </a>
          </div>
        )}
      </div>
      )}

      {/* ── Existing articles ─────────────────────────────────────────────── */}
      {activeSection === 'list' && (
      <>
      <h3 style={{ fontFamily: 'var(--font-display)', color: '#6b4c2a', marginBottom: '12px', fontSize: '1rem' }}>
        Текущие статьи ({articles.length})
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1.4fr) minmax(160px, 0.8fr) minmax(140px, 0.7fr)', gap: '10px', marginBottom: '14px' }}>
        <input
          style={ADMIN_INPUT}
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Поиск по заголовку, тегу, описанию или URL"
        />
        <select style={ADMIN_INPUT} value={tagFilter} onChange={e => setTagFilter(e.target.value)}>
          <option value="all">Все теги</option>
          {articleTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
        </select>
        <select style={ADMIN_INPUT} value={sortBy} onChange={e => setSortBy(e.target.value as 'newest' | 'oldest' | 'title')}>
          <option value="newest">Сначала новые</option>
          <option value="oldest">Сначала старые</option>
          <option value="title">По алфавиту</option>
        </select>
      </div>
      {loadingArticles ? (
        <p style={{ color: '#8b6c42', fontSize: '14px' }}>Загружаем статьи...</p>
      ) : filteredArticles.length === 0 ? (
        <p style={{ color: '#8b6c42', fontSize: '14px' }}>Нет статей</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filteredArticles.map(a => (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '10px 14px',
              background: 'rgba(139,69,19,0.06)',
              border: '1px solid #c4a46a',
              borderRadius: '10px',
            }}>
              {a.image ? (
                <img src={articleImageSrc(a.image)} alt=""
                  style={{ width: '52px', height: '40px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              ) : (
                <div style={{ width: '52px', height: '40px', borderRadius: '6px', background: 'rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: '20px', opacity: 0.4 }}>📰</span>
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-display)', color: '#3d2208', fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.title}
                </div>
                <div style={{ color: '#8b6c42', fontSize: '11px', marginTop: '2px' }}>
                  {a.date}{a.tag ? ` · ${a.tag}` : ''}
                </div>
              </div>
              {a.url && a.url !== '#' && (
                <a href={a.url} target="_blank" rel="noreferrer"
                  style={{ fontSize: '11px', color: '#8b4513', textDecoration: 'none', flexShrink: 0 }}>
                  ↗
                </a>
              )}
              <button
                onClick={() => handleDelete(a.id, a.title)}
                disabled={deleting === a.id}
                style={{
                  background: '#fee2e2', color: '#991b1b',
                  border: '1px solid #fca5a5', borderRadius: '6px',
                  padding: '5px 11px', cursor: deleting === a.id ? 'not-allowed' : 'pointer',
                  fontSize: '12px', flexShrink: 0,
                  opacity: deleting === a.id ? 0.6 : 1,
                }}
              >
                {deleting === a.id ? '…' : 'Удалить'}
              </button>
            </div>
          ))}
        </div>
      )}
      </>
      )}
    </div>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function SiteFooter({ onNavigate, updatedAt }: { onNavigate: (tab: string) => void; updatedAt: string | null }) {
  const year = new Date().getFullYear();
  const navLinks = [
    { label: 'Главная',    href: '/',            tab: 'home'        },
    { label: 'Классы',     href: '/classes',     tab: 'winrates'    },
    { label: 'Тир-лист',  href: '/tierlist',    tab: 'tierlist'    },
    { label: 'Легендарки', href: '/legendaries', tab: 'legendaries' },
    { label: 'Статьи',     href: '/articles',    tab: 'articles'    },
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

const FAQ_ITEMS = [
  {
    q: 'Какой класс лучший на Арене Hearthstone?',
    a: 'По данным HSReplay и Firestone, в текущем патче топ-3 классы меняются с каждым обновлением. Актуальный рейтинг классов по проценту побед смотрите на странице «Классы».',
  },
  {
    q: 'Как пользоваться тир-листом карт?',
    a: 'Выберите класс в верхней панели тир-листа, чтобы увидеть оценки всех карт именно для него. Карты класса S — авто-пик, A — отличные, B — хорошие, C и ниже — ситуативные.',
  },
  {
    q: 'Как выбрать легендарку на Арене?',
    a: 'На старте Арены вам предлагают группу из трёх легендарных карт. Выбирайте ту группу, у которой наивысший процент побед — это показывает страница «Легендарки».',
  },
  {
    q: 'Как часто обновляются данные?',
    a: 'Данные о винрейтах классов и тир-лист карт обновляются автоматически несколько раз в сутки на основе HSReplay, Firestone и HearthArena.',
  },
  {
    q: 'Что такое винрейт класса на Арене?',
    a: 'Винрейт — процент матчей, выигранных игроками этого класса. Например, 55% означает, что из 100 партий класс выигрывает в среднем 55.',
  },
  {
    q: 'Сколько побед нужно для окупаемости Арены?',
    a: 'Для полной окупаемости (получить золото ≥ стоимости входа) обычно нужно 7+ побед. При 12 победах вы получаете максимальные награды.',
  },
];

function FAQSection() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section aria-labelledby="faq-heading" className="mt-8 mb-2">
      <h2 id="faq-heading" className="font-hs text-[#3d2208] text-xl mb-4">Частые вопросы</h2>
      <div className="flex flex-col gap-2">
        {FAQ_ITEMS.map((item, i) => (
          <div key={i} className="faq-card rounded-xl overflow-hidden"
            style={{ border: '1.5px solid #c4a46a', background: 'linear-gradient(135deg,#f5ead0,#ede0c0)' }}>
            <button
              className="w-full text-left flex items-center justify-between px-4 py-3 gap-2"
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              onClick={() => setOpen(open === i ? null : i)}
              aria-expanded={open === i}
            >
              <span className="font-hs text-[#3d2208] text-sm sm:text-base">{item.q}</span>
              <span className="flex-shrink-0 text-[#8b4513] font-bold text-lg leading-none">{open === i ? '−' : '+'}</span>
            </button>
            <div className="px-4 pb-4 pt-1" hidden={open !== i}>
              <p className="text-[#5c3a21] text-sm leading-relaxed">{item.a}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Breadcrumbs ──────────────────────────────────────────────────────────────

function Breadcrumbs({ items }: { items: { name: string; href: string; onClick?: () => void }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-3">
      <ol
        className="flex items-center gap-1 flex-wrap text-xs text-[#8b6c42]"
        itemScope
        itemType="https://schema.org/BreadcrumbList"
      >
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-1"
            itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
            {i < items.length - 1 ? (
              <>
                <a
                  itemProp="item"
                  href={item.href}
                  onClick={item.onClick ? (e: React.MouseEvent) => { e.preventDefault(); item.onClick!(); } : undefined}
                  className="hover:text-[#4a3018] transition-colors"
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  <span itemProp="name">{item.name}</span>
                </a>
                <span className="opacity-50">›</span>
              </>
            ) : (
              <span itemProp="name" className="text-[#4a3018] font-medium">{item.name}</span>
            )}
            <meta itemProp="position" content={String(i + 1)} />
          </li>
        ))}
      </ol>
    </nav>
  );
}

// ─── InternalLinks ────────────────────────────────────────────────────────────

function InternalLinks({ links }: { links: { label: string; href: string; onClick?: () => void }[] }) {
  return (
    <section aria-label="Смотри также" className="mt-8 pt-4" style={{ borderTop: '1px solid #c4a46a55' }}>
      <p className="text-[#8b6c42] text-xs mb-2 uppercase tracking-wide font-hs">Смотри также</p>
      <div className="flex flex-wrap gap-2">
        {links.map((link, i) => (
          <a
            key={i}
            href={link.href}
            onClick={link.onClick ? (e: React.MouseEvent) => { e.preventDefault(); link.onClick!(); } : undefined}
            className="px-4 py-2 rounded-lg text-sm font-hs transition-all hover:brightness-110"
            style={{
              background: 'linear-gradient(135deg,#ede0c0,#e0cc9e)',
              border: '1.5px solid #c4a46a',
              color: '#4a3018',
              textDecoration: 'none',
            }}
          >
            {link.label}
          </a>
        ))}
      </div>
    </section>
  );
}

// ─── SectionBanner ────────────────────────────────────────────────────────────

function SectionBanner({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <>
      {/* Desktop banner */}
      <div
        className="section-banner-modern relative overflow-hidden hidden sm:flex -mx-6 md:-mx-10 -mt-6 md:-mt-10 mb-6 flex-col items-start justify-center gap-1 px-8 md:px-10"
        style={{
          height: 'clamp(120px, 13vw, 165px)',
          background: [
            'radial-gradient(circle at 82% 18%, rgba(246,206,104,0.24), transparent 26rem)',
            'linear-gradient(135deg, rgba(9,21,39,0.96), rgba(23,43,72,0.9) 54%, rgba(58,31,22,0.74))',
          ].join(', '),
          borderBottom: '1px solid rgba(246, 206, 104, 0.25)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -18px 34px rgba(5,10,19,0.22)',
        }}
      >
        <h1
          className="font-hs"
          style={{
            fontSize: 'clamp(1.6rem, 3.5vw, 2.55rem)',
            color: '#fff7cf',
            textShadow: '0 3px 18px rgba(0,0,0,0.48)',
          }}
        >
          {title}
        </h1>
        <p
          className="font-body font-semibold"
          style={{
            fontSize: 'clamp(0.75rem, 1.4vw, 0.9rem)',
            color: '#c8d5e8',
            textShadow: '0 1px 8px rgba(0,0,0,0.48)',
          }}
        >
          {subtitle}
        </p>
      </div>

      {/* Mobile banner — simple parchment header strip, no image */}
      <div
        className="sm:hidden -mx-3 -mt-3 mb-5 px-4 py-4 section-banner-modern"
        style={{
          background: 'linear-gradient(135deg, #091527, #172b48)',
          borderBottom: '1px solid rgba(246,206,104,0.28)',
        }}
      >
        <h1
          className="font-hs tracking-wide"
          style={{ fontSize: '1.5rem', color: '#fff7cf' }}
        >
          {title}
        </h1>
        <p className="text-[#c8d5e8] text-xs mt-0.5 font-semibold">{subtitle}</p>
      </div>
    </>
  );
}

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

function ArticleCard({
  article,
  idx,
  authUser,
  subscriptionStatus,
  subscriptionLoading = false,
}: {
  article: Article;
  idx: number;
  authUser?: AuthUser | null;
  subscriptionStatus?: SubscriptionStatus | null;
  subscriptionLoading?: boolean;
}) {
  const [imgErr, setImgErr] = useState(false);
  const [opening, setOpening] = useState(false);
  const isFeatured = idx === 0;
  const isVipArticle = isKolodaArticleUrl(article.url);
  const canRequestVipLink = Boolean(authUser && isVipArticle);
  const hasArticleAccess = canAccessArticle(article, subscriptionStatus, authUser);
  const readLabel = opening
    ? 'Открываю…'
    : canRequestVipLink && hasArticleAccess
      ? 'Читать VIP →'
      : canRequestVipLink && subscriptionLoading
        ? 'Проверяем →'
        : 'Читать →';

  const openArticle = async () => {
    if (!article.url || article.url === '#') return;
    if (!isVipArticle) {
      window.open(article.url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (!authUser) {
      window.location.href = '/?login';
      return;
    }
    if (subscriptionLoading) return;
    if (!hasArticleAccess) {
      window.alert('Для VIP-статьи нужна подписка подходящего режима.');
      return;
    }

    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    setOpening(true);
    try {
      const response = await fetch('/api/articles/access-link', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: article.url, title: article.title }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Не удалось открыть статью');
      const nextUrl = String(data.url || article.url);
      if (tab) tab.location.href = nextUrl;
      else window.open(nextUrl, '_blank', 'noopener,noreferrer');
    } catch {
      if (tab) tab.location.href = article.url;
      else window.open(article.url, '_blank', 'noopener,noreferrer');
    } finally {
      setOpening(false);
    }
  };

  return (
    <article
      className={`article-card-modern anim-scale-in rounded-2xl overflow-hidden flex flex-col cursor-pointer transition-all duration-200 ${isFeatured ? 'article-card-featured' : ''}`}
      style={{
        animationDelay: `${idx * 0.06}s`,
      }}
      onClick={openArticle}
    >
      {/* Image */}
      <div className="article-image-shell relative h-44 w-full overflow-hidden flex-shrink-0">
        {!imgErr ? (
          <img src={articleImageSrc(article.image)} alt={article.title} loading="lazy"
            onError={() => setImgErr(true)}
            className="w-full h-full object-cover" />
        ) : (
          <div className="article-image-fallback w-full h-full flex items-center justify-center">
            <BookOpen size={36} aria-hidden="true" />
          </div>
        )}
        {article.tag && (
          <span className="article-tag absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-bold">
            {article.tag}
          </span>
        )}
      </div>
      {/* Body */}
      <div className="article-body-modern p-4 flex flex-col flex-grow gap-2">
        <h3 className="font-hs text-base leading-tight"
          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {article.title}
        </h3>
        <p className="text-xs leading-relaxed flex-grow"
          style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {article.excerpt}
        </p>
        <div className="article-meta-modern flex items-center justify-between mt-1 pt-2">
          <span className="text-xs">
            {formatArticleDate(article.date)}
          </span>
          <span className="article-read-link text-xs font-bold">{readLabel}</span>
        </div>
      </div>
    </article>
  );
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
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.87)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }} />
      <div
        className="flex flex-col items-center gap-3"
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

function DeckMiniSection({ title, value, cards, tone, onCardOpen }: {
  title: string;
  value: string;
  cards: ArenaDeckCard[];
  tone: 'legendary' | 'removed' | 'added';
  onCardOpen: (card: ArenaDeckCard) => void;
}) {
  if (!cards.length) return null;
  const toneStyle = tone === 'legendary'
    ? { border: 'rgba(252,211,77,0.35)', bg: 'rgba(252,211,77,0.08)', text: '#8b5a1a' }
    : tone === 'removed'
      ? { border: 'rgba(220,38,38,0.24)', bg: 'rgba(220,38,38,0.06)', text: '#991b1b' }
      : { border: 'rgba(22,163,74,0.24)', bg: 'rgba(22,163,74,0.07)', text: '#166534' };

  return (
    <section
      className="rounded-xl px-3 py-3"
      style={{ border: `1.5px solid ${toneStyle.border}`, background: toneStyle.bg }}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <h4 className="font-hs text-sm" style={{ color: toneStyle.text }}>{title}</h4>
        <span className="text-xs font-bold text-[#8b6c42]">{value}</span>
      </div>
      <div className="flex gap-2 overflow-x-auto scrollbar-hs pb-1">
        {cards.map((card, idx) => <DeckCardThumb key={`${card.cardId}-${idx}`} card={card} compact onOpen={onCardOpen} />)}
      </div>
    </section>
  );
}

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

function DeckPagination({ page, pageCount, onPage }: {
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  const pageItems = buildDeckPageItems(page, pageCount);
  const go = (nextPage: number) => onPage(Math.min(pageCount, Math.max(1, nextPage)));
  return (
    <nav className="flex items-center justify-center gap-1.5 sm:gap-2" aria-label="Пагинация колод">
      <button
        type="button"
        onClick={() => go(page - 1)}
        disabled={page === 1}
        aria-label="Предыдущая страница"
        className="w-9 h-9 flex items-center justify-center rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ background: 'linear-gradient(135deg,#6b4c2a,#3a2210)', color: '#fcd34d', border: '1.5px solid rgba(252,211,77,0.35)' }}
      >
        <ChevronLeft size={18} />
      </button>
      {pageItems.map((item, idx) => item === 'gap' ? (
        <span key={`gap-${idx}`} className="px-1 text-[#8b6c42] font-bold">...</span>
      ) : (
        <button
          key={item}
          type="button"
          onClick={() => go(item)}
          aria-current={item === page ? 'page' : undefined}
          className="min-w-9 h-9 px-2 rounded-xl text-sm font-bold transition-all"
          style={{
            color: item === page ? '#fcd34d' : '#4a3018',
            background: item === page ? 'linear-gradient(135deg,#6b4c2a,#3a2210)' : 'rgba(255,255,255,0.42)',
            border: '1.5px solid rgba(139,90,26,0.35)',
          }}
        >
          {item}
        </button>
      ))}
      <button
        type="button"
        onClick={() => go(page + 1)}
        disabled={page === pageCount}
        aria-label="Следующая страница"
        className="w-9 h-9 flex items-center justify-center rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ background: 'linear-gradient(135deg,#6b4c2a,#3a2210)', color: '#fcd34d', border: '1.5px solid rgba(252,211,77,0.35)' }}
      >
        <ChevronRight size={18} />
      </button>
    </nav>
  );
}

function DecksTab({ data, loading, error, onNavigate, onQueryChange }: {
  data: ArenaDecksData;
  loading: boolean;
  error: boolean;
  onNavigate: (tab: string) => void;
  onQueryChange: (query: { page: number; className: string }) => void;
}) {
  const [activeClass, setActiveClass] = useState(ALL_DECK_CLASSES);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedCard, setSelectedCard] = useState<ArenaDeckCard | null>(null);
  const topRef = useRef<HTMLDivElement | null>(null);
  const shouldScrollRef = useRef(false);
  const classOptions = useMemo(() => {
    if (data.classOptions?.length) return data.classOptions;
    const map = new Map<string, ArenaDeckClass>();
    data.decks.forEach(deck => deck.classes.forEach(cls => map.set(cls.name, cls)));
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [data.classOptions, data.decks]);
  const filteredCount = data.filteredDecks ?? data.decks.length;
  const pageCount = data.totalPages ?? Math.max(1, Math.ceil(filteredCount / DECKS_PAGE_SIZE));
  const safePage = data.page ?? Math.min(currentPage, pageCount);
  const visibleDecks = data.decks;
  const scrollToTop = useCallback(() => {
    requestAnimationFrame(() => {
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);
  const handlePageChange = useCallback((page: number) => {
    if (page === currentPage) return;
    shouldScrollRef.current = true;
    setCurrentPage(page);
  }, [currentPage]);
  const handleClassChange = useCallback((className: string) => {
    if (className === activeClass && currentPage === 1) return;
    shouldScrollRef.current = true;
    setActiveClass(className);
    setCurrentPage(1);
  }, [activeClass, currentPage]);

  useEffect(() => {
    onQueryChange({ page: currentPage, className: activeClass });
    if (shouldScrollRef.current) {
      shouldScrollRef.current = false;
      scrollToTop();
    }
  }, [activeClass, currentPage, onQueryChange, scrollToTop]);

  return (
    <div ref={topRef}>
      <SectionBanner title="Колоды" subtitle="Победные арена-колоды Hearthstone" />
      <Breadcrumbs items={[
        { name: 'Главная', href: '/', onClick: () => onNavigate('home') },
        { name: 'Колоды', href: '/decks' },
      ]} />

      <section aria-label="Описание раздела">
        <p className="text-[#6b4c2a] text-sm leading-relaxed mb-5 px-1"
          style={{ borderLeft: '3px solid #c4a46a', paddingLeft: '12px' }}>
          Подборка победных колод Арены Hearthstone: финальный список карт, легендарная группа и изменения после Re-draft.
        </p>
      </section>

      <div className="flex items-center justify-between mb-4 -mt-2 flex-wrap gap-2">
        <div className="flex items-center gap-2 text-[#4a3018] text-sm font-bold px-3 py-1.5 rounded-full"
          style={{ background: 'linear-gradient(135deg,#ede0c0,#e0cc9e)', border: '1.5px solid #c4a46a' }}>
          <span>{filteredCount} колод</span>
          {data.totalDecks ? <span className="text-[#8b6c42]">из {data.totalDecks}</span> : null}
          {!loading && filteredCount > 0 ? <span className="text-[#8b6c42]">стр. {safePage}/{pageCount}</span> : null}
        </div>
        <UpdateBadge updatedAt={data.updatedAt} />
      </div>

      {classOptions.length > 0 && (
        <div className="mb-5">
          <div
            className="flex items-center gap-1.5 sm:gap-2 px-3 py-2.5 rounded-2xl overflow-x-auto scrollbar-hs"
            style={{
              background: 'linear-gradient(135deg,#f4e8cc,#ede0c0)',
              border: '1.5px solid #c4a46a',
              boxShadow: 'inset 0 1px 3px rgba(139,69,19,0.15), 0 2px 6px rgba(0,0,0,0.12)',
            }}
          >
            <button
              onClick={() => handleClassChange(ALL_DECK_CLASSES)}
              title="Все классы"
              aria-label="Все классы"
              aria-pressed={activeClass === ALL_DECK_CLASSES}
              className="flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-xl transition-all"
              style={{
                color: activeClass === ALL_DECK_CLASSES ? '#fcd34d' : '#4a3018',
                background: activeClass === ALL_DECK_CLASSES ? 'linear-gradient(135deg,#6b4c2a,#3a2210)' : 'rgba(255,255,255,0.35)',
                border: '1.5px solid rgba(139,90,26,0.35)',
              }}
            >
              <img src={ARENA_ICON} alt="" width={30} height={30} loading="lazy" decoding="async" className="w-8 h-8 object-contain" />
              <span className="sr-only">Все классы</span>
            </button>
            {classOptions.map(cls => {
              const active = activeClass === cls.name;
              return (
                <button
                  key={cls.name}
                  onClick={() => handleClassChange(cls.name)}
                  title={cls.name}
                  aria-label={cls.name}
                  aria-pressed={active}
                  className="flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-xl transition-all"
                  style={{
                    color: active ? '#fcd34d' : '#4a3018',
                    background: active ? 'linear-gradient(135deg,#6b4c2a,#3a2210)' : 'rgba(255,255,255,0.35)',
                    border: '1.5px solid rgba(139,90,26,0.35)',
                  }}
                >
                  <img src={cls.icon} alt="" width={32} height={32} loading="lazy" decoding="async" className="w-8 h-8 object-contain" />
                  <span className="sr-only">{cls.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-[#8b6c42] text-xs mb-5 px-3 py-2 rounded-lg bg-[#8b4513]/10 border border-[#8b4513]/20">
          <AlertTriangle size={13} /><span>Не удалось обновить колоды — показан последний доступный срез</span>
        </div>
      )}

      {data.warning && !loading && (
        <div className="flex items-center gap-2 text-[#8b6c42] text-xs mb-5 px-3 py-2 rounded-lg bg-[#1a2a3a]/10 border border-[#60a5fa]/20">
          <AlertTriangle size={13} /><span>Источник колод временно недоступен — показаны кэшированные данные</span>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-5">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-96 rounded-2xl" />)}
        </div>
      ) : filteredCount === 0 ? (
        <div className="text-center py-14 rounded-2xl"
          style={{ background: 'linear-gradient(135deg,#ede0c0,#e0cc9e)', border: '2px dashed #c4a46a' }}>
          <p className="text-xl font-hs text-[#8b4513] tracking-wide">Колоды не найдены</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <DeckPagination page={safePage} pageCount={pageCount} onPage={handlePageChange} />

          {visibleDecks.map(deck => (
            <article
              key={deck.id}
              className="rounded-2xl overflow-hidden"
              style={{
                background: 'linear-gradient(135deg,#f5ead0,#ede0c0)',
                border: '1.5px solid #c4a46a',
                boxShadow: '0 8px 18px rgba(60,36,12,0.16)',
                contentVisibility: 'auto',
                containIntrinsicSize: '760px',
              }}
            >
              <header className="px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                style={{ background: 'linear-gradient(135deg,#6b4c2a,#3a2210)', borderBottom: '1px solid #a88a45' }}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex -space-x-2 flex-shrink-0">
                    {deck.classes.map(cls => (
                      <img
                        key={`${deck.id}-${cls.name}`}
                        src={cls.icon}
                        alt={cls.name}
                        width={44}
                        height={44}
                        loading="lazy"
                        decoding="async"
                        className="w-11 h-11 rounded-full object-contain"
                        style={{ background: 'rgba(0,0,0,0.28)', border: '1.5px solid rgba(252,211,77,0.55)' }}
                      />
                    ))}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-hs text-[#fcd34d] text-lg leading-tight truncate">{deck.classNames || 'Арена'}</h3>
                    <p className="text-[#d9c08a] text-xs truncate">{deck.player || 'Игрок'} · {deck.cardCount} карт</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="px-4 py-2 rounded-xl text-center"
                    style={{ background: 'rgba(0,0,0,0.25)', border: '1.5px solid rgba(252,211,77,0.35)' }}>
                    <div className="font-hs text-[#fcd34d] text-xl leading-none">{deck.score ?? '—'}</div>
                    <div className="text-[10px] uppercase tracking-wide text-[#c4a46a] mt-1">результат</div>
                  </div>
                </div>
              </header>

              <div className="p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h4 className="font-hs text-[#3d2208] text-base">Финальная колода</h4>
                  <span className="text-xs font-bold text-[#8b6c42]">{deck.cardCount} карт</span>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2.5 sm:gap-3 justify-items-center pb-1">
                  {deck.finalCards.map((card, idx) => <DeckCardThumb key={`${deck.id}-final-${card.cardId}-${idx}`} card={card} onOpen={setSelectedCard} />)}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-3">
                  <DeckMiniSection title="Легендарная группа" value={`${deck.legendaryCards.length} карт`} cards={deck.legendaryCards} tone="legendary" onCardOpen={setSelectedCard} />
                  <DeckMiniSection title="Сброшено в Re-draft" value={`-${deck.removedCards.reduce((sum, card) => sum + card.count, 0)}`} cards={deck.removedCards} tone="removed" onCardOpen={setSelectedCard} />
                  <DeckMiniSection title="Взято в Re-draft" value={`+${deck.addedCards.reduce((sum, card) => sum + card.count, 0)}`} cards={deck.addedCards} tone="added" onCardOpen={setSelectedCard} />
                </div>
              </div>
            </article>
          ))}

          <DeckPagination page={safePage} pageCount={pageCount} onPage={handlePageChange} />
        </div>
      )}
      {selectedCard && <DeckCardLightbox card={selectedCard} onClose={() => setSelectedCard(null)} />}
    </div>
  );
}

function ArticlesTab({
  data,
  loading,
  onNavigate,
  authUser,
  subscriptionStatus,
  subscriptionLoading,
}: {
  data: ArticlesData;
  loading: boolean;
  onNavigate: (tab: string) => void;
  authUser?: AuthUser | null;
  subscriptionStatus?: SubscriptionStatus | null;
  subscriptionLoading?: boolean;
}) {
  return (
    <div>
      <SectionBanner title="Статьи" subtitle="Гайды, разборы мета и советы по режиму Арена" />
      <Breadcrumbs items={[
        { name: 'Главная', href: '/', onClick: () => onNavigate('home') },
        { name: 'Статьи', href: '/articles' },
      ]} />

      {loading ? (
        <div className="articles-grid-modern grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1,2,3].map(i => <div key={i} className="skeleton h-72 rounded-2xl" />)}
        </div>
      ) : data.articles.length === 0 ? (
        <div className="articles-empty-modern text-center py-16">
          <BookOpen size={42} aria-hidden="true" className="mx-auto mb-3" />
          <p className="font-hs text-xl">Статьи скоро появятся</p>
        </div>
      ) : (
        <div className="articles-grid-modern grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {data.articles.map((a, i) => (
            <React.Fragment key={a.id}>
              <ArticleCard
                article={a}
                idx={i}
                authUser={authUser}
                subscriptionStatus={subscriptionStatus}
                subscriptionLoading={subscriptionLoading}
              />
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

const TABS = [
  { id: 'home',        label: 'Главная',    icon: Home,     slug: '/'           },
  { id: 'articles',    label: 'Статьи',     icon: BookOpen, slug: '/articles'   },
  { id: 'guides-archive', label: 'Архив гайдов', icon: BookOpen, slug: '/guides-archive' },
  { id: 'contests',    label: 'Конкурсы',   icon: Gift,     slug: '/contests'   },
  { id: 'standard-matchups', label: 'Матчапы', icon: Swords, slug: '/standard/matchups' },
  { id: 'winrates',    label: 'Классы',     icon: Trophy,   slug: '/classes'    },
  { id: 'tierlist',    label: 'Тир-лист',   icon: Scroll,   slug: '/tierlist'   },
  { id: 'legendaries', label: 'Легендарки', icon: Star,      slug: '/legendaries'},
  { id: 'bg-heroes', label: 'Герои', icon: UserCircle, slug: '/heroes' },
  { id: 'bg-library', label: 'Библиотека', icon: Library, slug: '/library' },
  { id: 'bg-tier-list', label: 'Тир-лист', icon: Scroll, slug: '/battlegrounds/tier-list' },
  { id: 'bg-strategies', label: 'Конструктор стратегий', icon: Grid3X3, slug: '/battlegrounds/strategies' },
  { id: 'bg-tier-builder', label: 'Конструктор тир-листов', icon: List, slug: '/battlegrounds/tier-builder' },
  { id: 'admin-panel', label: 'Админ панель', icon: ShieldCheck, slug: '/admin' },
] as const;

const BG_TAB_IDS = new Set<string>(['bg-heroes', 'bg-library', 'bg-tier-list', 'bg-strategies', 'bg-tier-builder']);
const ADMIN_TAB_IDS = new Set<string>(['admin-panel']);
const TOP_LEVEL_TAB_IDS = new Set<string>(['articles']);
const STANDARD_TAB_IDS = new Set<string>(['standard-matchups']);
const MISC_TAB_IDS = new Set<string>(['guides-archive', 'contests']);
const TOP_LEVEL_TABS = TABS.filter(tab => TOP_LEVEL_TAB_IDS.has(tab.id));
const STANDARD_TABS = TABS.filter(tab => STANDARD_TAB_IDS.has(tab.id));
const ARENA_TABS = TABS.filter(tab => !BG_TAB_IDS.has(tab.id) && !TOP_LEVEL_TAB_IDS.has(tab.id) && !STANDARD_TAB_IDS.has(tab.id) && !MISC_TAB_IDS.has(tab.id) && !ADMIN_TAB_IDS.has(tab.id) && tab.id !== 'home');
const BG_TABS = TABS.filter(tab => BG_TAB_IDS.has(tab.id));
const ADMIN_TABS = TABS.filter(tab => ADMIN_TAB_IDS.has(tab.id));
const MISC_TABS = TABS.filter(tab => MISC_TAB_IDS.has(tab.id));

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

// ─── Per-tab SEO meta ─────────────────────────────────────────────────────────

const SITE_URL = 'https://arena.hs-manacost.ru';

const PAGE_META: Record<string, { title: string; description: string; slug: string }> = {
  home:        {
    title:       'HS-Arena — Тир-лист и Винрейты для Арены Hearthstone',
    description: 'Актуальная статистика Арены Hearthstone: тир-лист карт, винрейты классов, легендарные группы. Данные обновляются 4 раза в сутки.',
    slug:        '/',
  },
  winrates:    {
    title:       'Винрейт классов — Арена Hearthstone | HS-Arena',
    description: 'Актуальные винрейты всех 11 классов в режиме Арена Hearthstone. Рейтинг на основе миллионов партий, обновляется автоматически.',
    slug:        '/classes',
  },
  tierlist:    {
    title:       'Тир-лист карт — Арена Hearthstone | HS-Arena',
    description: 'Полный тир-лист карт для каждого класса в режиме Арена Hearthstone. Лучшие карты текущего патча с оценками от S до F.',
    slug:        '/tierlist',
  },
  legendaries: {
    title:       'Легендарки на Арене Hearthstone — Лучшие группы | HS-Arena',
    description: 'Какую легендарную карту выбрать на Арене? Все группы первого выбора с процентом побед. Обновляется автоматически.',
    slug:        '/legendaries',
  },
  articles:    {
    title:       'Статьи и гайды по Арене Hearthstone | HS-Arena',
    description: 'Гайды, разборы и советы по режиму Арена в Hearthstone от команды Manacost.',
    slug:        '/articles',
  },
  'guides-archive': {
    title:       'Архив гайдов Hearthstone | Manacost Stats',
    description: 'Архив старых гайдов, мета-отчетов и материалов Koloda Hearthstone в удобном формате для чтения.',
    slug:        '/guides-archive',
  },
  contests:    {
    title:       'Конкурсы Манакоста | Manacost Stats',
    description: 'Конкурсы для подписчиков Манакоста: участие, проверка подписки и публикация ID победителей.',
    slug:        '/contests',
  },
  'standard-matchups': {
    title:       'Матчапы Стандарта Hearthstone | Manacost Stats',
    description: 'Матрица матчапов актуальной меты Стандарта по данным HSGuru: винрейты архетипов против друг друга.',
    slug:        '/standard/matchups',
  },
  'admin-panel': {
    title:       'Админ панель конкурсов | Manacost Stats',
    description: 'Панель администратора конкурсов Манакоста: создание конкурсов, заявки, победители и поиск профилей.',
    slug:        '/admin',
  },
  'bg-strategies': {
    title:       'Конструктор стратегий Полей Сражений | HS-Arena',
    description: 'Инструмент для сборки и визуализации стратегий Hearthstone Battlegrounds.',
    slug:        '/battlegrounds/strategies',
  },
  'bg-heroes': {
    title:       'Герои Полей Сражений Hearthstone | HS-Arena',
    description: 'Тир-лист героев Hearthstone Battlegrounds с отдельными страницами героев, способностями, компаньонами и статистикой.',
    slug:        '/heroes',
  },
  'bg-library': {
    title:       'Библиотека Полей Сражений Hearthstone | HS-Arena',
    description: 'Библиотека существ и заклинаний Hearthstone Battlegrounds: актуальный пул, архив, фильтры, статистика и отдельные страницы карт.',
    slug:        '/library',
  },
  'bg-tier-list': {
    title:       'Тир-лист Полей Сражений Hearthstone | HS-Arena',
    description: 'Тир-лист Hearthstone Battlegrounds: существа, стратегии, заклинания и аксессуары с фильтрами и просмотром карт.',
    slug:        '/battlegrounds/tier-list',
  },
  'bg-tier-builder': {
    title:       'Конструктор тир-листов Полей Сражений | HS-Arena',
    description: 'Инструмент для создания собственных тир-листов карт Hearthstone Battlegrounds.',
    slug:        '/battlegrounds/tier-builder',
  },
};

/** Update <title>, meta description and canonical <link> for the current tab */
function applyPageMeta(tabId: string): void {
  const meta = PAGE_META[tabId] ?? PAGE_META.home;

  document.title = meta.title;

  const desc = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (desc) desc.content = meta.description;

  const ogTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]');
  if (ogTitle) ogTitle.content = meta.title;

  const ogDesc = document.querySelector<HTMLMetaElement>('meta[property="og:description"]');
  if (ogDesc) ogDesc.content = meta.description;

  const ogUrl = document.querySelector<HTMLMetaElement>('meta[property="og:url"]');
  if (ogUrl) ogUrl.content = `${SITE_URL}${meta.slug}`;

  const twTitle = document.querySelector<HTMLMetaElement>('meta[name="twitter:title"]');
  if (twTitle) twTitle.content = meta.title;

  const twDesc = document.querySelector<HTMLMetaElement>('meta[name="twitter:description"]');
  if (twDesc) twDesc.content = meta.description;

  let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
  }
  canonical.href = `${SITE_URL}${meta.slug}`;
}

type TabId = (typeof TABS)[number]['id'];
const PRIVATE_SUBSCRIPTION_TAB_ENTITLEMENTS: Partial<Record<TabId, SubscriptionEntitlementKey>> = {
  'standard-matchups': 'standard',
  winrates: 'arena',
  tierlist: 'arena',
  legendaries: 'arena',
  'bg-heroes': 'battlegrounds',
  'bg-library': 'battlegrounds',
  'bg-tier-list': 'battlegrounds',
  'bg-strategies': 'battlegrounds',
  'bg-tier-builder': 'battlegrounds',
  'guides-archive': 'guidesArchive',
};
const SUPPORT_PROMPT_STORAGE_KEY = 'manacost_support_prompt_closed_at';
const SUPPORT_PROMPT_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;
const SUPPORT_URL = 'https://boosty.to/kolodahearthstone';

function SupportPrompt() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const timer = window.setTimeout(() => {
      if (window.matchMedia('(max-width: 760px)').matches) return;
      const closedAt = Number(window.localStorage.getItem(SUPPORT_PROMPT_STORAGE_KEY) || 0);
      if (!closedAt || Date.now() - closedAt >= SUPPORT_PROMPT_INTERVAL_MS) setVisible(true);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, []);

  const close = useCallback(() => {
    try {
      window.localStorage.setItem(SUPPORT_PROMPT_STORAGE_KEY, String(Date.now()));
    } catch { /* storage may be disabled */ }
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <aside className="support-prompt" aria-label="Поддержать Манакост">
      <button type="button" className="support-prompt__close" onClick={close} aria-label="Закрыть уведомление">
        <X size={15} />
      </button>
      <div className="support-prompt__copy">
        <strong>Манакост держится на вашей поддержке</strong>
        <span>Донат или подписка помогают оплачивать серверы, парсинг статистики и новые инструменты.</span>
        <span>Отсканируйте QR или откройте Boosty.</span>
      </div>
      <a className="support-prompt__qr" href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" aria-label="Открыть Boosty">
        <img src="/ad/donate-qr.png" alt="QR код Boosty Манакоста" />
      </a>
      <a className="support-prompt__button" href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" onClick={close}>
        Открыть Boosty
      </a>
    </aside>
  );
}

function isRemovedPagePath(path: string): boolean {
  return path === '/decks' || path.startsWith('/decks/') || path.startsWith('/jobs');
}

/** Resolve tab from current pathname */
function tabFromPath(path: string): TabId {
  if (isRemovedPagePath(path)) return 'home';
  const found = TABS.find(t => t.slug !== '/' && path.startsWith(t.slug));
  return (found?.id ?? 'home') as TabId;
}

// SEO: SPA fallback serves HTTP 200 for any path; mark unknown paths noindex
// so crawlers drop them instead of indexing soft-404 duplicates of the home page.
function isKnownPath(path: string): boolean {
  const clean = path.replace(/\/+$/, '') || '/';
  if (clean === '/') return true;
  if (isRemovedPagePath(clean)) return true;
  return TABS.some(t => t.slug !== '/' && (clean === t.slug || clean.startsWith(t.slug + '/')));
}

// ─── Tab transition wrapper ────────────────────────────────────────────────────
function TabTransition({ tabKey, children }: { tabKey: string; children: React.ReactNode }) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    setEntered(false);
    const frame = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(frame);
  }, [tabKey]);

  return (
    <div className={`route-transition${entered ? ' route-transition-enter' : ''}`} data-route-key={tabKey}>
      {children}
    </div>
  );
}

const loadDeferredRoutesModule = () => import('./features/DeferredRoutes');
const loadBgLibraryModule = () => import('./features/BgLibrary');
const loadGuidesArchiveModule = () => import('./features/GuidesArchive');
const loadStandardMatchupsModule = () => import('./features/StandardMatchups');
const loadHomeModule = () => import('./features/Home');
const loadContestsModule = () => import('./features/Contests');
const loadBattlegroundsModule = () => import('./features/Battlegrounds');

const LazyWinrates = React.lazy(() => loadDeferredRoutesModule().then(module => ({ default: module.Winrates })));
const LazyTierList = React.lazy(() => loadDeferredRoutesModule().then(module => ({ default: module.TierList })));
const LazyLegendaries = React.lazy(() => loadDeferredRoutesModule().then(module => ({ default: module.Legendaries })));
const LazyLoginPanel = React.lazy(() => loadDeferredRoutesModule().then(module => ({ default: module.LoginPanel })));
const LazyAdminPanel = React.lazy(() => loadDeferredRoutesModule().then(module => ({ default: module.AdminPanel })));
const LazyArticlesTab = React.lazy(() => loadDeferredRoutesModule().then(module => ({ default: module.ArticlesTab })));
const LazyBgLibrary = React.lazy(loadBgLibraryModule);
const LazyGuidesArchive = React.lazy(loadGuidesArchiveModule);
const LazyStandardMatchupsPage = React.lazy(loadStandardMatchupsModule);
const LazyHomeTab = React.lazy(loadHomeModule);
const LazyContestsPage = React.lazy(() => loadContestsModule().then(module => ({ default: module.ContestsPage })));
const LazyContestAdminPanel = React.lazy(() => loadContestsModule().then(module => ({ default: module.ContestAdminPanel })));
const LazyBattlegroundHeroesRoute = React.lazy(() => loadBattlegroundsModule().then(module => ({ default: module.BattlegroundHeroesRoute })));
const LazyBattlegroundTierList = React.lazy(() => loadBattlegroundsModule().then(module => ({ default: module.BattlegroundTierList })));
const LazyBattlegroundStrategyBuilderEmbed = React.lazy(() => loadBattlegroundsModule().then(module => ({ default: module.BattlegroundStrategyBuilderEmbed })));
const LazyBattlegroundTierBuilderEmbed = React.lazy(() => loadBattlegroundsModule().then(module => ({ default: module.BattlegroundTierBuilderEmbed })));

const ROUTE_PRELOADERS: Partial<Record<TabId | 'login', () => Promise<unknown>>> = {
  home: loadHomeModule,
  winrates: loadDeferredRoutesModule,
  tierlist: loadDeferredRoutesModule,
  legendaries: loadDeferredRoutesModule,
  articles: loadDeferredRoutesModule,
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

function scheduleDelayedIdleTask(task: () => void, delay = 900, idleTimeout = 1200): () => void {
  if (typeof window === 'undefined') return () => {};
  let cancelIdle = () => {};
  const timer = window.setTimeout(() => {
    cancelIdle = scheduleIdleTask(task, idleTimeout);
  }, delay);
  return () => {
    window.clearTimeout(timer);
    cancelIdle();
  };
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
  const isAdminMode = wantsAdmin;
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
        <PaywallGate
          active
          title={`${activeTabLabel} доступны подписчикам`}
          authUser={appAuthUser}
          subscriptionStatus={appSubscription}
          subscriptionLoading={appSubscriptionLoading}
          onRefreshSubscription={() => fetchAppSubscription(true)}
        >
          <SubscriptionLockedPreview title={activeTabLabel} />
        </PaywallGate>
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
  const tierlistRequestedRef = useRef(false);
  const legendariesRequestedRef = useRef(false);
  const warmedTierlistSourcesRef = useRef<Set<TierlistSource>>(new Set());
  const warmedRoutesRef = useRef<Set<TabId | 'login'>>(new Set());

  const fetchHomeSummary = useCallback(async () => {
    const gen = ++homeSummaryGenRef.current;
    const cacheKey = 'home_summary_v1';
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
    const cacheKey = `leg_ru_cards_v3_${src}`;
    const baseUrl = `/api/legendaries?source=${src}&v=ru_cards_v3`;
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

  const warmRoute = useCallback((route: TabId | 'login') => {
    if (warmedRoutesRef.current.has(route)) return;
    warmedRoutesRef.current.add(route);
    preloadRouteModule(route);

    if (route === 'articles' && !articlesRequestedRef.current) {
      void fetchArticles({ silent: true });
    }
  }, [fetchArticles]);

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
	    const needsArticles = activeTab === 'articles' || wantsAdmin;
	    if (activeTab === 'articles' && (privateRouteChecking || privateRouteLocked)) return;
	    if (!needsArticles || articlesRequestedRef.current) return;
	    void fetchArticles();
	  }, [activeTab, privateRouteChecking, privateRouteLocked, wantsAdmin, fetchArticles]);

  useEffect(() => {
    const likelyRoutes: Array<TabId | 'login'> = activeTab === 'home'
      ? ['articles', 'contests', 'winrates', 'tierlist', 'bg-tier-list', 'login']
      : ['home', 'articles', 'contests', 'login'];

    return scheduleDelayedIdleTask(() => {
      likelyRoutes.forEach(route => warmRoute(route));
    }, 650, 1800);
  }, [activeTab, warmRoute]);

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

	  return (
    <div className="min-h-screen bg-wood text-[#3d2a1e] font-body">
      <header className="arena-mobile-topbar lg:hidden">
        <a
          href="/"
          onClick={(e) => { e.preventDefault(); navigate('home'); }}
          className="arena-mobile-brand"
          aria-label="На главную"
        >
          <span>Manacost Stats</span>
        </a>
        {!isAdminMode && (
          <button
            type="button"
            onClick={() => setMobileMenuOpen(v => !v)}
            className="arena-mobile-nav-toggle"
            aria-expanded={mobileMenuOpen}
            aria-controls="arena-mobile-menu"
            aria-label={mobileMenuOpen ? 'Закрыть меню' : 'Открыть меню'}
          >
            {mobileMenuOpen ? <X size={21} /> : <Menu size={21} />}
          </button>
        )}
      </header>

      {!isAdminMode && mobileMenuOpen && (
        <>
          <button
            type="button"
            className="arena-mobile-drawer-backdrop lg:hidden"
            aria-label="Закрыть меню"
            onClick={() => setMobileMenuOpen(false)}
          />
          <nav id="arena-mobile-menu" className="arena-mobile-menu lg:hidden" aria-label="Мобильная навигация">
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
            {BG_TABS.map(tab => {
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
            <div className="arena-mobile-menu-section" aria-label="Раздел Разное">
              Разное
            </div>
            {MISC_TABS.map(tab => {
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
              <span>
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
              {BG_TABS.map(tab => {
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
              <div className="arena-sidebar-section" aria-label="Раздел Разное">
                Разное
              </div>
              {MISC_TABS.map(tab => {
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

        <div className={`arena-workspace ${isFullWidthBuilder ? 'arena-workspace-wide' : ''}`}>
          <main className={`arena-main relative flex flex-col items-center ${isFullWidthBuilder ? 'arena-main-wide' : ''}`} role="main">
        {/* Parchment container */}
        <div className={`arena-content w-full max-w-6xl mx-auto bg-parchment rounded-xl border-[3px] sm:border-[4px] border-[#6b4c2a] shadow-[inset_0_0_60px_rgba(139,69,19,0.15),0_0_0_2px_#2c1e16,0_15px_30px_rgba(0,0,0,0.6)] p-3 sm:p-6 md:p-10 relative z-0 ${isFullWidthBuilder ? 'arena-content-wide' : ''}`}>
          <div className="absolute top-0 left-0 w-8 h-8 sm:w-16 sm:h-16 border-t-2 sm:border-t-4 border-l-2 sm:border-l-4 border-gold rounded-tl-xl opacity-50" />
          <div className="absolute top-0 right-0 w-8 h-8 sm:w-16 sm:h-16 border-t-2 sm:border-t-4 border-r-2 sm:border-r-4 border-gold rounded-tr-xl opacity-50" />
          <div className="absolute bottom-0 left-0 w-8 h-8 sm:w-16 sm:h-16 border-b-2 sm:border-b-4 border-l-2 sm:border-l-4 border-gold rounded-bl-xl opacity-50" />
          <div className="absolute bottom-0 right-0 w-8 h-8 sm:w-16 sm:h-16 border-b-2 sm:border-b-4 border-r-2 sm:border-r-4 border-gold rounded-br-xl opacity-50" />

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
                  <React.Suspense fallback={<RouteFallback minHeight={720} />}>
                    <LazyHomeTab
                      winratesData={winratesData}
                      loadingWinrates={loadingWinrates}
                      homeSummaryData={homeSummaryData}
                      loadingHomeSummary={loadingHomeSummary}
                      onNavigate={(tab: string) => navigate(tab as TabId)}
                      faq={<FAQSection />}
                    />
                  </React.Suspense>
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

        <SiteFooter onNavigate={(tab: string) => navigate(tab as TabId)} updatedAt={globalUpdatedAt} />
        <SupportPrompt />
        </div>
      </div>
    </div>
  );
}

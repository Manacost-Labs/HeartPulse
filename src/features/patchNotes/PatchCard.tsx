import React, { useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, Coins, ImageOff, RefreshCw, Shield, ZoomIn } from 'lucide-react';
import type { PatchCardView, PatchChangeView, PatchKind, PatchNotesMode } from '../../modules/patchNotes/public';
import { wordDiff } from '../../vendor/varylo-ui/gaming/patch';
import { publicResourceImageUrl, publicResourceUrl } from '../../publicResourceUrl';
import { CardHistory, CopyLinkButton } from './PatchCardExtras';
import { ArchetypeChips } from './PatchMetaImpact';
import { cardArtSources } from './patchArt';

/* One change card: the card picture, Russian name, kind badge and was → now lines. */

export const KIND_LABELS: Record<PatchKind, { one: string; many: string; only: string }> = {
  buff: { one: 'Усиление', many: 'Усиления', only: 'Только бафы' },
  nerf: { one: 'Ослабление', many: 'Ослабления', only: 'Только нерфы' },
  rework: { one: 'Изменение', many: 'Изменения', only: 'Только изменения' },
};
const KIND_ICONS: Record<PatchKind, typeof ArrowUp> = { buff: ArrowUp, nerf: ArrowDown, rework: RefreshCw };
export const KINDS: PatchKind[] = ['buff', 'nerf', 'rework'];
/** Highlights and the first cards load eagerly; the rest wait for the scroll. */
export const EAGER_CARDS = 4;

export type CardHandlers = {
  onPreview: (card: PatchCardView, target: HTMLElement) => void;
  onPreviewEnd: () => void;
  onOpen: (card: PatchCardView) => void;
};

/** A catalog render through the site's image proxy; unknown hosts are not loaded at all. */
function proxiedRender(card: PatchCardView, width?: number): string {
  const render = publicResourceUrl(card.renderUrl);
  if (!render.startsWith('/api/public-resource/')) return '';
  return width ? publicResourceImageUrl(card.renderUrl, { width }) : render;
}

/** The picture in the card: a Constructed card render, the Battlegrounds catalog render, else the proxy's art. */
function cardPicture(card: PatchCardView): { src: string; width: number; height: number; contain: boolean } | null {
  if (!card.cardId) return null;
  const render = card.mode === 'battlegrounds' ? proxiedRender(card, 300) : '';
  if (render) return { src: render, width: 300, height: 455, contain: false };
  if (card.art === 'card') return { src: card.thumb ?? '', width: 360, height: 497, contain: false };
  return { src: card.thumb ?? '', width: 360, height: card.art === 'hero' ? 546 : 360, contain: true };
}

export function previewSource(card: PatchCardView): string {
  const render = proxiedRender(card);
  if (render) return render;
  return card.mode === 'battlegrounds' && card.cardId ? `/api/card-image/${encodeURIComponent(card.cardId)}/full.webp` : '';
}

export function KindBadge({ kind }: { kind: PatchKind }) {
  const Icon = KIND_ICONS[kind];
  return <span className="hp-patch-badge" data-kind={kind}><Icon aria-hidden="true" />{KIND_LABELS[kind].one}</span>;
}

function TextDiff({ change }: { change: PatchChangeView }) {
  const before = change.before?.toString();
  const after = change.after?.toString();
  const tokens = before !== undefined && after !== undefined ? wordDiff(before, after) : null;
  return (
    <div className="hp-change__text">
      {before !== undefined && (
        <p data-side="before">
          <span className="hp-change__tag">Было</span>
          {tokens ? tokens.filter(token => token.op !== 'add').map((token, index) => token.op === 'remove'
            ? <del key={index}>{token.text}</del> : <React.Fragment key={index}>{token.text}</React.Fragment>) : before}
        </p>
      )}
      {after !== undefined && (
        <p data-side="after">
          <span className="hp-change__tag">Стало</span>
          {tokens ? tokens.filter(token => token.op !== 'remove').map((token, index) => token.op === 'add'
            ? <ins key={index}>{token.text}</ins> : <React.Fragment key={index}>{token.text}</React.Fragment>) : after}
        </p>
      )}
      {before === undefined && <p className="hp-change__missing">Прежний текст в статье не указан.</p>}
      {after === undefined && <p className="hp-change__missing">Новый текст в статье не указан.</p>}
    </div>
  );
}

const DIRECTION_TEXT = { buff: 'лучше для игрока', nerf: 'хуже для игрока', neutral: '' } as const;

/**
 * How a number is drawn: the game's own gem for cost, attack and health and
 * the tavern-tier shield; Battlegrounds costs are gold and armor has no game
 * icon on the site, so both use a plain glyph.
 */
type Stat = 'mana' | 'attack' | 'health' | 'tier' | 'gold' | 'armor';
const STAT_ICONS: Partial<Record<Stat, string>> = {
  mana: '/assets/mana-64.webp', attack: '/constructed-filter-icons/attack.webp', health: '/constructed-filter-icons/health.webp',
};

function statOf(change: PatchChangeView, mode: PatchNotesMode): Stat | null {
  if (change.label === 'Стоимость') return mode === 'battlegrounds' ? 'gold' : 'mana';
  if (change.label === 'Атака') return 'attack';
  if (change.label === 'Здоровье') return 'health';
  if (change.label === 'Уровень таверны') return 'tier';
  return change.label.startsWith('Броня') ? 'armor' : null;
}

function StatValue({ stat, value }: { stat: Stat | null; value: number | string }) {
  const text = String(value);
  const icon = stat === 'tier' ? (/^[1-7]$/.test(text) ? `/patch-notes/tier-${text}-48.webp` : null) : stat && STAT_ICONS[stat];
  if (!stat || (stat === 'tier' && !icon)) return <>{text}</>;
  const Glyph = stat === 'gold' ? Coins : Shield;
  return (
    <span className="hp-stat" data-stat={stat}>
      {icon ? <img src={icon} alt="" width={48} height={48} loading="lazy" decoding="async" /> : <Glyph aria-hidden="true" />}
      <span>{text}</span>
    </span>
  );
}

function ChangeLine({ change, mode }: { change: PatchChangeView; mode: PatchNotesMode }) {
  const long = typeof change.before === 'string' && change.before.length > 12 || typeof change.after === 'string' && change.after.length > 12;
  if (long) {
    return <li className="hp-change hp-change--text"><span className="hp-change__label">{change.label}</span><TextDiff change={change} /></li>;
  }
  const up = typeof change.before === 'number' && typeof change.after === 'number' && change.after > change.before;
  const stat = statOf(change, mode);
  // A gem says "cost", "attack" or "health" by itself; armor keeps its "соло"/"дуэты" qualifier.
  const label = stat === 'armor' ? change.label.replace(/^Броня,?\s*/, '') || change.label : change.label;
  return (
    <li className="hp-change" data-direction={change.direction} data-stat={stat ?? undefined} title={change.label}>
      <span className={`hp-change__label${stat && stat !== 'armor' ? ' sr-only' : ''}`}>{stat === 'armor' ? `Броня · ${label}` : label}</span>
      <span className="hp-change__values">
        {change.before !== undefined
          ? <s aria-label={`было ${change.before}`}><StatValue stat={stat} value={change.before} /></s>
          : <span className="hp-change__unknown" title="Прежнее значение в статье не указано">?</span>}
        <span className="hp-change__arrow" aria-hidden="true">→</span>
        <b aria-label={change.after !== undefined ? `стало ${change.after}` : undefined}>
          {change.after !== undefined ? <StatValue stat={stat} value={change.after} /> : '—'}
        </b>
        {change.direction !== 'neutral' && (
          <span className="hp-change__direction" title={DIRECTION_TEXT[change.direction]}>
            {up ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />}
            <span className="sr-only">{DIRECTION_TEXT[change.direction]}</span>
          </span>
        )}
      </span>
    </li>
  );
}

function CardArt({ card, eager, onPreview, onPreviewEnd, onOpen }: CardHandlers & { card: PatchCardView; eager: boolean }) {
  const [failed, setFailed] = useState(false);
  const picture = cardPicture(card);
  if (!picture || failed) {
    return (
      <span className="hp-patch-card__art" data-empty="">
        <ImageOff aria-hidden="true" />
        <span>{picture ? 'Картинка недоступна' : 'Нет в каталоге карт'}</span>
      </span>
    );
  }
  return (
    <button type="button" className="hp-patch-card__art" data-contain={picture.contain || undefined}
      aria-label={`Полная карта: ${card.name}`}
      onMouseEnter={event => onPreview(card, event.currentTarget)} onMouseLeave={onPreviewEnd}
      onFocus={event => onPreview(card, event.currentTarget)} onBlur={onPreviewEnd}
      onClick={() => { onPreviewEnd(); onOpen(card); }}>
      <img src={picture.src} alt="" width={picture.width} height={picture.height} loading={eager ? 'eager' : 'lazy'}
        decoding="async" onError={() => setFailed(true)} />
      <span className="hp-patch-card__zoom" aria-hidden="true"><ZoomIn /></span>
    </button>
  );
}

/** Cost, stat and armor moves read in one line, so such cards take the compact three-column layout. */
export function isCompactCard(card: PatchCardView): boolean {
  return !card.hasText && !card.note && card.archetypes.length === 0;
}

/** The card's wiki illustration across the top of a featured highlight. */
function FeaturedPlate({ url }: { url: string }) {
  const art = cardArtSources(url);
  return (
    <span className="hp-patch-card__plate" aria-hidden="true">
      <img src={art.src} srcSet={art.srcSet} sizes="(min-width: 720px) 50vw, 100vw" alt="" width={512} height={288}
        loading="lazy" decoding="async" />
    </span>
  );
}

/**
 * `anchored` cards (the ones in sections) carry the `#card-…` id; highlights
 * repeat a card without it. `featured` adds the card's wide art above it.
 */
export function PatchCard({ card, eager, headingLevel = 'h5', compact = false, anchored = false, featured = false, ...handlers }: CardHandlers & {
  card: PatchCardView; eager: boolean; headingLevel?: 'h3' | 'h5'; compact?: boolean; anchored?: boolean; featured?: boolean;
}) {
  const Heading = headingLevel;
  const headingId = `hp-patch-${headingLevel}-${card.id}`;
  const plate = featured && card.artwork ? card.artwork.url : null;
  return (
    <article className="hp-patch-card" id={anchored ? card.anchor : undefined} data-kind={card.kind}
      data-compact={compact || undefined} data-featured={plate ? '' : undefined} aria-labelledby={headingId}>
      {plate && <FeaturedPlate url={plate} />}
      <CardArt card={card} eager={eager} {...handlers} />
      <div className="hp-patch-card__body">
        <div className="hp-patch-card__head">
          <div className="hp-patch-card__tools">
            <KindBadge kind={card.kind} />
            {anchored && <CopyLinkButton card={card} />}
          </div>
          <Heading id={headingId} className="hp-patch-card__name">{card.name}</Heading>
          {(card.typeLabel || card.sourceName) && (
            <p className="hp-patch-card__meta">
              {card.typeLabel}
              {card.sourceName && <span lang="en">{card.typeLabel ? ' · ' : ''}{card.sourceName}</span>}
            </p>
          )}
        </div>
        <ul className="hp-patch-card__changes">
          {card.changes.map((change, index) => <ChangeLine key={`${change.label}-${index}`} change={change} mode={card.mode} />)}
        </ul>
        {card.note && <p className="hp-patch-card__note"><span>Комментарий разработчиков:</span> {card.note}</p>}
        <ArchetypeChips card={card} />
        <CardHistory card={card} />
        {card.cardUrl && <a className="hp-patch-card__link" href={card.cardUrl}>Карта и колоды с ней <ArrowRight aria-hidden="true" /></a>}
      </div>
    </article>
  );
}


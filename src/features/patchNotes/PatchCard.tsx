import React, { useState } from 'react';
import { ArrowRight, Coins, Ellipsis, ImageOff, Shield } from 'lucide-react';
import { patchHasWideArtwork, type PatchCardView, type PatchChangeView, type PatchKind, type PatchNotesMode } from '../../modules/patchNotes/public';
import { wordDiff } from '../../vendor/varylo-ui/gaming/patch';
import { publicResourceImageUrl, publicResourceUrl } from '../../publicResourceUrl';
import { CardHistory, CopyLinkButton } from './PatchCardExtras';
import { ArchetypeChips } from './PatchMetaImpact';
import { cardArtSources } from './patchArt';
import { KIND_ICONS, KIND_LABELS } from './patchKinds';

/*
 * One change card: the render, the name and the change itself. Everything
 * secondary — the type and English name, archetypes that play the card, its
 * earlier changes and the links — waits behind the card's "…" disclosure.
 */

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

/** The direction as a shape, so it never rests on colour alone. */
function KindMark({ kind }: { kind: PatchKind }) {
  const Icon = KIND_ICONS[kind];
  return <span className="hp-patch-kind" data-kind={kind} title={KIND_LABELS[kind]}><Icon aria-hidden="true" /><span className="sr-only">{KIND_LABELS[kind]}</span></span>;
}

/** Old and new rule text as one sentence: removed words struck out, added words marked. */
function TextDiff({ change }: { change: PatchChangeView }) {
  const before = change.before?.toString();
  const after = change.after?.toString();
  if (before === undefined || after === undefined) {
    return (
      <p className="hp-change__text">
        {after ?? <del>{before}</del>}
        {' '}<small>{after === undefined ? 'Новый текст в статье не указан.' : 'Прежний текст в статье не указан.'}</small>
      </p>
    );
  }
  return (
    <p className="hp-change__text">
      {wordDiff(before, after).map((token, index) => {
        if (token.op === 'remove') return <del key={index}><span className="sr-only">было: </span>{token.text}</del>;
        if (token.op === 'add') return <ins key={index}><span className="sr-only">стало: </span>{token.text}</ins>;
        return <React.Fragment key={index}>{token.text}</React.Fragment>;
      })}
    </p>
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

/** A rule-text change: one sentence; the label shows only when it says which text (a hero power, a quest reward). */
function TextChange({ change }: { change: PatchChangeView }) {
  return (
    <li className="hp-change hp-change--text">
      <span className={`hp-change__label${change.label === 'Текст' ? ' sr-only' : ''}`}>{change.label}</span>
      <TextDiff change={change} />
    </li>
  );
}

function NumberChange({ change, mode }: { change: PatchChangeView; mode: PatchNotesMode }) {
  const stat = statOf(change, mode);
  // A gem says "cost", "attack" or "health" by itself; armor keeps its "соло"/"дуэты" qualifier.
  const label = stat === 'armor' ? `Броня · ${change.label.replace(/^Броня,?\s*/, '') || change.label}` : change.label;
  const before = change.before === undefined
    ? <span className="hp-change__unknown" title="Прежнее значение в статье не указано">?</span>
    : <s aria-label={`было ${change.before}`}><StatValue stat={stat} value={change.before} /></s>;
  const after = change.after === undefined
    ? <b>—</b>
    : <b aria-label={`стало ${change.after}`}><StatValue stat={stat} value={change.after} /></b>;
  return (
    <li className="hp-change" data-direction={change.direction} data-stat={stat ?? undefined} title={change.label}>
      <span className={`hp-change__label${stat && stat !== 'armor' ? ' sr-only' : ''}`}>{label}</span>
      <span className="hp-change__values">
        {before}
        <span className="hp-change__arrow" aria-hidden="true">→</span>
        {after}
        {change.direction !== 'neutral' && <span className="sr-only">, {DIRECTION_TEXT[change.direction]}</span>}
      </span>
    </li>
  );
}

function ChangeLine({ change, mode }: { change: PatchChangeView; mode: PatchNotesMode }) {
  const long = typeof change.before === 'string' && change.before.length > 12 || typeof change.after === 'string' && change.after.length > 12;
  return long ? <TextChange change={change} /> : <NumberChange change={change} mode={mode} />;
}

function CardArt({ card, eager, onPreview, onPreviewEnd, onOpen }: CardHandlers & { card: PatchCardView; eager: boolean }) {
  const [failed, setFailed] = useState(false);
  const picture = cardPicture(card);
  if (!picture || failed) {
    return (
      <span className="hp-patch-card__art" data-empty="" title={picture ? 'Картинка недоступна' : 'Нет в каталоге карт'}>
        <ImageOff aria-hidden="true" />
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
    </button>
  );
}

/** The type, English name, archetypes, earlier changes and links of a card, folded until asked for. */
function CardDetails({ card, anchored }: { card: PatchCardView; anchored: boolean }) {
  return (
    <details className="hp-patch-card__more">
      <summary aria-label={`Подробнее: ${card.name}`} title="Подробнее"><Ellipsis aria-hidden="true" /></summary>
      <div className="hp-patch-card__details">
        {(card.typeLabel || card.sourceName) && (
          <p className="hp-patch-card__meta">
            {card.typeLabel}
            {card.sourceName && <span lang="en">{card.typeLabel ? ' · ' : ''}{card.sourceName}</span>}
          </p>
        )}
        <ArchetypeChips card={card} />
        <CardHistory card={card} />
        <p className="hp-patch-card__links">
          {card.cardUrl && <a href={card.cardUrl}>Карта и колоды с ней <ArrowRight aria-hidden="true" /></a>}
          {anchored && <CopyLinkButton card={card} />}
        </p>
      </div>
    </details>
  );
}

/** A highlight with wide wiki art stands on it; without art the larger render carries the card alone. */
function FeaturedPlate({ url }: { url: string }) {
  const art = cardArtSources(url);
  return (
    <span className="hp-patch-card__plate" aria-hidden="true">
      <img src={art.src} srcSet={art.srcSet} sizes="(min-width: 960px) 25vw, 100vw" alt="" width={512} height={288} decoding="async" />
    </span>
  );
}

/**
 * `anchored` cards (the ones in sections) carry the `#card-…` id; highlights
 * repeat a card without it. `featured` is a highlight without details;
 * `withArt` puts its wide wiki art on top.
 */
export function PatchCard({ card, eager, headingLevel = 'h5', anchored = false, featured = false, withArt = false, ...handlers }: CardHandlers & {
  card: PatchCardView; eager: boolean; headingLevel?: 'h3' | 'h4' | 'h5'; anchored?: boolean; featured?: boolean; withArt?: boolean;
}) {
  const Heading = headingLevel;
  const headingId = `hp-patch-${headingLevel}-${card.id}`;
  const plate = featured && withArt && patchHasWideArtwork(card) ? card.artwork.url : null;
  return (
    <article className="hp-patch-card" id={anchored ? card.anchor : undefined} data-kind={card.kind}
      data-featured={featured || undefined} data-plate={plate ? '' : undefined} aria-labelledby={headingId}>
      {plate && <FeaturedPlate url={plate} />}
      <CardArt card={card} eager={eager} {...handlers} />
      <div className="hp-patch-card__body">
        <div className="hp-patch-card__title">
          <KindMark kind={card.kind} />
          <Heading id={headingId} className="hp-patch-card__name">{card.name}</Heading>
        </div>
        <ul className="hp-patch-card__changes">
          {card.changes.map((change, index) => <ChangeLine key={`${change.label}-${index}`} change={change} mode={card.mode} />)}
        </ul>
        {card.note && <p className="hp-patch-card__note">{card.note}</p>}
      </div>
      {!featured && <CardDetails card={card} anchored={anchored} />}
    </article>
  );
}

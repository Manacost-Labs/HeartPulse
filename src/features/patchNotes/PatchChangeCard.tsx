import { ArrowRight } from 'lucide-react';
import type { PatchCardView } from '../../modules/patchNotes/public';
import { publicResourceImageUrl, publicResourceUrl } from '../../publicResourceUrl';
import { patchDiffHunks } from '../../modules/patchNotes/public';
import { wordDiff } from '../../vendor/varylo-ui/gaming/patch';
import { changePlates, type ChangePlate } from './patchChangePlates';

/*
 * One changed card as the patch changed it: the card before, an arrow with
 * the plates of what changed, the card after. A card without a pair of pictures
 * is one current picture with the plates beside it. The pictures carry the
 * rule text, so only a card with no picture at all prints its text: once, the
 * changed words marked.
 */

const DIRECTION_TEXT = { buff: 'лучше для игрока', nerf: 'хуже для игрока', neutral: '' } as const;

/** A Battlegrounds render is taller than a Constructed card; both sizes are the archive's own. */
const SIZE = { card: { width: 404, height: 558 }, battleground: { width: 512, height: 776 } } as const;

type Picture = { src: string; width: number; height: number; contain: boolean };

const archivePicture = (url: string, card: PatchCardView): Picture | null => {
  const src = publicResourceImageUrl(url, { width: 480 });
  if (!src.startsWith('/api/public-resource/')) return null;
  return { src, ...(card.mode === 'battlegrounds' ? SIZE.battleground : SIZE.card), contain: false };
};

/** The pair when both pictures reach the site's image proxy; one that does not is no pair. */
function pairOf(card: PatchCardView): { before: Picture; after: Picture } | null {
  if (!card.pair) return null;
  const before = archivePicture(card.pair.before, card);
  const after = archivePicture(card.pair.after, card);
  return before && after ? { before, after } : null;
}

/**
 * The current picture of a card: the catalog render of a Battlegrounds card or of a card the dictionary does not
 * hold, else the game's own latest render (it carries today's rule text, which the site's stored thumbnail may not).
 */
function currentPicture(card: PatchCardView): Picture | null {
  if (!card.cardId) return null;
  const render = publicResourceUrl(card.renderUrl);
  if (render.startsWith('/api/public-resource/')) {
    return { src: publicResourceImageUrl(card.renderUrl, { width: 480 }), ...SIZE.battleground, contain: false };
  }
  if (card.mode === 'battlegrounds') return { src: card.thumb ?? '', width: 360, height: card.art === 'hero' ? 546 : 360, contain: true };
  return { src: publicResourceImageUrl(`/api/public-resource/hsjson/v1/render/latest/ruRU/512x/${encodeURIComponent(card.cardId)}.png`, { width: 480 }), ...SIZE.battleground, contain: false };
}

const CONTEXT_WORDS = 3;

/** Unchanged stretches shrink to a few words around each edit; "…" marks what was left out. */
function trimContext(tokens: { text: string; op: 'same' | 'add' | 'remove' }[]) {
  const last = tokens.length - 1;
  return tokens.map((token, index) => {
    const words = token.text.split(/(?<=\s)/);
    if (token.op !== 'same' || words.length <= CONTEXT_WORDS * 2) return token;
    const head = words.slice(0, CONTEXT_WORDS).join('');
    const tail = words.slice(-CONTEXT_WORDS).join('');
    return { ...token, text: index === 0 ? `… ${tail}` : index === last ? `${head}…` : `${head}… ${tail}` };
  });
}

/**
 * The rule text of a change in one paragraph: the old words struck out, the new ones marked. With `compact`
 * (a card whose picture shows only today's text) only the changed fragment and a few words around it are printed.
 */
function RuleText({ before, after, compact = false }: { before: string | null; after: string | null; compact?: boolean }) {
  const diff = before && after ? patchDiffHunks(wordDiff(before, after)) : [{ text: (before ?? after) ?? '', op: before && !after ? 'remove' as const : 'same' as const }];
  const tokens = compact ? trimContext(diff) : diff;
  return (
    <span className="hp-plate__text">
      {tokens.map((token, index) => (token.op === 'same'
        ? <span key={index}>{token.text}</span>
        : token.op === 'remove'
          ? <del key={index}><span className="sr-only">было </span>{token.text}</del>
          : <ins key={index}><span className="sr-only">стало </span>{token.text}</ins>))}
    </span>
  );
}

function Plate({ plate, withText }: { plate: ChangePlate; withText: boolean }) {
  const { label, before, after, direction, text } = plate;
  return (
    <li className="hp-plate" data-direction={direction}>
      <span className="hp-plate__label">{label}</span>
      {(before !== null || after !== null) && (
        <span className="hp-plate__values">
          {before !== null && <><s><span className="sr-only">было </span>{before}</s><span aria-hidden="true"> → </span></>}
          {before === null && <span className="hp-plate__now">теперь </span>}
          {after !== null && <b><span className="sr-only">стало </span>{after}</b>}
          {direction !== 'neutral' && <span className="sr-only">, {DIRECTION_TEXT[direction]}</span>}
        </span>
      )}
      {withText && text && <RuleText before={text.before} after={text.after} />}
    </li>
  );
}

function Figure({ picture, caption, alt, eager }: { picture: Picture; caption: string; alt: string; eager: boolean }) {
  return (
    <figure className="hp-pc__fig">
      <figcaption>{caption}</figcaption>
      <img src={picture.src} alt={alt} width={picture.width} height={picture.height} data-contain={picture.contain || undefined}
        loading={eager ? 'eager' : 'lazy'} decoding="async" fetchPriority={eager ? 'high' : undefined} />
    </figure>
  );
}

/** `eager`: the card is in the first screen, so its pictures load at once; the rest wait for the scroll. */
export function PatchChangeCard({ card, eager }: { card: PatchCardView; eager: boolean }) {
  const headingId = `hp-pc-${card.id}`;
  const pair = pairOf(card);
  const current = pair ? null : currentPicture(card);
  const plates = changePlates(card);
  const name = card.cardUrl ? <a href={card.cardUrl}>{card.name}</a> : card.name;
  const body = (
    <>
      <h4 id={headingId} className="hp-pc__name">{name}</h4>
      {card.subtitle && <p className="hp-pc__meta">{card.subtitle}</p>}
      {card.sourceName && <p className="hp-pc__meta" lang="en">{card.sourceName}</p>}
    </>
  );
  const list = (withText: boolean) => plates.length > 0 && (
    <ul className="hp-pc__plates" aria-label="Что изменилось">
      {plates.map((plate, index) => <Plate key={`${plate.label}-${index}`} plate={plate} withText={withText} />)}
    </ul>
  );
  const note = card.note && <p className="hp-pc__note">{card.note}</p>;

  if (pair) {
    return (
      <article className="hp-pc" id={card.anchor} data-variant="pair" aria-labelledby={headingId}>
        <header className="hp-pc__head">{body}</header>
        <div className="hp-pc__pair">
          <Figure picture={pair.before} caption="До" alt={`${card.name} до патча`} eager={eager} />
          <div className="hp-pc__change">
            <ArrowRight className="hp-pc__arrow" aria-hidden="true" />
            {list(false)}
          </div>
          <Figure picture={pair.after} caption="После" alt={`${card.name} после патча`} eager={eager} />
        </div>
        {note}
      </article>
    );
  }
  if (current) {
    return (
      <article className="hp-pc" id={card.anchor} data-variant="single" aria-labelledby={headingId}>
        <Figure picture={current} caption="Сейчас" alt={`${card.name} сейчас`} eager={eager} />
        <div className="hp-pc__side">
          {body}
          {list(false)}
          {note}
        </div>
        {plates.filter(plate => plate.text).map((plate, index) => (
          <p key={index} className="hp-pc__diff"><RuleText before={plate.text?.before ?? null} after={plate.text?.after ?? null} compact /></p>
        ))}
      </article>
    );
  }
  return (
    <article className="hp-pc" id={card.anchor} data-variant="line" aria-labelledby={headingId}>
      {body}
      {list(true)}
      {note}
    </article>
  );
}

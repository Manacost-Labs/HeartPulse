import { ArrowRight } from 'lucide-react';
import type { PatchCardView } from '../../modules/patchNotes/public';
import { publicResourceImageUrl, publicResourceUrl } from '../../publicResourceUrl';
import { changePlates, type ChangePlate } from './patchChangePlates';

/*
 * One changed card as the patch changed it: the card before, an arrow with
 * the plates of what changed, the card after. A card without a pair of pictures
 * is one current picture with the plates beside it; a card the catalog does not
 * know is one line of text.
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

/** The current picture of a card: the catalog render of a Battlegrounds card, else the site's own card image. */
function currentPicture(card: PatchCardView): Picture | null {
  if (!card.cardId) return null;
  const render = card.mode === 'battlegrounds' ? publicResourceUrl(card.renderUrl) : '';
  if (render.startsWith('/api/public-resource/')) {
    return { src: publicResourceImageUrl(card.renderUrl, { width: 480 }), ...SIZE.battleground, contain: false };
  }
  if (card.art === 'card') return { src: card.thumb ?? '', width: 360, height: 497, contain: false };
  return { src: card.thumb ?? '', width: 360, height: card.art === 'hero' ? 546 : 360, contain: true };
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
      {withText && text && (
        <span className="hp-plate__text">
          {text.before && <span><i>Было:</i> {text.before}</span>}
          {text.after && <span><i>Стало:</i> {text.after}</span>}
        </span>
      )}
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
      {card.sourceName && <p className="hp-pc__meta" lang="en">{card.sourceName}</p>}
    </>
  );
  const list = (withText: boolean) => (
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
          {list(true)}
          {note}
        </div>
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

import { useId, useState, type MouseEvent } from 'react';
import type { AssembleListCard } from '../model/assemblePage';
import { assembleClassLabel, assemblePageHref } from '../model/assemblePage';
import type { CardAssembleData } from '../model/cardAssemble';
import { formatChoicePercent } from '../model/cardChoices';
import { creaturesLabel } from '../model/plural';

const artUrl = (cardId: string) => `/api/public-resource/hsjson/v1/orig/${encodeURIComponent(cardId)}.png?width=256&quality=82&format=webp&trim=1`;

/** A plain left click is a soft navigation; a modified click or a middle click keeps the browser's own behaviour. */
function plainClick(event: MouseEvent): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.defaultPrevented;
}

function Tile({ item, format, selected, onChoose }: { item: AssembleListCard; format: CardAssembleData['format']; selected: boolean; onChoose: (href: string) => void }) {
  const href = assemblePageHref(format, item.card.cardId);
  const hasData = item.state === 'ok';
  return (
    <a className="assemble-card" href={href} data-card={item.card.cardId} data-state={hasData ? 'ok' : 'empty'}
      aria-current={selected ? 'true' : undefined}
      onClick={event => { if (plainClick(event)) { event.preventDefault(); onChoose(href); } }}>
      <span className="assemble-card__art">
        <img src={artUrl(item.card.cardId)} alt="" width={96} height={96} loading={selected ? 'eager' : 'lazy'} decoding="async" />
        {item.card.cost !== null && <b className="assemble-card__mana" aria-hidden="true">{item.card.cost}</b>}
      </span>
      <span className="assemble-card__name">{item.card.name}</span>
      <span className="assemble-card__class">{assembleClassLabel(item.card)}</span>
      <span className="assemble-card__meta">{poolLine(item, hasData)}</span>
    </a>
  );
}

function poolLine(item: AssembleListCard, hasData: boolean) {
  return hasData && item.basesTotal !== null
    ? <>Пул <b>{item.basesTotal}</b> {creaturesLabel(item.basesTotal)}{item.winRate !== null && <> · {formatChoicePercent(item.winRate)}</>}</>
    : <i>Нет данных</i>;
}

/**
 * The cards with «Собирает» as big tiles. Every tile is a real link to `?card=<id>`, so the choice is
 * shareable and works without JavaScript; with it `onChoose` moves there without a reload.
 * On a phone the tiles fold behind one line with the chosen card and «Сменить карту» (CSS only hides
 * them, all 13 links stay in the markup; without scripting the grid is always open).
 */
export function AssembleCardPicker({ format, cards, selectedId, onChoose }: {
  format: CardAssembleData['format'];
  cards: readonly AssembleListCard[];
  selectedId: string | null;
  onChoose: (href: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const gridId = useId();
  const current = cards.find(item => item.card.cardId === selectedId) ?? null;
  const choose = (href: string) => { setOpen(false); onChoose(href); };
  return (
    <div className="assemble-picker-block" data-open={open ? 'true' : 'false'}>
      {current && (
        <div className="assemble-current">
          <span className="assemble-card__art">
            <img src={artUrl(current.card.cardId)} alt="" width={56} height={56} decoding="async" />
          </span>
          <span className="assemble-current__text">
            <b>{current.card.name}</b>
            <span>{assembleClassLabel(current.card)}</span>
            <span>{poolLine(current, current.state === 'ok')}</span>
          </span>
          <button type="button" className="assemble-current__change" aria-expanded={open} aria-controls={gridId} onClick={() => setOpen(value => !value)}>
            {open ? 'Свернуть' : 'Сменить карту'}
          </button>
        </div>
      )}
      <ul className="assemble-cards" id={gridId} aria-label="Карты со «Собирает»">
        {cards.map(item => (
          <li key={item.card.cardId}><Tile item={item} format={format} selected={item.card.cardId === selectedId} onChoose={choose} /></li>
        ))}
      </ul>
    </div>
  );
}

/** The tiles while the list loads: same size, so the page does not jump. */
export function AssembleCardPickerSkeleton() {
  return (
    <ul className="assemble-cards assemble-cards--loading" aria-hidden="true">
      {Array.from({ length: 13 }, (_, index) => <li key={index}><span className="assemble-card" /></li>)}
    </ul>
  );
}

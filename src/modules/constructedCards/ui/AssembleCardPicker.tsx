import type { MouseEvent } from 'react';
import type { AssembleListCard } from '../model/assemblePage';
import { assembleClassLabel, assemblePageHref } from '../model/assemblePage';
import type { CardAssembleData } from '../model/cardAssemble';
import { formatChoicePercent } from '../model/cardChoices';

const artUrl = (cardId: string) => `/api/public-resource/hsjson/v1/orig/${encodeURIComponent(cardId)}.png?width=256&quality=82&format=webp&trim=1`;

function plural(count: number): string {
  const tail = count % 100;
  const last = count % 10;
  if (tail >= 11 && tail <= 14) return 'существ';
  return last === 1 ? 'существо' : last >= 2 && last <= 4 ? 'существа' : 'существ';
}

/** A plain left click is a soft navigation; a modified click or a middle click keeps the browser's own behaviour. */
function plainClick(event: MouseEvent): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.defaultPrevented;
}

/**
 * The cards with «Собирает» as big tiles. Every tile is a real link to `?card=<id>`, so the choice is
 * shareable and works without JavaScript; with it `onChoose` moves there without a reload.
 */
export function AssembleCardPicker({ format, cards, selectedId, onChoose }: {
  format: CardAssembleData['format'];
  cards: readonly AssembleListCard[];
  selectedId: string | null;
  onChoose: (href: string) => void;
}) {
  return (
    <ul className="assemble-cards" aria-label="Карты со «Собирает»">
      {cards.map(item => {
        const href = assemblePageHref(format, item.card.cardId);
        const hasData = item.state === 'ok';
        const selected = item.card.cardId === selectedId;
        return (
          <li key={item.card.cardId}>
            <a className="assemble-card" href={href} data-card={item.card.cardId} data-state={hasData ? 'ok' : 'empty'}
              aria-current={selected ? 'true' : undefined}
              onClick={event => { if (plainClick(event)) { event.preventDefault(); onChoose(href); } }}>
              <span className="assemble-card__art">
                <img src={artUrl(item.card.cardId)} alt="" width={96} height={96} loading={selected ? 'eager' : 'lazy'} decoding="async" />
                {item.card.cost !== null && <b className="assemble-card__mana" aria-hidden="true">{item.card.cost}</b>}
              </span>
              <span className="assemble-card__name">{item.card.name}</span>
              <span className="assemble-card__class">{assembleClassLabel(item.card)}</span>
              <span className="assemble-card__meta">
                {hasData && item.basesTotal !== null
                  ? <>Пул <b>{item.basesTotal}</b> {plural(item.basesTotal)}{item.winRate !== null && <> · {formatChoicePercent(item.winRate)}</>}</>
                  : <i>Нет данных</i>}
              </span>
            </a>
          </li>
        );
      })}
    </ul>
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

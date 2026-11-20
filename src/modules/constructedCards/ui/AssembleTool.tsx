'use client';
import { useState } from 'react';
import { assembleCardIdFromSearch, assemblePageHref, resolveAssembleCard } from '../model/assemblePage';
import type { CardAssembleData, CardAssembleListData } from '../model/cardAssemble';
import { cardChoiceDate } from '../model/cardChoices';
import { useCardAssembleList } from '../useCardAssembleList';
import { AssembleCardPicker, AssembleCardPickerSkeleton } from './AssembleCardPicker';
import CardAssembleSection from './CardAssembleSection';

export type AssembleToolProps = {
  format: CardAssembleData['format'];
  /** `?card=` of the address; a missing or unknown one shows the default card. */
  requestedCard: string | null;
  /** What the server read in time; the browser loads whatever is `null`. */
  initialList: CardAssembleListData | null;
  initialCard: CardAssembleData | null;
  onNavigate: (href: string) => void;
};

function FormatSwitch({ format, cardId, onNavigate }: { format: CardAssembleData['format']; cardId: string | null; onNavigate: (href: string) => void }) {
  return (
    <div className="assemble-tool__formats" role="group" aria-label="Формат">
      {(['standard', 'wild'] as const).map(value => {
        const href = assemblePageHref(value, cardId);
        return (
          <a key={value} href={href} aria-current={value === format ? 'true' : undefined}
            onClick={event => { if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); onNavigate(href); } }}>
            {value === 'standard' ? 'Стандарт' : 'Вольный'}
          </a>
        );
      })}
    </div>
  );
}

/**
 * The tool page of «Сборка»: a big choice of the 13 cards with the keyword and, under it, the section
 * of the chosen card. The page's shell brings the H1; styles load with the route, so the server draws it all.
 */
export function AssembleTool({ format, requestedCard, initialList, initialCard, onNavigate }: AssembleToolProps) {
  const [reload, setReload] = useState(0);
  // A tapped tile lights up at once; the server's answer for the new address replaces it.
  const [pending, setPending] = useState<string | null>(null);
  const list = useCardAssembleList(format, initialList, reload);
  const resolved = list.data ? resolveAssembleCard(list.data.cards, requestedCard) : null;
  const selectedId = pending ?? resolved?.card.cardId ?? null;
  const date = cardChoiceDate(list.data?.checkedAt ?? null);
  const choose = (href: string) => {
    setPending(assembleCardIdFromSearch(new URL(href, 'https://hearthpulse.net').searchParams.get('card')));
    onNavigate(href);
    // On a phone the folded choice leaves the tool right below: bring it to the top.
    if (window.matchMedia('(max-width: 640px)').matches) {
      const motion = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
      requestAnimationFrame(() => document.querySelector('.assemble-tool .assemble')?.scrollIntoView({ block: 'start', behavior: motion }));
    }
  };
  const seed = initialCard && resolved && initialCard.cardId === resolved.card.cardId && initialCard.format === format ? initialCard : null;

  return (
    <div className="assemble-tool" data-assemble-tool="" aria-busy={pending !== null}>
      <div className="assemble-tool__bar">
        <FormatSwitch format={format} cardId={selectedId} onNavigate={onNavigate} />
        <p className="assemble-tool__source">
          Данные <a href="https://hsreplay.net/" target="_blank" rel="noreferrer">HSReplay</a>{date ? ` · на ${date}` : ''}
        </p>
      </div>
      <h2 className="assemble-tool__title" id="assemble-cards-title">Выберите карту</h2>
      {list.status === 'ready' && <AssembleCardPicker format={format} cards={list.data.cards} selectedId={selectedId} onChoose={choose} />}
      {list.status === 'loading' && <AssembleCardPickerSkeleton />}
      {list.status === 'error' && (
        <div className="card-choices__error" role="alert">
          <p>Список карт временно недоступен.</p>
          <button type="button" onClick={() => setReload(value => value + 1)}>Повторить</button>
        </div>
      )}
      {resolved && resolved.state === 'ok' && (
        <CardAssembleSection key={`${format}:${resolved.card.cardId}`} format={format} cardId={resolved.card.cardId}
          initial={seed} staticStyles heading={resolved.card.name} />
      )}
      {resolved && resolved.state !== 'ok' && (
        <p className="card-choices__empty assemble-tool__empty">По карте «{resolved.card.name}» HSReplay пока не собрал данных. Выберите другую карту.</p>
      )}
    </div>
  );
}

export default AssembleTool;

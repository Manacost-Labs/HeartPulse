'use client';
import { useId, type MouseEvent } from 'react';
import { assembleBestBase, assemblePageHref, creaturesLabel, formatChoicePercent, useCardAssemble, type CardAssembleData } from '../modules/constructedCards/public/index';
import './CardAssembleTeaser.css';

/**
 * The card page's «Сборка»: one plate with the pool and the best base, and a big button to the tool
 * (`/standard/assemble/?card=…`). The link is in the server HTML; the figures come from the same
 * `?base=top` request the tool uses and, when the source has none, the line stays empty (its place is reserved).
 */
export function CardAssembleTeaser({ format, cardId, onNavigate }: {
  format: CardAssembleData['format'];
  cardId: string;
  onNavigate?: (href: string) => void;
}) {
  const headingId = useId();
  const state = useCardAssemble(format, cardId, 'top', true);
  const data = state.status === 'ready' && state.data.state === 'ok' && state.data.bases.length > 0 ? state.data : null;
  const best = data ? assembleBestBase(data) : null;
  const href = assemblePageHref(format, cardId);
  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!onNavigate || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate(href);
  };
  return (
    <section className="constructed-card-detail__section assemble-teaser" aria-labelledby={headingId} data-card-assemble-teaser="">
      <img className="assemble-teaser__emblem" src="/menu/icons/standard-assemble-120.webp" alt="" width={72} height={72} loading="lazy" decoding="async" />
      <div className="assemble-teaser__body">
        <h2 id={headingId}>Сборка</h2>
        <p className="assemble-teaser__stats" aria-live="polite">
          {data && <>Пул <b>{data.basesTotal} {creaturesLabel(data.basesTotal)}</b>{best && <> · лучшая база — <b>{best.card.name}</b> {formatChoicePercent(best.winRate)}</>}</>}
        </p>
      </div>
      <a className="assemble-teaser__button" href={href} onClick={open}>Открыть инструмент сборки</a>
    </section>
  );
}

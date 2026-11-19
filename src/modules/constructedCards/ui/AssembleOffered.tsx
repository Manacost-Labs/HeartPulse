import { useMemo, useState } from 'react';
import { assembleRankableDonors, assembleWinrateTone, bestOfOffered, type AssembleBase, type AssembleDonor, type CardAssembleData } from '../model/cardAssemble';
import { formatChoicePercent } from '../model/cardChoices';
import { BuildRow } from './AssembleBuilds';
import { Portrait, PortraitPicker, cardHref } from './AssemblePicker';

export function BaseSummary({ base, format }: { base: AssembleBase; format: CardAssembleData['format'] }) {
  return (
    <div className="assemble-base" data-base={base.card.cardId}>
      <Portrait card={base.card} className="assemble-portrait--big" />
      <div>
        <p className="assemble-base__label">Основа сборки</p>
        <a className="assemble-base__name" href={cardHref(format, base.card.cardId)}>{base.card.name}</a>
      </div>
      <dl className="assemble-base__facts">
        <div><dt>Выпадает</dt><dd>{formatChoicePercent(base.offerRate)}</dd></div>
        <div>
          <dt>Винрейт</dt>
          <dd className={`is-${base.lowSample ? 'neutral' : assembleWinrateTone(base.winRate, base)}`}>{formatChoicePercent(base.winRate)}</dd>
          {base.lowSample && <dd className="card-choices__thin">Мало данных</dd>}
        </div>
        <div><dt>Доноров</dt><dd>{base.donorsTotal}</dd></div>
      </dl>
    </div>
  );
}

export function OfferedPanel({ base, format }: { base: AssembleBase; format: CardAssembleData['format'] }) {
  const donors = useMemo(() => assembleRankableDonors(base), [base]);
  const [chosen, setChosen] = useState<string[]>([]);
  // The picker folds away once two donors are chosen, so the four builds sit right under the slots.
  const [editing, setEditing] = useState(false);
  const byId = (id: string | undefined) => donors.find(donor => donor.card.cardId === id) ?? null;
  const pick = (id: string) => {
    const next = chosen.includes(id) ? chosen.filter(item => item !== id) : chosen.length < 2 ? [...chosen, id] : [chosen[0] as string, id];
    setChosen(next);
    setEditing(false);
  };
  const showPicker = chosen.length < 2 || editing;
  const result = chosen.length === 2 ? bestOfOffered(base, chosen[0] as string, chosen[1] as string) : null;
  const ordered = result
    ? [result.best, ...result.variants.filter(variant => variant !== result.best)
      .sort((a, b) => (b.option.winRate ?? -1) - (a.option.winRate ?? -1))]
    : [];
  const announcement = chosen.length < 2
    ? ''
    : editing ? 'Выберите существ заново.'
      : result
        ? `Лучший выбор: ${result.best.donor.card.name}, берём ${result.best.option.half === 'effect' ? 'эффект' : 'условие'}, винрейт ${formatChoicePercent(result.best.option.winRate)}${result.lowSample ? ', данных мало' : ''}.`
        : 'Для этих двух существ нет данных о винрейте.';
  const items = donors.map(donor => ({ id: donor.card.cardId, card: donor.card, note: donor.offerRate === null ? '' : `выпадает ${formatChoicePercent(donor.offerRate)}` }));
  return (
    <div className="assemble-offer">
      <p className="assemble-offer__hint">Игра предложила двух существ? Отметьте их ниже: покажем четыре сборки и лучшую из них.</p>
      <div className="assemble-slots" aria-live="polite">
        {[0, 1].map(index => {
          const donor: AssembleDonor | null = byId(chosen[index]);
          return donor
            ? (
              <button key={index} type="button" className="assemble-slot is-filled" aria-label={`Убрать «${donor.card.name}»`} onClick={() => pick(donor.card.cardId)}>
                <Portrait card={donor.card} />
                <span className="assemble-slot__name">{donor.card.name}</span>
              </button>
            )
            : (
              <span key={index} className="assemble-slot">
                <span className="assemble-slot__empty">{index + 1}</span>
                <span className="assemble-slot__name">{index === 0 ? 'Первое существо' : 'Второе существо'}</span>
              </span>
            );
        })}
      </div>
      <p className="assemble-sr" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
      {chosen.length === 2 && !editing && (
        <button type="button" className="assemble-edit" onClick={() => setEditing(true)}>Изменить выбор</button>
      )}
      {showPicker && (donors.length > 0
        ? <PortraitPicker items={items} selected={chosen} onPick={pick} label="Существа, которых могла предложить игра" searchLabel="Найти существо" size="small" />
        : <p className="assemble-note">По этой базе пока нет данных HSReplay о сборках.</p>)}
      {chosen.length === 2 && !editing && (result
        ? (
          <>
            <ol className="assemble-rows" aria-label="Четыре сборки из двух предложенных существ">
              {ordered.map(variant => (
                <BuildRow key={`${variant.donor.card.cardId}:${variant.option.half}`} variant={variant} base={base} format={format}
                  best={variant === result.best} bestThin={result.lowSample} />
              ))}
            </ol>
            {result.lowSample && <p className="assemble-note">У всех четырёх сборок мало партий — лучший выбор ненадёжен.</p>}
          </>
        )
        : <p className="assemble-note">Для этих двух существ нет данных о винрейте.</p>)}
    </div>
  );
}

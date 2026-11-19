import { useMemo, useState } from 'react';
import { assembleWinrateTone, bestOfOffered, type AssembleBase, type AssembleDonor, type AssembleVariant, type CardAssembleData } from '../model/cardAssemble';
import { assembleOfferedDonors, assembleOfferedVariants } from '../model/cardAssemblePool';
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

const NO_STATS = 'не встречался в играх';
const half = (value: 'effect' | 'trigger') => (value === 'effect' ? 'эффект' : 'условие');

/** What the live region and the note under the slots say about the two chosen donors. */
function offeredVerdict(a: AssembleDonor, b: AssembleDonor, base: AssembleBase) {
  const result = bestOfOffered(base, a, b);
  const bare = [a, b].filter(donor => donor.noStats);
  if (result) {
    const lead = `Лучший выбор: ${result.best.donor.card.name}, берём ${half(result.best.option.half)}, винрейт ${formatChoicePercent(result.best.option.winRate)}${result.lowSample ? ', данных мало' : ''}.`;
    const note = bare.length ? ` У «${bare[0]?.card.name}» нет статистики: его тексты без процентов.` : '';
    return { result, announcement: lead + note, note: bare.length ? `У «${bare[0]?.card.name}» нет статистики: его два варианта показаны текстом, без процентов.` : null };
  }
  const none = bare.length === 2
    ? 'У обоих существ нет статистики: они не встречались в играх с этой основой. Лучшего выбора нет, сравните тексты.'
    : 'Для этих двух существ нет данных о винрейте.';
  return { result: null, announcement: none, note: none };
}

function OfferedResult({ a, b, base, format }: { a: AssembleDonor; b: AssembleDonor; base: AssembleBase; format: CardAssembleData['format'] }) {
  const { result, note } = offeredVerdict(a, b, base);
  const ordered = assembleOfferedVariants(a, b);
  const isBest = (variant: AssembleVariant) => variant.donor === result?.best.donor && variant.option.half === result.best.option.half;
  const rows = result ? [...ordered.filter(isBest), ...ordered.filter(variant => !isBest(variant))] : ordered;
  return (
    <>
      <ol className="assemble-rows" aria-label="Четыре сборки из двух предложенных существ">
        {rows.map(variant => (
          <BuildRow key={`${variant.donor.card.cardId}:${variant.option.half}`} variant={variant} base={base} format={format}
            best={isBest(variant)} bestThin={result?.lowSample} />
        ))}
      </ol>
      {note && <p className="assemble-note">{note}</p>}
      {result?.lowSample && <p className="assemble-note">У всех сборок со статистикой мало партий — лучший выбор ненадёжен.</p>}
    </>
  );
}

export function OfferedPanel({ base, data, format, playerClass }: {
  base: AssembleBase;
  data: CardAssembleData;
  format: CardAssembleData['format'];
  playerClass: string | null;
}) {
  const donors = useMemo(() => assembleOfferedDonors(data, base, playerClass), [data, base, playerClass]);
  const [chosen, setChosen] = useState<string[]>([]);
  // The picker folds away once two donors are chosen, so the four builds sit right under the slots.
  const [editing, setEditing] = useState(false);
  const byId = (id: string | undefined) => donors.find(donor => donor.card.cardId === id) ?? null;
  const pick = (id: string) => {
    setChosen(chosen.includes(id) ? chosen.filter(item => item !== id) : chosen.length < 2 ? [...chosen, id] : [chosen[0] as string, id]);
    setEditing(false);
  };
  const [first, second] = [byId(chosen[0]), byId(chosen[1])];
  const ready = !!first && !!second && !editing;
  const announcement = !first || !second ? '' : editing ? 'Выберите существ заново.' : offeredVerdict(first, second, base).announcement;
  const items = donors.map(donor => ({
    id: donor.card.cardId, card: donor.card, muted: !!donor.noStats,
    note: donor.noStats ? NO_STATS : donor.offerRate === null ? '' : `выпадает ${formatChoicePercent(donor.offerRate)}`,
  }));
  const needsClass = data.donorPoolStatus?.state === 'ok' && data.donorPoolStatus.classDependent && !!base.donorPool?.length && !playerClass;
  return (
    <div className="assemble-offer">
      <p className="assemble-offer__hint">Игра предложила двух существ? Отметьте их ниже: покажем четыре сборки и лучшую из них.</p>
      <div className="assemble-slots">
        {[first, second].map((donor, index) => (donor
          ? (
            <button key={index} type="button" className={`assemble-slot is-filled${donor.noStats ? ' is-nodata' : ''}`} aria-label={`Убрать «${donor.card.name}»`} onClick={() => pick(donor.card.cardId)}>
              <Portrait card={donor.card} />
              <span className="assemble-slot__name">{donor.card.name}{donor.noStats && <small>{NO_STATS}</small>}</span>
            </button>
          )
          : (
            <span key={index} className="assemble-slot">
              <span className="assemble-slot__empty">{index + 1}</span>
              <span className="assemble-slot__name">{index === 0 ? 'Первое существо' : 'Второе существо'}</span>
            </span>
          )))}
      </div>
      <p className="assemble-sr" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
      {ready && <button type="button" className="assemble-edit" onClick={() => setEditing(true)}>Изменить выбор</button>}
      {needsClass && <p className="assemble-note">Пул доноров зависит от класса: выберите свой класс над лентой «Что выпало?».</p>}
      {!ready && !needsClass && (donors.length > 0
        ? <PortraitPicker items={items} selected={chosen} onPick={pick} label="Существа, которых могла предложить игра" searchLabel="Найти существо" size="small" />
        : <p className="assemble-note">По этой базе пока нет данных HSReplay о сборках.</p>)}
      {ready && first && second && <OfferedResult a={first} b={second} base={base} format={format} />}
    </div>
  );
}

import { LoadingBlock, LoadingSurface } from '../../../shared/ui/LoadingSurface';
import { assembleWinrateTone, type AssembleBase, type AssembleVariant, type CardAssembleData } from '../model/cardAssemble';
import { formatChoicePercent } from '../model/cardChoices';
import { Portrait, cardHref } from './AssemblePicker';

/** One build: the plate of the card text, the base's half in ink and the donor's half in gold. */
export function BuildRow({ variant, base, format, best, bestThin }: {
  key?: string;
  variant: AssembleVariant;
  base: AssembleBase;
  format: CardAssembleData['format'];
  best?: boolean;
  bestThin?: boolean;
}) {
  const { donor, option } = variant;
  const pick = option.pickRate === null ? 0 : Math.max(0, Math.min(100, option.pickRate));
  const tone = option.lowSample ? 'neutral' : assembleWinrateTone(option.winRate, base);
  const text = option.text;
  const donorHalf = option.half;
  return (
    <li className={`assemble-row${best ? ' is-best' : ''}${option.lowSample ? ' is-thin' : ''}`}>
      {best && <span className="assemble-row__best">{bestThin ? 'Лучший из того, что есть' : 'Лучший выбор'}</span>}
      <a className="assemble-row__portrait" href={cardHref(format, donor.card.cardId)} tabIndex={-1} aria-hidden="true">
        <Portrait card={donor.card} />
      </a>
      <div className="assemble-row__body">
        <div className="assemble-row__head">
          <a className="assemble-row__name" href={cardHref(format, donor.card.cardId)}>{donor.card.name}</a>
          <span className="assemble-row__half">{donorHalf === 'effect' ? 'берём эффект' : 'берём условие'}</span>
          {option.undervalued && <span className="card-choices__badge" title="Винрейт выше среднего по сборкам, а берут реже большинства">Недооценённый выбор</span>}
          {option.lowSample && <span className="card-choices__thin">Мало данных</span>}
        </div>
        {text
          ? (
            <p className="assemble-text">
              <span className={donorHalf === 'trigger' ? 'is-donor' : 'is-base'}>
                <span className="assemble-sr">{donorHalf === 'trigger' ? `От донора «${donor.card.name}»: ` : `От базы «${base.card.name}»: `}</span>
                {text.trigger}
              </span>
              <span className="assemble-seam" aria-hidden="true" />
              <span className={donorHalf === 'effect' ? 'is-donor' : 'is-base'}>
                <span className="assemble-sr">{donorHalf === 'effect' ? `От донора «${donor.card.name}»: ` : `От базы «${base.card.name}»: `}</span>
                {text.effect}
              </span>
            </p>
          )
          : <p className="assemble-text is-missing">Текст этой сборки ещё не собран.</p>}
      </div>
      <dl className="assemble-row__metrics">
        <div className="assemble-metric">
          <dt>Берут</dt>
          <dd>{formatChoicePercent(option.pickRate)}</dd>
          <span className="card-choices__bar" aria-hidden="true"><span style={{ width: `${pick}%` }} /></span>
        </div>
        <div className="assemble-metric">
          <dt>Винрейт</dt>
          <dd className={`is-${tone}`}>{formatChoicePercent(option.winRate)}</dd>
        </div>
      </dl>
    </li>
  );
}

export function BuildsSkeleton() {
  return (
    <LoadingSurface quiet label="Загружаем сборки" layout="grid" className="assemble-loading" blocksClassName="assemble-loading__rows">
      {Array.from({ length: 4 }, (_, index) => <LoadingBlock key={index} className="assemble-loading__row" />)}
    </LoadingSurface>
  );
}

export function Legend() {
  return (
    <p className="assemble-legend">
      <span className="is-base">Половина базы</span>
      <span className="assemble-seam" aria-hidden="true" />
      <span className="is-donor">Половина донора</span>
    </p>
  );
}

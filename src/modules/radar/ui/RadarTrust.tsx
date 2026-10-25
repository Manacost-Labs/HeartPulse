import { pluralRu } from '../../../shared/text/pluralRu';
import { formatRadarCount, formatRadarDate, type RadarBacktest, type RadarReport } from '../model/radarView';
import { RadarMore } from './RadarMore';

const SIDES = [
  { key: 'nerf', title: 'Нерфы' },
  { key: 'buff', title: 'Баффы' },
] as const;

/**
 * «Насколько радар точен»: за неделю до каждого прошлого патча — сколько
 * настоящих правок оказалось в первых 3, 5 и 10 кандидатах статистической
 * части радара. Цифры показываются как есть, в том числе слабые.
 */
export function RadarTrust({ backtest }: { backtest: RadarBacktest | null }) {
  if (!backtest) return null;
  return <section className="radar-section" aria-labelledby="radar-trust-title">
    <header className="radar-section__heading">
      <h2 id="radar-trust-title">Насколько радар точен</h2>
      <p>
        {backtest.text ?? <>
          Радар прогнали на {formatRadarCount(backtest.patches)} {pluralRu(backtest.patches, 'прошлом патче', 'прошлых патчах', 'прошлых патчах')} по
          статистике за неделю до выхода: сколько настоящих правок он назвал среди первых кандидатов.
        </>}
      </p>
    </header>
    <div className="radar-section__body">
      <ul className="radar-trust">
        {SIDES.map(side => {
          const cells = backtest[side.key];
          if (!cells.length) return null;
          return <li key={side.key}>
            <span className="radar-label">{side.title}</span>
            <span>{cells.map(cell => `в первых ${cell.top}: ${cell.hits} из ${cell.actual}`).join(' · ')}</span>
          </li>;
        })}
      </ul>
      <p className="radar-trust__note">
        {backtest.basis === 'model'
          ? backtest.caveat ?? 'Модель могла видеть часть этих патчноутов при обучении, поэтому её цифры — оценка сверху.'
          : 'Проверяется только статистическая часть: вывод модели и обсуждения сообщества в ней не участвуют.'}
      </p>
    </div>
  </section>;
}

/** Закономерности решений Blizzard из истории патчей; без данных раздела нет. */
export function RadarPatterns({ history }: { history: RadarReport['history'] }) {
  if (!history) return null;
  const coverage = [
    history.balancePatches !== null
      && `${formatRadarCount(history.balancePatches)} ${pluralRu(history.balancePatches, 'балансный патч', 'балансных патча', 'балансных патчей')}`,
    history.from && history.to && `с ${formatRadarDate(history.from)} по ${formatRadarDate(history.to)}`,
  ].filter(Boolean).join(' ');
  return <section className="radar-section" aria-labelledby="radar-patterns-title">
    <header className="radar-section__heading">
      <h2 id="radar-patterns-title">Закономерности Blizzard</h2>
      <p>Как разработчики меняли баланс раньше: на это опирается прогноз{coverage && ` (разобрано ${coverage})`}.</p>
    </header>
    <div className="radar-section__body radar-patterns">
      {history.patterns.length > 0 && <ul>
        {history.patterns.map((pattern, index) => <li key={`${index}:${pattern.title}`}>
          {pattern.text
            ? <RadarMore label={pattern.title} className="radar-patterns__item"><p>{pattern.text}</p></RadarMore>
            : <p className="radar-patterns__title">{pattern.title}</p>}
        </li>)}
      </ul>}
      {history.summary && <RadarMore label="Обзор истории патчей">
        {history.summary.split(/\n\s*\n|\n/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      </RadarMore>}
    </div>
  </section>;
}

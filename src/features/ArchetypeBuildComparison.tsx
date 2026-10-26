import { useMemo, useState, type ReactNode } from 'react';
import { MetricComparison, type ComparisonMetric } from '../vendor/valyro-ui/charts/MetricComparison';
import { LoadingBlock, LoadingSurface } from '../shared/ui/LoadingSurface';
import { CardTile } from './ConstructedArchetypeCardStatsCells';
import { MANA_CURVE_LABELS } from './archetypeInsightsModel';
import {
  averageCost, deckDifference, deckManaCurve, intervalAxis, sampleVerdict, winrateVerdict, type ComparedDeckCard,
} from './archetypeComparisonModel';
import { useBuildCards } from './archetypeBuildDecks';
import { BuildPicker, count, percent, type Build, type Side } from './ArchetypeBuildPicker';
import '../vendor/varylo-ui/styles/index.css';
import './archetypeVaryloTheme.css';
import './ConstructedArchetypeCardStats.css';
import './ArchetypeComparisons.css';

const number = (value: number, digits = 0) => value.toLocaleString('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: digits });

type Interval = { range: [number, number]; winrate: number | null; name: string };

/**
 * Both 95% intervals on one axis with whole-percent gridlines: overlapping bars mean the gap is
 * within the noise. The point is the build's own winrate, which a Wilson interval does not centre.
 */
function IntervalChart({ left, right }: { left: Interval; right: Interval }) {
  const axis = intervalAxis(left.range, right.range);
  const share = (value: number) => ((value - axis.low) / (axis.high - axis.low)) * 100;
  const x = (value: number) => `${share(value)}%`;
  const bar = ({ range, winrate }: Interval, side: Side, y: number) => <g data-side={side}>
    <line x1={x(range[0])} x2={x(range[1])} y1={y} y2={y} className="interval-chart__range" />
    <circle cx={x(winrate ?? (range[0] + range[1]) / 2)} cy={y} r={4.5} className="interval-chart__point" />
  </g>;
  const text = ({ name, range }: Interval) => `${name} ${number(range[0], 1)}–${number(range[1], 1)}%`;
  return <span className="interval-chart" role="img" aria-label={`95% интервал винрейта: ${text(left)}, ${text(right)}`}>
    <svg width="100%" height={30} aria-hidden="true">
      {axis.ticks.map(tick => <line key={tick} x1={x(tick)} x2={x(tick)} y1={0} y2={30} className="interval-chart__tick" />)}
      {bar(left, 'left', 9)}{bar(right, 'right', 21)}
    </svg>
    <span className="interval-chart__axis" aria-hidden="true">
      {axis.ticks.map(tick => <span key={tick} style={{ insetInlineStart: x(tick) }}>{tick}%</span>)}
    </span>
  </span>;
}

function headToHead(left: Build, right: Build, leftCards: ComparedDeckCard[] | null, rightCards: ComparedDeckCard[] | null, names: [string, string]): ComparisonMetric[] {
  const verdict = winrateVerdict(left, right);
  const sample = sampleVerdict(left.games, right.games);
  const leftCost = leftCards ? averageCost(leftCards) : null;
  const rightCost = rightCards ? averageCost(rightCards) : null;
  const name = (side: Side) => side === 'left' ? names[0] : names[1];
  const metrics: ComparisonMetric[] = [{
    label: 'Винрейт · 95% интервал',
    value: left.winrate ?? 0,
    previous: right.winrate ?? 0,
    format: value => percent(value),
    chart: verdict ? <IntervalChart left={{ range: verdict.left, winrate: left.winrate, name: names[0] }}
      right={{ range: verdict.right, winrate: right.winrate, name: names[1] }} /> : undefined,
    badge: verdict?.leader
      ? { label: `${name(verdict.leader)} выше на ${number(Math.abs(verdict.gap), 1)} п.п.`, color: 'green', direction: verdict.leader === 'left' ? 'up' : 'down',
        title: 'Интервалы не пересекаются: разница больше погрешности выборки' }
      : { label: 'В пределах погрешности', color: 'gray', title: 'Интервалы пересекаются: по этой выборке сборки не различаются' },
  }, {
    label: 'Игры',
    value: left.games ?? 0,
    previous: right.games ?? 0,
    format: value => count(value),
    badge: sample?.leader
      ? { label: `${name(sample.leader)} надёжнее · ×${number(sample.ratio, 1)}`, color: 'blue', title: 'Больше игр — уже интервал и надёжнее винрейт' }
      : { label: 'Сопоставимо', color: 'gray', title: 'Выборки почти равны' },
  }];
  if (leftCost !== null && rightCost !== null) {
    const gap = leftCost - rightCost;
    metrics.push({
      label: 'Средняя стоимость карты',
      value: leftCost,
      previous: rightCost,
      format: value => number(value, 2),
      badge: Math.abs(gap) < 0.1
        ? { label: 'Одинаково', color: 'gray' }
        : { label: `${name(gap < 0 ? 'left' : 'right')} дешевле на ${number(Math.abs(gap), 2)}`, color: 'amber' },
    });
  }
  return metrics;
}

/** Two histograms of the same scale drawn over each other: A filled, Б as a narrower bar on top. */
function ManaCurveOverlay({ left, right, names }: { left: number[]; right: number[]; names: [string, string] }) {
  const top = Math.max(1, ...left, ...right);
  return <figure className="build-curve">
    <figcaption>Кривая маны</figcaption>
    <div className="build-curve__plot" role="img" aria-label={`Кривая маны, карт по стоимости. ${MANA_CURVE_LABELS.map((label, index) => `${label}: ${names[0]} ${left[index]}, ${names[1]} ${right[index]}`).join('; ')}`}>
      {MANA_CURVE_LABELS.map((label, index) => <div key={label} className="build-curve__column" data-diff={left[index] === right[index] ? undefined : ''}>
        <span className="build-curve__values" aria-hidden="true"><b data-side="left">{left[index]}</b><b data-side="right">{right[index]}</b></span>
        <span className="build-curve__bars" aria-hidden="true">
          <i data-side="left" style={{ blockSize: `${(left[index] / top) * 100}%` }} />
          <i data-side="right" style={{ blockSize: `${(right[index] / top) * 100}%` }} />
        </span>
        <span className="build-curve__label" aria-hidden="true">{label}</span>
      </div>)}
    </div>
  </figure>;
}

const tileRow = (card: ComparedDeckCard) => ({ cardId: card.id, cardName: card.name, cost: card.cost, rarity: card.rarity ?? null, artwork: null });

function CardList({ title, side, entries, empty }: { title: string; side: Side | 'both'; entries: { card: ComparedDeckCard; count: ReactNode }[]; empty: string }) {
  return <section className="build-diff__column" data-side={side}>
    <h3>{title} <span>{entries.length}</span></h3>
    {entries.length ? <ul>{entries.map(({ card, count: copies }) => <li key={card.dbfId}>
      <CardTile row={tileRow(card)} />
      <span className="build-diff__count">{copies}</span>
    </li>)}</ul> : <p>{empty}</p>}
  </section>;
}

function CardDifference({ left, right, names }: { left: ComparedDeckCard[]; right: ComparedDeckCard[]; names: [string, string] }) {
  const diff = useMemo(() => deckDifference(left, right), [left, right]);
  return <div className="build-diff">
    <p className="build-diff__shared">Общих копий карт: <b>{diff.shared}</b> из {Math.max(...[left, right].map(cards => cards.reduce((sum, card) => sum + card.count, 0)))}</p>
    <div className="build-diff__grid">
      <CardList title={`Только в ${names[0]}`} side="left" entries={diff.onlyLeft.map(card => ({ card, count: `×${card.count}` }))} empty="Все карты есть и во второй сборке." />
      <CardList title={`Только в ${names[1]}`} side="right" entries={diff.onlyRight.map(card => ({ card, count: `×${card.count}` }))} empty="Все карты есть и в первой сборке." />
      <CardList title="Разное число копий" side="both" entries={diff.changed.map(entry => ({ card: entry.card,
        count: <><b data-side="left">{entry.left}</b><span aria-label="против"> → </span><b data-side="right">{entry.right}</b></> }))} empty="Число копий совпадает." />
    </div>
  </div>;
}

/** While both lists resolve: the curve and the three difference columns, or the failure with a retry. */
function DetailsPending({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  if (failed) return <div className="build-details-failed" role="alert">
    <p>Не удалось загрузить составы сборок.</p>
    <button type="button" className="build-details-failed__retry" onClick={onRetry}>Повторить</button>
  </div>;
  return <LoadingSurface label="Загружаем составы сборок" quiet layout="rows" className="build-details-loading">
    <LoadingBlock className="build-details-loading__curve" />
    <span className="build-details-loading__diff"><LoadingBlock /><LoadingBlock /><LoadingBlock /></span>
  </LoadingSurface>;
}

/** Two builds of the archetype: picked as cards, compared head to head, by mana curve and by cards. */
export function BuildComparison({ builds, format, archetype }: { builds: readonly Build[]; format: string; archetype: string }) {
  const [sides, setSides] = useState<[number, number]>([0, 1]);
  const [left, right] = sides;
  const leftRead = useBuildCards(builds[left]?.deckCode, format, archetype);
  const rightRead = useBuildCards(builds[right]?.deckCode, format, archetype);
  const leftCards = leftRead.cards;
  const rightCards = rightRead.cards;
  const names: [string, string] = [`#${left + 1}`, `#${right + 1}`];
  const pick = (index: number, side: Side) => setSides(([a, b]) => side === 'left'
    ? (index === b ? [b, a] : [index, b])
    : (index === a ? [b, a] : [a, index]));
  if (!builds[left] || !builds[right]) return null;
  return <div className="archetype-build-comparison hp-varylo">
    <BuildPicker builds={builds} archetype={archetype} sides={sides} onPick={pick} onSwap={() => setSides(([a, b]) => [b, a])} />
    <MetricComparison
      className="build-head-to-head"
      metrics={headToHead(builds[left], builds[right], leftCards, rightCards, names)}
      bars="paired"
      currentLabel={`A · ${names[0]}`}
      previousLabel={`Б · ${names[1]}`}
      locale="ru-RU"
      labels={{ metric: 'Показатель', change: 'Вывод', new: 'Новое', increase: 'Больше', decrease: 'Меньше' }}
      ariaLabel={`Сборка ${names[0]} против ${names[1]}`}
    />
    {leftCards && rightCards ? <>
      <ManaCurveOverlay left={deckManaCurve(leftCards)} right={deckManaCurve(rightCards)} names={names} />
      <CardDifference left={leftCards} right={rightCards} names={names} />
    </> : <DetailsPending failed={leftRead.failed || rightRead.failed} onRetry={() => { if (leftRead.failed) leftRead.retry(); if (rightRead.failed) rightRead.retry(); }} />}
  </div>;
}

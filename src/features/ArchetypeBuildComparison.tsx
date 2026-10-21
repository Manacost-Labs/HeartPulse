import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MetricComparison, type ComparisonMetric } from '../vendor/valyro-ui/charts/MetricComparison';
import { fetchWithDeadline } from '../shared/http/fetchWithDeadline';
import { publicResourceImageUrl } from '../publicResourceUrl';
import { cachedDeckRender, requestDeckRender } from './deckrender/deckRenderClient';
import { CardTile } from './ConstructedArchetypeCardStatsCells';
import { MANA_CURVE_LABELS } from './archetypeInsightsModel';
import {
  averageCost, deckDifference, deckManaCurve, sampleVerdict, winrateVerdict, type ComparedDeckCard,
} from './archetypeComparisonModel';
import '../vendor/varylo-ui/styles/index.css';
import './archetypeVaryloTheme.css';
import './ConstructedArchetypeCardStats.css';
import './ArchetypeComparisons.css';

type Build = { deckCode: string; games: number | null; winrate: number | null };
type Side = 'left' | 'right';

const number = (value: number, digits = 0) => value.toLocaleString('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: digits });
const percent = (value: number | null) => value === null || !Number.isFinite(value) ? '—' : `${number(value, 1)}%`;
const count = (value: number | null) => value === null || !Number.isFinite(value) ? '—' : number(Math.round(value));
/** The gallery renders each build under this name, so the picker reuses its cached render. */
const renderName = (archetype: string, index: number) => `${archetype} — сборка ${index + 1}`;

function useResolvedCards(build: Build | undefined, format: string, archetype: string) {
  const [deck, setDeck] = useState<{ code: string; cards: ComparedDeckCard[] } | null>(null);
  useEffect(() => {
    if (!build) return undefined;
    const controller = new AbortController();
    const query = new URLSearchParams({ code: build.deckCode, format, archetype });
    fetchWithDeadline(`/api/deck/resolve?${query}`, { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: controller.signal })
      .then(response => response.ok ? response.json() : Promise.reject(new Error(String(response.status))))
      .then((payload: { cards?: ComparedDeckCard[] }) => setDeck({ code: build.deckCode, cards: payload.cards ?? [] }))
      .catch(() => undefined);
    return () => controller.abort();
  }, [build, format, archetype]);
  return deck?.code === build?.deckCode ? deck.cards : null;
}

/** The build's parchment render, requested once the picker card scrolls near the viewport. */
function useDeckThumbnail(deckCode: string, deckName: string) {
  const ref = useRef<HTMLSpanElement>(null);
  const [url, setUrl] = useState(() => cachedDeckRender(deckCode, deckName)?.previewImageUrl ?? '');
  useEffect(() => {
    const target = ref.current;
    if (url || !target) return undefined;
    let active = true;
    const load = () => requestDeckRender(deckCode, deckName).then(asset => { if (active) setUrl(asset.previewImageUrl); }).catch(() => undefined);
    if (typeof IntersectionObserver === 'undefined') { void load(); return () => { active = false; }; }
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      void load();
    }, { rootMargin: '200px' });
    observer.observe(target);
    return () => { active = false; observer.disconnect(); };
  }, [deckCode, deckName, url]);
  return { ref, src: url ? publicResourceImageUrl(url, { width: 240 }) : '' };
}

function BuildPickCard({ build, index, archetype, side, onPick }: {
  build: Build; index: number; archetype: string; side: Side | null; onPick: (side: Side) => void;
}) {
  const thumbnail = useDeckThumbnail(build.deckCode, renderName(archetype, index));
  const label = `Сборка #${index + 1}`;
  return <li className="build-pick" data-side={side ?? undefined}>
    <button type="button" className="build-pick__body" aria-label={`${label}: сравнить справа`} aria-pressed={side === 'right'}
      disabled={side === 'left'} onClick={() => onPick('right')}>
      <span ref={thumbnail.ref} className="build-pick__thumb">
        {thumbnail.src ? <img src={thumbnail.src} alt="" width="120" height="90" loading="lazy" decoding="async" /> : null}
      </span>
      <span className="build-pick__number">#{index + 1}</span>
      <span className="build-pick__stats"><b>{percent(build.winrate)}</b><small>{count(build.games)} игр</small></span>
    </button>
    <span className="build-pick__sides" role="group" aria-label={`${label}: сторона сравнения`}>
      <button type="button" data-side="left" aria-pressed={side === 'left'} aria-label={`${label} слева (A)`} onClick={() => onPick('left')}>A</button>
      <button type="button" data-side="right" aria-pressed={side === 'right'} aria-label={`${label} справа (Б)`} onClick={() => onPick('right')}>Б</button>
    </span>
  </li>;
}

/** Both 95% intervals on one axis: overlapping bars mean the gap is within the noise. */
function IntervalChart({ left, right, leftLabel, rightLabel }: { left: [number, number]; right: [number, number]; leftLabel: string; rightLabel: string }) {
  const low = Math.floor(Math.min(left[0], right[0]) - 1);
  const high = Math.ceil(Math.max(left[1], right[1]) + 1);
  const x = (value: number) => `${((value - low) / (high - low)) * 100}%`;
  const bar = (interval: [number, number], side: Side, y: number) => <g data-side={side}>
    <line x1={x(interval[0])} x2={x(interval[1])} y1={y} y2={y} className="interval-chart__range" />
    <circle cx={x((interval[0] + interval[1]) / 2)} cy={y} r={3.5} className="interval-chart__point" />
  </g>;
  return <span className="interval-chart" title={`95% интервал: ${leftLabel} ${number(left[0], 1)}–${number(left[1], 1)}%, ${rightLabel} ${number(right[0], 1)}–${number(right[1], 1)}%`}>
    <svg width="100%" height={22} aria-hidden="true">{bar(left, 'left', 6)}{bar(right, 'right', 16)}</svg>
    <span className="interval-chart__axis" aria-hidden="true"><span>{low}%</span><span>{high}%</span></span>
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
    chart: verdict ? <IntervalChart left={verdict.left} right={verdict.right} leftLabel={names[0]} rightLabel={names[1]} /> : undefined,
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

/** Two builds of the archetype: picked as cards, compared head to head, by mana curve and by cards. */
export function BuildComparison({ builds, format, archetype }: { builds: readonly Build[]; format: string; archetype: string }) {
  const [sides, setSides] = useState<[number, number]>([0, 1]);
  const [left, right] = sides;
  const leftCards = useResolvedCards(builds[left], format, archetype);
  const rightCards = useResolvedCards(builds[right], format, archetype);
  const names: [string, string] = [`#${left + 1}`, `#${right + 1}`];
  const pick = (index: number, side: Side) => setSides(([a, b]) => side === 'left'
    ? (index === b ? [b, a] : [index, b])
    : (index === a ? [b, a] : [a, index]));
  if (!builds[left] || !builds[right]) return null;
  return <div className="archetype-build-comparison hp-varylo">
    <ol className="build-picker" aria-label="Выберите сборки: A — слева, Б — справа">
      {builds.map((build, index) => <BuildPickCard key={build.deckCode} build={build} index={index} archetype={archetype}
        side={index === left ? 'left' : index === right ? 'right' : null} onPick={side => pick(index, side)} />)}
    </ol>
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
    </> : <p className="archetype-insight-note build-comparison__pending">Кривая маны и отличия по картам появятся, когда загрузятся составы обеих сборок.</p>}
  </div>;
}

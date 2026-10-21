import { useEffect, useMemo, useState } from 'react';
import { MetricComparison, type ComparisonMetric } from '../vendor/varylo-ui/charts/MetricComparison';
import { RadarChart } from '../vendor/varylo-ui/charts/RadarChart';
import { fetchWithDeadline } from '../shared/http/fetchWithDeadline';
import {
  archetypeRadarProfile,
  deckManaCurve,
  MANA_CURVE_LABELS,
} from './archetypeInsightsModel';
import '../vendor/varylo-ui/styles/index.css';
import './archetypeVaryloTheme.css';
import './ConstructedArchetypeInsights.css';

const PERCENT = (value: number) => `${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;
const COUNT = (value: number) => Math.round(value).toLocaleString('ru-RU');

/** Rank × period winrate: a native table (ArchetypeRankHeatmap) instead of the kit's single-colour heatmap. */
export { RankHeatmap } from './ArchetypeRankHeatmap';

type Build = { deckCode: string; games: number | null; winrate: number | null };
type ResolvedCard = { cost: number | null; count: number };

function useResolvedCurve(build: Build | undefined, format: string, archetype: string) {
  const [curve, setCurve] = useState<{ code: string; values: number[] } | null>(null);
  useEffect(() => {
    if (!build) return undefined;
    const controller = new AbortController();
    const query = new URLSearchParams({ code: build.deckCode, format, archetype });
    fetchWithDeadline(`/api/deck/resolve?${query}`, { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: controller.signal })
      .then(response => response.ok ? response.json() : Promise.reject(new Error(String(response.status))))
      .then((deck: { cards?: ResolvedCard[] }) => setCurve({ code: build.deckCode, values: deckManaCurve(deck.cards ?? []) }))
      .catch(() => undefined);
    return () => controller.abort();
  }, [build, format, archetype]);
  return curve?.code === build?.deckCode ? curve.values : null;
}

/** Two builds side by side: their sample, winrate and mana curve from the resolved deck lists. */
export function BuildComparison({ builds, format, archetype }: { builds: readonly Build[]; format: string; archetype: string }) {
  const [left, setLeft] = useState(0);
  const [right, setRight] = useState(1);
  const leftCurve = useResolvedCurve(builds[left], format, archetype);
  const rightCurve = useResolvedCurve(builds[right], format, archetype);
  const metrics: ComparisonMetric[] = [
    { label: 'Винрейт', value: builds[left]?.winrate ?? 0, previous: builds[right]?.winrate ?? 0, format: PERCENT },
    { label: 'Игры', value: builds[left]?.games ?? 0, previous: builds[right]?.games ?? 0, format: COUNT },
    ...(leftCurve && rightCurve ? MANA_CURVE_LABELS.map((label, index) => ({
      label: `Карт за ${label} маны`, value: leftCurve[index], previous: rightCurve[index], format: COUNT,
    })) : []),
  ];
  const options = builds.map((build, index) => <option key={build.deckCode} value={index}>Сборка #{index + 1}</option>);
  return (
    <div className="archetype-build-comparison hp-varylo">
      <div className="archetype-build-comparison__pick">
        <label><span>Слева</span><select value={left} onChange={event => setLeft(Number(event.target.value))}>{options}</select></label>
        <label><span>Справа</span><select value={right} onChange={event => setRight(Number(event.target.value))}>{options}</select></label>
      </div>
      <MetricComparison
        metrics={metrics}
        bars="paired"
        currentLabel={`#${left + 1}`}
        previousLabel={`#${right + 1}`}
        locale="ru-RU"
        labels={{ metric: 'Показатель', change: 'Разница', new: 'Новое', increase: 'Больше', decrease: 'Меньше' }}
        ariaLabel={`Сравнение сборок #${left + 1} и #${right + 1}`}
      />
      {!leftCurve || !rightCurve ? <p className="archetype-insight-note">Кривая маны появится, когда загрузятся составы обеих сборок.</p> : null}
    </div>
  );
}

type RadarItem = Parameters<typeof archetypeRadarProfile>[0] & { archetypeLabel: string };

/** This archetype against another one of the format, each axis as a percentile among all archetypes. */
export function ArchetypeRadar({ item, items }: { item: RadarItem; items: readonly RadarItem[] }) {
  const others = useMemo(() => items.filter(other => other.slug !== item.slug), [items, item.slug]);
  const [otherSlug, setOtherSlug] = useState(others[0]?.slug ?? '');
  const other = others.find(entry => entry.slug === otherSlug) ?? others[0];
  const data = useMemo(() => {
    const mine = archetypeRadarProfile(item, items);
    const theirs = other ? archetypeRadarProfile(other, items) : [];
    return mine.map((axis, index) => ({ axis: axis.label, mine: axis.score ?? 0, theirs: theirs[index]?.score ?? 0 }));
  }, [item, items, other]);
  if (!other) return <p className="archetype-insight-empty">В формате нет других архетипов для сравнения.</p>;
  return (
    <div className="archetype-radar hp-varylo">
      <label className="archetype-radar__pick">
        <span>Сравнить с</span>
        <select value={other.slug} onChange={event => setOtherSlug(event.target.value)}>
          {others.map(entry => <option key={entry.slug} value={entry.slug}>{entry.archetypeLabel}</option>)}
        </select>
      </label>
      <RadarChart
        data={data}
        axis="axis"
        series={[{ key: 'mine', label: item.archetypeLabel, color: '#8d171d' }, { key: 'theirs', label: other.archetypeLabel, color: '#2f6c9e' }]}
        max={100}
        height={320}
        valueFormatter={value => `${Math.round(value)} из 100`}
        locale="ru-RU"
        axisLabel="Показатель"
        labels={{ empty: 'Нет данных' }}
        ariaLabel={`${item.archetypeLabel} и ${other.archetypeLabel}: место среди архетипов формата`}
      />
    </div>
  );
}

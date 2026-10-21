import { useMemo, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { MousePointer2 } from 'lucide-react';
import { ScatterChart, type ScatterSeries } from '../vendor/varylo-ui/charts/ScatterChart';
import { Treemap, type TreemapNode } from '../vendor/varylo-ui/charts/Treemap';
import { SegmentedControl } from '../vendor/varylo-ui/navigation/SegmentedControl';
import { canonicalPagePath } from '../app/routing/canonicalPagePath';
import type { StandardMetaClass } from '../../shared/standardMetaContract';
import {
  STANDARD_META_CLASS_COLORS,
  STANDARD_META_CLASS_LABELS,
  STANDARD_META_NEUTRAL_COLOR,
  standardMetaClassIcon,
} from './standardMetaClassModel';
import '../vendor/varylo-ui/styles/index.css';
import './StandardMetaVarylo.css';
import './StandardMetaChartSkeleton.css';
import './StandardMetaChartPlot.css';

/** One plotted archetype: an item of the chart with both coordinates known. */
export type StandardMetaChartPoint = {
  id: string;
  slug: string;
  archetype: string;
  archetypeLabel: string;
  classKey: string | null;
  winrate: number;
  popularity: number;
  games: number | null;
  climbingSpeed: number | null;
};

type MapView = 'scatter' | 'shares';
/** Rows of the share list before "Показать все". */
const SHARE_LIST_ROWS = 12;
const percent = (value: number) => `${value.toLocaleString('ru-RU', { maximumFractionDigits: value > 0 && value < 0.1 ? 2 : 1 })}%`;
const count = (value: number) => value.toLocaleString('ru-RU');
const WINRATE_GUIDE = [{ axis: 'y' as const, value: 50, label: '50%' }];
const NARROW = '(max-width: 640px)';
const subscribeNarrow = (onChange: () => void) => {
  const query = window.matchMedia(NARROW);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};
// A phone gets a shorter plot with smaller bubbles; the server draws the wide one.
const useNarrow = () => useSyncExternalStore(subscribeNarrow, () => window.matchMedia(NARROW).matches, () => false);

function classOf(point: StandardMetaChartPoint): StandardMetaClass | null {
  return point.classKey && point.classKey in STANDARD_META_CLASS_COLORS ? point.classKey as StandardMetaClass : null;
}

function classSeries(points: StandardMetaChartPoint[]): ScatterSeries<StandardMetaChartPoint>[] {
  const groups = new Map<StandardMetaClass | null, StandardMetaChartPoint[]>();
  for (const point of points) groups.set(classOf(point), [...groups.get(classOf(point)) ?? [], point]);
  return [...groups].map(([classKey, data]) => ({
    label: classKey ? STANDARD_META_CLASS_LABELS[classKey] : 'Без класса',
    color: classKey ? STANDARD_META_CLASS_COLORS[classKey] : STANDARD_META_NEUTRAL_COLOR,
    data,
  })).sort((left, right) => left.label.localeCompare(right.label, 'ru'));
}

/** Class tiles sized by their games, archetype tiles inside; a leaf's id is its slug. */
function shareTree(points: StandardMetaChartPoint[]): TreemapNode[] {
  return classSeries(points.filter(point => point.games)).map(series => ({
    id: series.data[0].classKey ?? 'neutral',
    label: series.label,
    color: series.color,
    children: series.data.map(point => ({ id: point.slug, label: point.archetypeLabel, value: point.games ?? 0 })),
  }));
}

/**
 * The expanded meta map: a bubble chart (popularity across, win rate up, games
 * as size, class as colour) and the share of games by class and archetype.
 * Both follow the page's filters, and a point or tile opens its archetype. It
 * loads when a reader opens the map, so the first paint carries none of it.
 */
export default function StandardMetaChartPlot({ points, format, formatLabel, rankLabel }: {
  points: StandardMetaChartPoint[];
  format: 'standard' | 'wild';
  formatLabel: string;
  rankLabel: string;
}) {
  const [view, setView] = useState<MapView>('scatter');
  const [popularOnly, setPopularOnly] = useState(false);
  const [shareClass, setShareClass] = useState<string | null>(null);
  const shown = useMemo(() => popularOnly ? points.filter(point => point.popularity >= 0.5) : points, [points, popularOnly]);
  const series = useMemo(() => classSeries(shown), [shown]);
  const tree = useMemo(() => shareTree(shown), [shown]);
  const totalGames = useMemo(() => shown.reduce((sum, point) => sum + (point.games ?? 0), 0), [shown]);
  const openArchetype = (slug: string) => window.location.assign(canonicalPagePath(`/standard/archetypes/${format}/${slug}`));
  const narrow = useNarrow();

  return (
    <section className="standard-meta-map standard-meta-varylo" aria-labelledby="standard-meta-map-title">
      <header className="standard-meta-map__header">
        <div>
          <h3 id="standard-meta-map-title">{view === 'scatter' ? 'Популярность и винрейт' : 'Доля игр'}</h3>
          <p>{formatLabel} · {rankLabel} · {shown.length} архетипов</p>
        </div>
        <SegmentedControl
          size="sm"
          aria-label="Вид карты меты"
          value={view}
          onValueChange={value => setView(value as MapView)}
          options={[{ value: 'scatter', label: 'Карта' }, { value: 'shares', label: 'Доли' }]}
          data-meta-map-switch
        />
      </header>
      <div className="standard-meta-map__controls">
        <label><input type="checkbox" checked={popularOnly} onChange={event => setPopularOnly(event.target.checked)} /> Популярность от 0,5%</label>
        <p><MousePointer2 size={15} aria-hidden="true" /> {view === 'scatter'
          ? 'Размер — число игр, цвет — класс. Нажмите на точку, чтобы открыть архетип.'
          : 'Площадь — доля игр, оттенок класса темнее у популярных архетипов. Нажмите на класс, затем на архетип.'}</p>
      </div>
      {view === 'scatter' ? (
        <ScatterChart
          className="standard-meta-map__chart"
          series={series}
          x="popularity"
          y="winrate"
          size="games"
          name="archetypeLabel"
          xLabel="Популярность"
          yLabel="Винрейт"
          sizeLabel="Игры"
          xFormatter={percent}
          yFormatter={percent}
          sizeFormatter={count}
          referenceLines={WINRATE_GUIDE}
          height={narrow ? 340 : 420}
          maxBubbleSize={narrow ? 16 : 22}
          showLegend
          locale="ru-RU"
          labels={{ empty: 'Нет точек для карты', series: 'Класс', name: 'Архетип' }}
          ariaLabel={`Карта меты: популярность и винрейт архетипов, ${formatLabel}, ${rankLabel}`}
          onPointClick={point => openArchetype(point.slug)}
        />
      ) : (
        <div className="standard-meta-shares">
          <Treemap
            className="standard-meta-map__chart"
            data={tree}
            depth={narrow ? 1 : 2}
            height={narrow ? 360 : 440}
            valueFormatter={value => percent(totalGames ? (value / totalGames) * 100 : 0)}
            locale="ru-RU"
            labels={{ empty: 'Нет игр для долей', root: 'Все классы', breadcrumb: 'Уровень долей', name: 'Название', value: 'Доля игр', share: 'Доля на этом уровне' }}
            ariaLabel={`Доля игр по классам и архетипам, ${formatLabel}, ${rankLabel}`}
            onNodeClick={(node, path) => {
              if (!node.children) openArchetype(node.id ?? '');
              else if (!path.length) setShareClass(node.id ?? null);
            }}
          />
          <MetaShareList points={shown} totalGames={totalGames} classKey={shareClass} onClassChange={setShareClass} format={format} />
        </div>
      )}
    </section>
  );
}

/** Archetypes by share of games beside the treemap: a bar, the share and games; a class filter narrows it. */
function MetaShareList({ points, totalGames, classKey, onClassChange, format }: {
  points: StandardMetaChartPoint[];
  totalGames: number;
  classKey: string | null;
  onClassChange: (classKey: string | null) => void;
  format: 'standard' | 'wild';
}) {
  const [expanded, setExpanded] = useState(false);
  const withGames = useMemo(() => points.filter(point => point.games).sort((a, b) => (b.games ?? 0) - (a.games ?? 0)), [points]);
  const classes = useMemo(() => [...new Set(withGames.map(point => classOf(point)).filter(key => key !== null))]
    .sort((a, b) => STANDARD_META_CLASS_LABELS[a].localeCompare(STANDARD_META_CLASS_LABELS[b], 'ru')), [withGames]);
  const rows = withGames.filter(point => !classKey || point.classKey === classKey);
  const shown = expanded ? rows : rows.slice(0, SHARE_LIST_ROWS);
  const top = rows[0]?.games ?? 0;
  return (
    <section className="standard-meta-shares__list" aria-label="Архетипы по доле игр">
      <div className="standard-meta-shares__classes" role="group" aria-label="Класс">
        <button type="button" aria-pressed={!classKey} onClick={() => onClassChange(null)}>Все</button>
        {classes.map(key => (
          <button key={key} type="button" aria-pressed={classKey === key} title={STANDARD_META_CLASS_LABELS[key]}
            aria-label={STANDARD_META_CLASS_LABELS[key]} onClick={() => onClassChange(key)}>
            <img src={standardMetaClassIcon(key)} alt="" width="22" height="22" loading="lazy" decoding="async" />
          </button>
        ))}
      </div>
      <ol>
        {shown.map(point => {
          const color = classOf(point) ? STANDARD_META_CLASS_COLORS[classOf(point) as StandardMetaClass] : STANDARD_META_NEUTRAL_COLOR;
          return (
            <li key={point.id} style={{ '--share-color': color } as CSSProperties}>
              <img src={standardMetaClassIcon(classOf(point))} alt="" width="24" height="24" loading="lazy" decoding="async" />
              <a href={canonicalPagePath(`/standard/archetypes/${format}/${point.slug}`)}>{point.archetypeLabel}</a>
              <strong>{percent(totalGames ? ((point.games ?? 0) / totalGames) * 100 : 0)}</strong>
              <span className="standard-meta-shares__bar" aria-hidden="true"><i style={{ inlineSize: `${top ? ((point.games ?? 0) / top) * 100 : 0}%` }} /></span>
              <small>{count(point.games ?? 0)} игр</small>
            </li>
          );
        })}
      </ol>
      {rows.length > SHARE_LIST_ROWS && (
        <button type="button" className="standard-meta-shares__more" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
          {expanded ? 'Свернуть' : `Показать все ${rows.length}`}
        </button>
      )}
    </section>
  );
}

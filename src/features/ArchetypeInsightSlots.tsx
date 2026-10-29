import React from 'react';
import { ChevronDown, GitCompareArrows, Grid3x3, Radar } from 'lucide-react';
import { ArchetypeDetailSection, useArchetypeCatalog } from '../modules/constructedArchetypes/public';
import { LoadingBlock, LoadingSurface } from '../shared/ui/LoadingSurface';
import { Title, Words } from './archetypeSkeletonText';
import './ConstructedArchetypeInsights.css';

// Slots of the lazily loaded VaryloUI insights (ConstructedArchetypeInsights). Each fallback
// reserves the loaded block's height, so a chunk arriving late shifts nothing.

/** Started beside the subscriber reads, so the charts are usually ready when their data is. */
export const loadInsights = () => import('./ConstructedArchetypeInsights');
const LazyHeatmap = React.lazy(() => loadInsights().then(module => ({ default: module.RankHeatmap })));
const LazyComparison = React.lazy(() => loadInsights().then(module => ({ default: module.BuildComparison })));
const LazyRadar = React.lazy(() => loadInsights().then(module => ({ default: module.ArchetypeRadar })));

type RankMatrix = React.ComponentProps<typeof LazyHeatmap>['matrix'];
type RadarItem = React.ComponentProps<typeof LazyRadar>['item'];

function InsightHeading({ icon, eyebrow, title, text }: { icon: React.ReactNode; eyebrow: string; title: string; text: string }) {
  return <header className="archetype-section-heading">
    <div>
      <span className="archetypes-eyebrow">{icon} {eyebrow}</span>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  </header>;
}

const RANKS_TEXT = 'Винрейт архетипа в каждом ранге за разные периоды HSGuru, ниже — первым ходом и с монеткой в окне «После банов». Пустая клетка — в срезе меньше 100 игр.';

function RankHeatmapSkeleton() {
  return <LoadingSurface label="Загружаем винрейт по рангам" quiet layout="rows" className="archetype-detail-skeleton">
    <div className="archetype-insight archetype-ranks" inert>
      <div className="archetype-section-heading"><div>
        <span className="archetypes-eyebrow"><Grid3x3 size={15} /><Words>Ранги и периоды</Words></span>
        <Title>Винрейт по рангам</Title>
        <p><Words>{RANKS_TEXT}</Words></p>
      </div></div>
      <LoadingBlock className="archetype-ranks__reserve" />
    </div>
  </LoadingSurface>;
}

/** The «После банов» window by coin as a second rank table; null while no rank has a coin sample. */
function coinMatrix(matrix: RankMatrix | undefined): RankMatrix | null {
  const split = matrix?.coins;
  if (!matrix || !split?.cells.some(cell => cell.winrate !== null)) return null;
  return { ranks: matrix.ranks, periods: split.columns, cells: split.cells, updatedAt: matrix.updatedAt };
}

export function RankHeatmapSection({ read }: { read: { loading: boolean; error: string; retry: () => void; data: { ranks: unknown } | null } }) {
  const matrix = read.data?.ranks as RankMatrix | undefined;
  const coins = coinMatrix(matrix);
  return <ArchetypeDetailSection title="Винрейт по рангам" loading={read.loading || (!read.error && !matrix)} error={read.error} onRetry={read.retry}
    skeleton={<RankHeatmapSkeleton />}>
    <section className="archetype-insight archetype-ranks" aria-labelledby="archetype-ranks-title" data-tour-id="archetype-ranks">
      <header className="archetype-section-heading"><div>
        <span className="archetypes-eyebrow"><Grid3x3 size={15} /> Ранги и периоды</span>
        <h2 id="archetype-ranks-title">Винрейт по рангам</h2>
        <p>{RANKS_TEXT}</p>
      </div></header>
      <React.Suspense fallback={<LoadingBlock className="archetype-ranks__reserve" />}>
        {matrix ? <LazyHeatmap matrix={matrix} /> : null}
        {matrix && coins ? <>
          <h3 className="archetype-ranks__subtitle">Первым ходом и с монеткой · После&nbsp;банов</h3>
          <LazyHeatmap matrix={coins} legend={false} caption="Винрейт архетипа в окне «После банов» HSGuru: первым ходом и с монеткой, по рангам" />
        </> : null}
      </React.Suspense>
    </section>
  </ArchetypeDetailSection>;
}

type Build = { deckCode: string; games: number | null; winrate: number | null };

/** While the insights chunk arrives: the picker strip and the head-to-head table it opens with. */
function BuildComparisonReserve() {
  return <LoadingSurface label="Загружаем сравнение сборок" quiet layout="rows" className="archetype-build-comparison-slot__reserve">
    <LoadingBlock className="archetype-build-comparison-slot__picker" />
    <LoadingBlock className="archetype-build-comparison-slot__table" />
  </LoadingSurface>;
}

/**
 * Collapsed until a reader opens it: the picker's deck renders and the two card lists are
 * requested only then. The button is a disclosure (aria-expanded) for the region below it.
 */
export function BuildComparisonSection({ builds, format, archetype }: { builds: readonly Build[]; format: string; archetype: string }) {
  const [open, setOpen] = React.useState(false);
  // Once opened it stays mounted, so closing and reopening keeps the picked pair.
  const [opened, setOpened] = React.useState(false);
  if (builds.length < 2) return null;
  return <section className="archetype-insight archetype-compare" aria-labelledby="archetype-compare-title" data-tour-id="archetype-compare"
    data-open={open || undefined}>
    <header className="archetype-section-heading">
      <div>
        <span className="archetypes-eyebrow"><GitCompareArrows size={15} aria-hidden="true" /> Сборки</span>
        <h2 id="archetype-compare-title">Сравнение сборок</h2>
        <p>Выберите две из {builds.length} сборок: винрейт с погрешностью, надёжность выборки, кривая маны и карты, которыми они отличаются.</p>
      </div>
      <button type="button" className="archetype-compare__toggle" aria-expanded={open} aria-controls="archetype-compare-content"
        onClick={() => { setOpened(true); setOpen(value => !value); }}>
        {open ? 'Свернуть' : 'Сравнить сборки'}
        <ChevronDown size={17} aria-hidden="true" />
      </button>
    </header>
    <div id="archetype-compare-content" className="archetype-build-comparison-slot" hidden={!open}>
      {opened ? <React.Suspense fallback={<BuildComparisonReserve />}>
        <LazyComparison builds={builds} format={format} archetype={archetype} />
      </React.Suspense> : null}
    </div>
  </section>;
}

type Format = 'standard' | 'wild';

/** The format's catalog summary is the anonymous teaser list the catalog page already reads. */
export function ArchetypeRadarSection({ item, viewerId }: { item: RadarItem & { format: Format }; viewerId?: string }) {
  const catalog = useArchetypeCatalog<{ format: Format; items: RadarItem[] }>(item.format, null);
  const items = catalog.data?.format === item.format ? catalog.data.items : null;
  return <section className="archetype-insight archetype-radar-section" aria-labelledby="archetype-radar-title" data-tour-id="archetype-radar">
    <InsightHeading icon={<Radar size={15} />} eyebrow="Профиль архетипа" title="Сравнение с другим архетипом"
      text="Найдите соперника: радар показывает место обоих архетипов в формате (0 — минимум, 100 — максимум) и их реальные значения, таблица — кто впереди, ниже — их очный матчап." />
    <React.Suspense fallback={<LoadingBlock className="archetype-radar__reserve" />}>
      {items ? <LazyRadar item={item} items={items} viewerId={viewerId} /> : catalog.error
        ? <p className="archetype-insight-empty">{catalog.error}</p> : <LoadingBlock className="archetype-radar__reserve" />}
    </React.Suspense>
  </section>;
}

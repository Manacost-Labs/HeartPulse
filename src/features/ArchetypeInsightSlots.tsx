import React from 'react';
import { GitCompareArrows, Grid3x3, Radar } from 'lucide-react';
import { ArchetypeDetailSection, useArchetypeCatalog } from '../modules/constructedArchetypes/public';
import { LoadingBlock, LoadingSurface } from '../shared/ui/LoadingSurface';
import { Title, Words } from './archetypeSkeletonText';
import './ConstructedArchetypeInsights.css';

// Slots of the lazily loaded VaryloUI insights (ConstructedArchetypeInsights). Each fallback
// reserves the loaded block's height, so a chunk arriving late shifts nothing.

/** Started beside the subscriber reads, so the charts are usually ready when their data is. */
export const loadInsights = () => import('./ConstructedArchetypeInsights');
const LazyBand = React.lazy(() => loadInsights().then(module => ({ default: module.WinrateBandChart })));
const LazyHeatmap = React.lazy(() => loadInsights().then(module => ({ default: module.RankHeatmap })));
const LazyComparison = React.lazy(() => loadInsights().then(module => ({ default: module.BuildComparison })));
const LazyRadar = React.lazy(() => loadInsights().then(module => ({ default: module.ArchetypeRadar })));

type HistoryPoint = { recordedAt: string; winrate: number | null; popularity: number | null; games: number };
type RankMatrix = React.ComponentProps<typeof LazyHeatmap>['matrix'];
type RadarItem = React.ComponentProps<typeof LazyRadar>['item'];

export function WinrateBandSlot({ history }: { history: readonly HistoryPoint[] }) {
  return <div className="archetype-band-slot">
    <React.Suspense fallback={<LoadingBlock className="archetype-band-slot__reserve" />}><LazyBand history={history} /></React.Suspense>
  </div>;
}

function InsightHeading({ icon, eyebrow, title, text }: { icon: React.ReactNode; eyebrow: string; title: string; text: string }) {
  return <header className="archetype-section-heading">
    <div>
      <span className="archetypes-eyebrow">{icon} {eyebrow}</span>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  </header>;
}

const RANKS_TEXT = 'Винрейт архетипа в каждом ранге за разные периоды HSGuru. Пустая клетка — в срезе меньше 100 игр.';

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

export function RankHeatmapSection({ read }: { read: { loading: boolean; error: string; retry: () => void; data: { ranks: unknown } | null } }) {
  const matrix = read.data?.ranks as RankMatrix | undefined;
  return <ArchetypeDetailSection title="Винрейт по рангам" loading={read.loading || (!read.error && !matrix)} error={read.error} onRetry={read.retry}
    skeleton={<RankHeatmapSkeleton />}>
    <section className="archetype-insight archetype-ranks" aria-labelledby="archetype-ranks-title" data-tour-id="archetype-ranks">
      <header className="archetype-section-heading"><div>
        <span className="archetypes-eyebrow"><Grid3x3 size={15} /> Ранги и периоды</span>
        <h2 id="archetype-ranks-title">Винрейт по рангам</h2>
        <p>{RANKS_TEXT}</p>
      </div></header>
      <React.Suspense fallback={<LoadingBlock className="archetype-ranks__reserve" />}>{matrix ? <LazyHeatmap matrix={matrix} /> : null}</React.Suspense>
    </section>
  </ArchetypeDetailSection>;
}

type Build = { deckCode: string; games: number | null; winrate: number | null };

export function BuildComparisonSection({ builds, format, archetype }: { builds: readonly Build[]; format: string; archetype: string }) {
  if (builds.length < 2) return null;
  return <section className="archetype-insight archetype-compare" aria-labelledby="archetype-compare-title" data-tour-id="archetype-compare">
    <header className="archetype-section-heading"><div>
      <span className="archetypes-eyebrow"><GitCompareArrows size={15} /> Сборки</span>
      <h2 id="archetype-compare-title">Сравнение сборок</h2>
      <p>Выберите две сборки: их выборка, винрейт и кривая маны по составу колоды.</p>
    </div></header>
    <div className="archetype-build-comparison-slot">
      <React.Suspense fallback={<LoadingBlock className="archetype-build-comparison-slot__reserve" />}>
        <LazyComparison builds={builds} format={format} archetype={archetype} />
      </React.Suspense>
    </div>
  </section>;
}

type Format = 'standard' | 'wild';

/** The format's catalog summary is the anonymous teaser list the catalog page already reads. */
export function ArchetypeRadarSection({ item }: { item: RadarItem & { format: Format } }) {
  const catalog = useArchetypeCatalog<{ format: Format; items: RadarItem[] }>(item.format, null);
  const items = catalog.data?.format === item.format ? catalog.data.items : null;
  return <section className="archetype-insight archetype-radar-section" aria-labelledby="archetype-radar-title" data-tour-id="archetype-radar">
    <InsightHeading icon={<Radar size={15} />} eyebrow="Профиль архетипа" title="Сравнение с другим архетипом"
      text="Каждая ось — место среди всех архетипов формата: 0 — самое низкое значение, 100 — самое высокое." />
    <React.Suspense fallback={<LoadingBlock className="archetype-radar__reserve" />}>
      {items ? <LazyRadar item={item} items={items} /> : catalog.error
        ? <p className="archetype-insight-empty">{catalog.error}</p> : <LoadingBlock className="archetype-radar__reserve" />}
    </React.Suspense>
  </section>;
}

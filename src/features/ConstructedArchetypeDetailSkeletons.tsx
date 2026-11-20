import React from 'react';
import { Copy, TrendingUp } from 'lucide-react';
import { LoadingBlock, LoadingSurface } from '../shared/ui/LoadingSurface';
import { ChartFrame } from '../shared/ui/analytics/ChartFrame';
import '../shared/ui/LoadingSurface.css';
import './deckrender/DeckRenderPreview.css';
import './ConstructedArchetypes.css';
import './ConstructedArchetypeDetailSkeletons.css';
import './ConstructedArchetypeInsights.css';
import { Title, Value, Words } from './archetypeSkeletonText';
import { useDeckLayout, type DeckLayout } from './deckViews/DeckLayoutSwitch';
import { DeckCodeSkeleton, RowSkeleton as DeckRowSkeleton, TileSkeleton as DeckTileSkeleton } from './deckViews/DeckViewSkeletons';
import './ConstructedArchetypeDeckGallery.css';

// Placeholders for the independently loaded parts of an archetype page. Each
// one reuses the loaded view's own classes, so frames, paddings, grids and
// the square deck image keep their real geometry. Static copy is drawn as
// text-shaped bars in the real font, so it wraps where the loaded copy wraps;
// data values are one-line bars. Nothing here is a heading, link or button.

/** A build card of ConstructedArchetypeDeckGallery: summary, square deck image and copy bar. */
export function ArchetypeDeckCardSkeleton() {
  return <div className="archetype-deck-card">
    <div className="archetype-deck-card__summary">
      <span className="archetype-deck-card__number" />
      <dl>
        <div><dt><Words>Игры</Words></dt><dd><Value /></dd></div>
        <div><dt><Words>Винрейт</Words></dt><dd><Value /></dd></div>
      </dl>
    </div>
    <div className="deck-render-preview"><LoadingBlock className="deck-render-preview__loading" /></div>
    <DeckCodeSkeleton />
    <div className="archetype-deck-card__copy"><Copy /><Words>Скопировать код колоды</Words></div>
  </div>;
}

const GALLERY_SKELETON: Record<DeckLayout, { className: string; Card: () => React.JSX.Element }> = {
  tiles: { className: 'fun-decks-tiles-grid archetype-deck-gallery--views', Card: () => <DeckTileSkeleton code /> },
  rows: { className: 'fun-decks-rows archetype-deck-gallery--views', Card: () => <DeckRowSkeleton code /> },
  images: { className: 'archetype-deck-gallery', Card: ArchetypeDeckCardSkeleton },
};

/** The gallery in the reader's deck view, under the bar with the view switch. */
function BuildsGallerySkeleton({ cards }: { cards: number }) {
  const [layout] = useDeckLayout();
  const { className, Card } = GALLERY_SKELETON[layout];
  return <>
    <div className="fun-decks-layout-bar archetype-deck-gallery__bar">
      <p><Words>6 сборок</Words></p>
      <LoadingBlock className="fun-decks-layout-skeleton" />
    </div>
    <div className={className}>
      {Array.from({ length: cards }, (_, index) => <Card key={index} />)}
    </div>
  </>;
}

/** Cards the gallery shows before «show more» (ConstructedArchetypes). */
const FIRST_BUILDS = 8;

/** The builds gallery while the subscriber core loads: its heading, the first page of cards and «show more». */
export function ArchetypeBuildsSkeleton({ deckCount = FIRST_BUILDS }: { deckCount?: number }) {
  const cards = Math.max(1, Math.min(FIRST_BUILDS, deckCount));
  return <LoadingSurface label="Загружаем сборки архетипа" quiet layout="rows" className="archetype-detail-skeleton">
    <div className="archetype-builds" inert>
      <div className="archetype-section-heading">
        <div>
          <Title>Сборки архетипа</Title>
          <p><Words>Сборки отсортированы по размеру выборки. Код можно скопировать и сразу импортировать в Hearthstone.</Words></p>
        </div>
        <span className="archetype-section-heading__count"><Value /></span>
      </div>
      <BuildsGallerySkeleton cards={cards} />
      {deckCount > FIRST_BUILDS ? <LoadingBlock className="archetype-builds__more" /> : null}
    </div>
  </LoadingSurface>;
}

const HISTORY_CHARTS = [
  { title: 'Винрейт', subtitle: '\u2007\u2007\u2007 срезов · пунктир — смена периода HSGuru · полоса — 95% интервал' },
  { title: 'Популярность', subtitle: '\u2007\u2007\u2007 срезов · пунктир — смена периода HSGuru' },
  { title: 'Игр за сутки', subtitle: 'Прирост игр за 24 часа внутри периода HSGuru' },
];
/** The width of a short slice date («24 июл») in figure spaces: the scrubber labels wrap where real dates wrap. */
const CHART_DATE = '\u2007\u2007 июл';

/** The history section: real heading frame and three chart frames with a 240 px plot and selection controls. */
export function ArchetypeHistorySkeleton() {
  return <LoadingSurface label="Загружаем историю архетипа" quiet layout="rows" className="archetype-detail-skeleton">
    <div className="archetype-history" inert>
      <div className="archetype-section-heading">
        <div>
          <span className="archetypes-eyebrow"><TrendingUp size={15} /><Words>Накопительная статистика</Words></span>
          <Title>История архетипа</Title>
          <p><Words>Срез добавляется каждые 12 часов. HSGuru считает статистику внутри периода — патча или дополнения — и с новым периодом начинает счёт заново, поэтому граница отмечена пунктиром.</Words></p>
        </div>
        <span className="archetype-section-heading__count"><Value /></span>
      </div>
      <div className="archetype-history__charts">
        {HISTORY_CHARTS.map(({ title, subtitle }) => <ChartFrame key={title} title={title} subtitle={subtitle}>
          <div className="analytics-chart__plot">
            <LoadingBlock className="archetype-skeleton__plot" />
            <div className="analytics-chart__selection">
              <LoadingBlock className="archetype-skeleton__selection-value" />
              <div className="analytics-chart__scrubber">
                <LoadingBlock className="archetype-skeleton__range" />
                <div><Words>{CHART_DATE}</Words><Words>{CHART_DATE}</Words></div>
              </div>
            </div>
          </div>
        </ChartFrame>)}
      </div>
    </div>
  </LoadingSurface>;
}

/** The lazy analysis chunk: its view and its placeholder share it, with the analysis stylesheet in its own cascade place. */
export const loadArchetypeAnalysis = () => import('./ConstructedArchetypeAnalysis');
// A placeholder must never throw: if the chunk fails, the reserve stays and
// the view's own error boundary reports the failure.
const LazyAnalysisSkeleton = React.lazy(() => loadArchetypeAnalysis()
  .then(module => ({ default: module.ArchetypeAnalysisSkeleton }), () => ({ default: ArchetypeAnalysisReserve })));

/** While the analysis chunk itself loads: one status and a first-screen reserve, no copied frame. */
export function ArchetypeAnalysisReserve() {
  return <LoadingSurface label="Загружаем матчапы и муллиган" quiet layout="rows" className="archetype-analysis-reserve" />;
}

/** The analysis section's placeholder: the fitted skeleton from the lazy chunk, the reserve until that chunk arrives. */
export function ArchetypeAnalysisLoading() {
  return <React.Suspense fallback={<ArchetypeAnalysisReserve />}><LazyAnalysisSkeleton /></React.Suspense>;
}

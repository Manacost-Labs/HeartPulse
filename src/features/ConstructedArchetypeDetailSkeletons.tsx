import React from 'react';
import { Copy, TrendingUp } from 'lucide-react';
import { LoadingBlock, LoadingSurface } from '../shared/ui/LoadingSurface';
import { ChartFrame } from '../shared/ui/analytics/ChartFrame';
import '../shared/ui/LoadingSurface.css';
import './deckrender/DeckRenderPreview.css';
import './ConstructedArchetypes.css';
import './ConstructedArchetypeDetailSkeletons.css';
import { Title, Value, Words } from './archetypeSkeletonText';

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
    <div className="archetype-deck-card__copy"><Copy /><Words>Скопировать код колоды</Words></div>
  </div>;
}

/** Cards the gallery shows before «show more» (ConstructedArchetypes). */
const FIRST_BUILDS = 6;

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
      <div className="archetype-deck-gallery">
        {Array.from({ length: cards }, (_, index) => <ArchetypeDeckCardSkeleton key={index} />)}
      </div>
      {deckCount > FIRST_BUILDS ? <LoadingBlock className="archetype-builds__more" /> : null}
    </div>
  </LoadingSurface>;
}

const HISTORY_CHARTS = ['Винрейт', 'Популярность', 'Количество игр'];
/** The width of a slice date («24 июл., 12:00») in figure spaces: the scrubber labels wrap where real dates wrap. */
const CHART_DATE = '\u2007\u2007 июл., \u2007\u2007:\u2007\u2007';

/** The history section: real heading frame and three real chart frames with a 240 px plot and selection controls. */
export function ArchetypeHistorySkeleton() {
  return <LoadingSurface label="Загружаем историю архетипа" quiet layout="rows" className="archetype-detail-skeleton">
    <div className="archetype-history" inert>
      <div className="archetype-section-heading">
        <div>
          <span className="archetypes-eyebrow"><TrendingUp size={15} /><Words>Накопительная статистика</Words></span>
          <Title>История архетипа</Title>
          <p><Words>Новый срез добавляется каждые 12 часов. Через несколько дней здесь будет виден тренд, а через месяц — полноценная история меты.</Words></p>
        </div>
        <span className="archetype-section-heading__count"><Value /></span>
      </div>
      <div className="archetype-history__charts">
        {HISTORY_CHARTS.map(title => <ChartFrame key={title} title={title} subtitle={'   срезов · история архетипа'}>
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

import { ArrowRight } from 'lucide-react';
import { LoadingBlock, LoadingSurface } from '../../../shared/ui/LoadingSurface';
import '../../../shared/ui/LoadingSurface.css';
import './HomeLatestArticles.css';

/** One article card of the feed while it loads: the real card frame, cover and text rhythm. */
export function HomeArticleSkeleton() {
  return <div className="home-latest-article home-latest-article--loading" aria-hidden="true">
    <LoadingBlock className="home-latest-article__image" />
    <span className="home-latest-article__body">
      <span className="home-latest-article__meta"><LoadingBlock /><LoadingBlock /></span>
      <strong className="home-article-skeleton-title"><LoadingBlock /><LoadingBlock /></strong>
      <span className="home-article-skeleton-excerpt"><LoadingBlock /><LoadingBlock /></span>
      <b><LoadingBlock className="home-article-skeleton-action" /></b>
    </span>
  </div>;
}

/**
 * The whole latest-articles section while its lazy code loads. It is eager
 * (with the section's stylesheet) so the fallback already has the section's
 * heading, board and link row: the swap to the loaded section moves nothing.
 * The static heading is real chrome, hidden from assistive technology so the
 * page outline gains no duplicate heading; the single status names the wait.
 */
export function HomeLatestArticlesSkeleton() {
  return <LoadingSurface label="Загружаем последние статьи" quiet layout="rows" className="home-latest-articles">
    <div className="home-section-heading" aria-hidden="true">
      <div>
        <span>Новые материалы</span>
        <h2>Последние статьи</h2>
      </div>
      <p>Свежие мета-отчёты, разборы патчей и практические гайды редакции.</p>
    </div>
    <div className="home-latest-articles__board">
      {[0, 1, 2].map(index => <HomeArticleSkeleton key={index} />)}
    </div>
    <span className="home-latest-articles__all home-latest-articles__all--loading" aria-hidden="true">
      Все статьи <ArrowRight size={16} aria-hidden="true" />
    </span>
  </LoadingSurface>;
}

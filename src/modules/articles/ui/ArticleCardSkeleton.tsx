import { LoadingBlock } from '../../../shared/ui/LoadingSurface';
import '../../../shared/ui/LoadingSurface.css';
import './ArticleCardSkeleton.css';

/** The measured cover, three-line heading, metadata and voting area of an article. */
export function ArticleCardSkeleton() {
  return <article className="article-card-modern article-card-skeleton overflow-hidden flex flex-col" aria-hidden="true">
    <div className="flex flex-col flex-grow w-full">
      <div className="article-image-shell relative w-full overflow-hidden flex-shrink-0">
        <LoadingBlock className="article-card-skeleton__cover" />
      </div>
      <div className="article-body-modern p-4 flex flex-col flex-grow gap-3">
        <h3 className="article-card-skeleton__heading font-hs text-base leading-snug">
          {[0, 1, 2].map(line => <LoadingBlock key={line} className="article-card-skeleton__line" />)}
        </h3>
        <div className="article-meta-modern flex items-center justify-between mt-auto pt-2">
          <LoadingBlock className="article-card-skeleton__meta" />
          <LoadingBlock className="article-card-skeleton__meta" />
        </div>
      </div>
    </div>
    <div className="article-vote-row flex items-center gap-2 px-4 pt-1">
      <LoadingBlock className="article-card-skeleton__vote" />
      <LoadingBlock className="article-card-skeleton__vote" />
    </div>
  </article>;
}

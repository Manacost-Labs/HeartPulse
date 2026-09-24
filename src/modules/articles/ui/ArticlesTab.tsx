import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { BookOpen, Search, ThumbsDown, ThumbsUp } from 'lucide-react';
import { Breadcrumbs, SectionBanner } from '../../../shared/ui/EditorialRouteChrome';
import { canAccessAdminWorkspace, type AuthUser } from '../../identity/public';
import { hasSubscriptionEntitlement, type SubscriptionEntitlementKey, type SubscriptionStatus } from '../../subscriptions/public';
import { requestArticleAccessLink, submitArticleVote } from '../api/articleRequests';
import type { Article, ArticlesData } from '../model/types';

const ARTICLE_COVER_PROXY_HOSTS = new Set([
  'hs-manacost.ru',
  'www.hs-manacost.ru',
  'kolodahearthstone.com',
  'www.kolodahearthstone.com',
  'kolodahearthstone.ru',
  'www.kolodahearthstone.ru',
]);

function articleImageSrc(value?: string): string {
  const raw = String(value ?? '').trim();
  if (!raw || raw.startsWith('/')) return raw;
  try {
    const url = new URL(raw);
    if (ARTICLE_COVER_PROXY_HOSTS.has(url.hostname.toLowerCase())) {
      return `/api/article-cover?url=${encodeURIComponent(url.href)}`;
    }
  } catch {
    return raw;
  }
  return raw;
}

function isKolodaArticleUrl(value?: string): boolean {
  const raw = String(value ?? '').trim();
  if (!raw) return false;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return host === 'kolodahearthstone.com'
      || host === 'www.kolodahearthstone.com'
      || host === 'kolodahearthstone.ru'
      || host === 'www.kolodahearthstone.ru';
  } catch {
    return false;
  }
}

function formatArticleDate(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function articleEntitlement(article: Article): SubscriptionEntitlementKey | null {
  const explicitMode = String(article.mode || '').toLowerCase();
  if (explicitMode === 'battlegrounds') return 'battlegroundsArticles';
  if (explicitMode === 'arena') return 'arenaArticles';
  if (explicitMode === 'standard' || explicitMode === 'wild') return 'standard';
  if (explicitMode === 'general') return null;
  const haystack = [article.tag, article.title, article.excerpt, article.url]
    .map(value => String(value || '').toLowerCase().replace(/ё/g, 'е'))
    .join(' ');
  if (/(поля сражений|полей сражений|battleground|battle grounds|tavern|таверна|боб|bob|бг)/.test(haystack)) return 'battlegroundsArticles';
  if (/(арена|arena)/.test(haystack)) return 'arenaArticles';
  return null;
}

function canAccessArticle(article: Article, subscription: SubscriptionStatus | null | undefined, authUser?: AuthUser | null): boolean {
  if (canAccessAdminWorkspace(authUser)) return true;
  return hasSubscriptionEntitlement(subscription, articleEntitlement(article));
}

function useArticleLink(article: Article, authUser?: AuthUser | null, subscriptionStatus?: SubscriptionStatus | null, subscriptionLoading = false) {
  const [opening, setOpening] = useState(false);
  const isVipArticle = isKolodaArticleUrl(article.url);
  const hasArticleAccess = canAccessArticle(article, subscriptionStatus, authUser);
  const readLabel = opening ? 'Открываю…'
    : authUser && isVipArticle && hasArticleAccess ? 'Читать VIP →'
      : authUser && isVipArticle && subscriptionLoading ? 'Проверяем →' : 'Читать →';
  const openArticle = async () => {
    if (!article.url || article.url === '#') return;
    if (!isVipArticle) {
      window.open(article.url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (!authUser) { window.location.href = '/?login'; return; }
    if (subscriptionLoading) return;
    if (!hasArticleAccess) {
      window.alert('Для VIP-статьи нужна подписка подходящего режима.');
      return;
    }
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    setOpening(true);
    try {
      const nextUrl = await requestArticleAccessLink(article);
      if (tab) tab.location.href = nextUrl;
      else window.open(nextUrl, '_blank', 'noopener,noreferrer');
    } catch (err: unknown) {
      if (tab) tab.close();
      window.alert(err instanceof Error ? err.message : 'Не удалось открыть разблокированную статью.');
    } finally { setOpening(false); }
  };
  return { openArticle, readLabel };
}

function ArticleCard({
  article,
  idx,
  authUser,
  subscriptionStatus,
  subscriptionLoading = false,
  onVote,
  voting = false,
}: {
  article: Article;
  idx: number;
  authUser?: AuthUser | null;
  subscriptionStatus?: SubscriptionStatus | null;
  subscriptionLoading?: boolean;
  onVote: (article: Article, vote: 'like' | 'dislike') => void;
  voting?: boolean;
}) {
  const [imgErr, setImgErr] = useState(false);
  const isFeatured = idx === 0;
  const { openArticle, readLabel } = useArticleLink(article, authUser, subscriptionStatus, subscriptionLoading);

  return (
    <article
      className={`article-card-modern anim-scale-in rounded-2xl overflow-hidden flex flex-col cursor-pointer transition-all duration-200 ${isFeatured ? 'article-card-featured' : ''}`}
      style={{
        animationDelay: `${idx * 0.06}s`,
      }}
      onClick={openArticle}
    >
      <div className="article-image-shell relative w-full overflow-hidden flex-shrink-0">
        {!imgErr ? (
          <img src={articleImageSrc(article.image)} alt={article.title} loading="lazy"
            onError={() => setImgErr(true)}
            className="w-full h-full object-contain" />
        ) : (
          <div className="article-image-fallback w-full h-full flex items-center justify-center">
            <BookOpen size={36} aria-hidden="true" />
          </div>
        )}
        {article.tag && (
          <span className="article-tag absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-bold">
            {article.tag}
          </span>
        )}
      </div>
      <div className="article-body-modern p-4 flex flex-col flex-grow gap-3">
        <h3 className="font-hs text-base leading-snug">
          {article.title}
        </h3>
        <div className="article-meta-modern flex items-center justify-between mt-auto pt-2">
          <span className="text-xs">
            {formatArticleDate(article.date)}
          </span>
          <span className="article-read-link text-xs font-bold">{readLabel}</span>
        </div>
        <div className="article-vote-row flex items-center gap-2 pt-1" onClick={event => event.stopPropagation()}>
          <button
            type="button"
            className={`article-vote-button ${article.userVote === 'like' ? 'is-active' : ''}`}
            disabled={voting}
            onClick={() => onVote(article, 'like')}
            aria-label="Поставить лайк статье"
          >
            <ThumbsUp size={15} />
            <span>{article.likes ?? 0}</span>
          </button>
          <button
            type="button"
            className={`article-vote-button ${article.userVote === 'dislike' ? 'is-active' : ''}`}
            disabled={voting}
            onClick={() => onVote(article, 'dislike')}
            aria-label="Поставить дизлайк статье"
          >
            <ThumbsDown size={15} />
            <span>{article.dislikes ?? 0}</span>
          </button>
        </div>
      </div>
    </article>
  );
}

function ArticlesToolbar({ articleSearch, articleTag, articleTags, setArticleSearch, setArticleTag }: {
  articleSearch: string; articleTag: string; articleTags: string[];
  setArticleSearch: (value: string) => void; setArticleTag: (value: string) => void;
}) {
  return <div className="articles-toolbar-modern mb-5">
    <label className="articles-search-modern">
      <Search size={17} aria-hidden="true" />
      <input name="article-search" value={articleSearch}
        onChange={event => setArticleSearch(event.target.value)}
        placeholder="Поиск по статьям" aria-label="Поиск по статьям" />
    </label>
    <div className="articles-tag-filter" aria-label="Фильтр по тегам">
      <button type="button" className={articleTag === '__all__' ? 'is-active' : ''} onClick={() => setArticleTag('__all__')}>Все</button>
      {articleTags.map(tag => <button key={tag} type="button"
        className={articleTag === tag ? 'is-active' : ''} onClick={() => setArticleTag(tag)}>{tag}</button>)}
    </div>
  </div>;
}

function filterArticles(articles: Article[], votes: Record<string, Pick<Article, 'likes' | 'dislikes' | 'userVote'>>, tag: string, search: string) {
  const query = search.trim().toLowerCase();
  return articles
    .map(article => ({ ...article, ...(votes[article.id] ?? {}) }))
    .filter(article => {
      if (tag !== '__all__' && (article.tag?.trim() || '') !== tag) return false;
      if (!query) return true;
      return [article.title, article.tag, article.date]
        .filter(Boolean).join(' ').toLowerCase().includes(query);
    })
    .sort((a, b) => {
      const left = Date.parse(a.date || '');
      const right = Date.parse(b.date || '');
      return (Number.isFinite(right) ? right : 0) - (Number.isFinite(left) ? left : 0);
    });
}

export function ArticlesTab({
  data,
  loading,
  onNavigate,
  authUser,
  subscriptionStatus,
  subscriptionLoading,
}: {
  data: ArticlesData;
  loading: boolean;
  onNavigate: (tab: string) => void;
  authUser?: AuthUser | null;
  subscriptionStatus?: SubscriptionStatus | null;
  subscriptionLoading?: boolean;
}) {
  const [articleSearch, setArticleSearch] = useState('');
  const deferredArticleSearch = useDeferredValue(articleSearch);
  const [articleTag, setArticleTag] = useState('__all__');
  const [articleVotes, setArticleVotes] = useState<Record<string, Pick<Article, 'likes' | 'dislikes' | 'userVote'>>>({});
  const [votingArticleId, setVotingArticleId] = useState('');

  useEffect(() => {
    setArticleVotes(Object.fromEntries(data.articles.map(article => [
      article.id,
      {
        likes: article.likes ?? 0,
        dislikes: article.dislikes ?? 0,
        userVote: article.userVote ?? null,
      },
    ])));
  }, [data.articles]);

  const articleTags = useMemo(() => {
    const tags = new Set<string>();
    data.articles.forEach(article => {
      const tag = article.tag?.trim();
      if (tag) tags.add(tag);
    });
    return Array.from(tags).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [data.articles]);

  const visibleArticles = useMemo(() => filterArticles(data.articles, articleVotes, articleTag, deferredArticleSearch),
    [articleTag, articleVotes, data.articles, deferredArticleSearch]);

  const handleArticleVote = useCallback(async (article: Article, vote: 'like' | 'dislike') => {
    if (!authUser) {
      window.location.href = '/?login';
      return;
    }
    if (subscriptionLoading) return;
    if (!canAccessArticle(article, subscriptionStatus, authUser)) {
      window.alert('Голосовать за эту статью могут только подписчики подходящего режима.');
      return;
    }
    setVotingArticleId(article.id);
    try {
      const result = await submitArticleVote(article.id, vote);
      setArticleVotes(previous => ({
        ...previous,
        [article.id]: {
          likes: result.likes, dislikes: result.dislikes, userVote: result.userVote,
        },
      }));
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : 'Не удалось сохранить голос.');
    } finally {
      setVotingArticleId('');
    }
  }, [authUser, subscriptionLoading, subscriptionStatus]);

  return (
    <div className="articles-page">
      <SectionBanner title="Статьи" subtitle="Гайды, разборы мета и советы по режиму Арена" />
      <Breadcrumbs items={[
        { name: 'Главная', href: '/', onClick: () => onNavigate('home') },
        { name: 'Статьи', href: '/articles' },
      ]} />

      <ArticlesToolbar articleSearch={articleSearch} articleTag={articleTag} articleTags={articleTags}
        setArticleSearch={setArticleSearch} setArticleTag={setArticleTag} />

      {loading ? (
        <div className="articles-grid-modern grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1,2,3].map(i => <div key={i} className="skeleton h-72 rounded-2xl" />)}
        </div>
      ) : visibleArticles.length === 0 ? (
        <div className="articles-empty-modern text-center py-16">
          <BookOpen size={42} aria-hidden="true" className="mx-auto mb-3" />
          <p className="font-hs text-xl">{data.articles.length ? 'Статьи не найдены' : 'Статьи скоро появятся'}</p>
        </div>
      ) : (
        <div className="articles-grid-modern grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {visibleArticles.map((article, index) => <ArticleCard key={article.id}
            article={article} idx={index} authUser={authUser}
            subscriptionStatus={subscriptionStatus} subscriptionLoading={subscriptionLoading}
            onVote={handleArticleVote} voting={votingArticleId === article.id} />)}
        </div>
      )}
    </div>
  );
}

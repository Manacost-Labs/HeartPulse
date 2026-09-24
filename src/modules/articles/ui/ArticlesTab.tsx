import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { BookOpen, Search } from 'lucide-react';
import { Breadcrumbs, SectionBanner } from '../../../shared/ui/EditorialRouteChrome';
import type { AuthUser } from '../../identity/public';
import type { SubscriptionStatus } from '../../subscriptions/public';
import { submitArticleVote } from '../api/articleRequests';
import type { Article, ArticlesData } from '../model/types';
import { ArticleCard, canAccessArticle } from './ArticleCard';

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
  const visible: Article[] = [];
  for (const base of articles) {
    const article = { ...base, ...(votes[base.id] ?? {}) };
    if (tag !== '__all__' && (article.tag?.trim() || '') !== tag) continue;
    if (query && ![article.title, article.tag, article.date]
      .filter(Boolean).join(' ').toLowerCase().includes(query)) continue;
    visible.push(article);
  }
  return visible.sort((a, b) => {
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

import { useState } from 'react';
import { BookOpen, ThumbsDown, ThumbsUp } from 'lucide-react';
import { canAccessAdminWorkspace, type AuthUser } from '../../identity/public';
import { hasSubscriptionEntitlement, type SubscriptionEntitlementKey, type SubscriptionStatus } from '../../subscriptions/public';
import { requestArticleAccessLink } from '../api/articleRequests';
import type { Article } from '../model/types';

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

export function canAccessArticle(article: Article, subscription: SubscriptionStatus | null | undefined, authUser?: AuthUser | null): boolean {
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

export function ArticleCard({
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
      className={`article-card-modern anim-scale-in rounded-2xl overflow-hidden flex flex-col transition-all duration-200 ${isFeatured ? 'article-card-featured' : ''}`}
      style={{
        animationDelay: `${idx * 0.06}s`,
      }}
    >
      <button type="button" onClick={() => void openArticle()}
        aria-label={`Читать статью: ${article.title}`}
        className="flex flex-col flex-grow w-full text-left bg-transparent border-0 p-0 cursor-pointer">
        <div className="article-image-shell relative w-full overflow-hidden flex-shrink-0">
          {!imgErr ? (
            <img src={articleImageSrc(article.image)} alt={article.title} loading="lazy"
              onError={() => setImgErr(true)} className="w-full h-full object-contain" />
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
          <h3 className="font-hs text-base leading-snug">{article.title}</h3>
          <div className="article-meta-modern flex items-center justify-between mt-auto pt-2">
            <span className="text-xs">{formatArticleDate(article.date)}</span>
            <span className="article-read-link text-xs font-bold">{readLabel}</span>
          </div>
        </div>
      </button>
      <div className="article-vote-row flex items-center gap-2 px-4 pt-1">
        <button type="button" className={`article-vote-button ${article.userVote === 'like' ? 'is-active' : ''}`}
          disabled={voting} onClick={() => onVote(article, 'like')} aria-label="Поставить лайк статье">
          <ThumbsUp size={15} /><span>{article.likes ?? 0}</span>
        </button>
        <button type="button" className={`article-vote-button ${article.userVote === 'dislike' ? 'is-active' : ''}`}
          disabled={voting} onClick={() => onVote(article, 'dislike')} aria-label="Поставить дизлайк статье">
          <ThumbsDown size={15} /><span>{article.dislikes ?? 0}</span>
        </button>
      </div>
    </article>
  );
}

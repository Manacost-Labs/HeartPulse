'use client';
import { memo, useLayoutEffect, useRef, type RefObject } from 'react';
import HomeTab, { type HomeArticle, type HomeSummaryData } from '@/src/modules/home/public';
import { settleContent } from '@/src/shared/ui/settleContent';
import { routeEntranceActive } from '@/src/shared/ui/routeEntrance';
import { useHomeFirstPaint } from './useHomeFirstPaint';

// Session verification must not invalidate the lazy, server-rendered sections.
const StableHomeTab = memo(HomeTab);
const EMPTY_ARTICLES: HomeArticle[] = [];

// A feed recovered after the first document paint settles once. After a menu
// navigation the route's entrance already fades it in (`RouteTransition`).
function useFeedArrival(root: RefObject<HTMLDivElement | null>, selector: string, ready: boolean) {
  const previous = useRef(ready);
  useLayoutEffect(() => {
    if (previous.current === ready) return;
    previous.current = ready;
    const content = ready && !routeEntranceActive() ? root.current?.querySelector<HTMLElement>(selector) : null;
    if (!content) return;
    const animation = settleContent(content);
    return () => animation?.cancel();
  }, [root, selector, ready]);
}

export function HomePageContent({ summary, articles, onNavigate }: {
  summary: HomeSummaryData | null; articles: HomeArticle[] | null; onNavigate: (tab: string) => void;
}) {
  const data = useHomeFirstPaint(summary, articles);
  const root = useRef<HTMLDivElement>(null);
  useFeedArrival(root, '[data-home-feed="summary"]', !data.summary.loading);
  useFeedArrival(root, '[data-home-feed="articles"]', !data.articles.loading);
  return <div ref={root} style={{ display: 'contents' }}><StableHomeTab homeSummaryData={data.summary.data} loadingHomeSummary={data.summary.loading}
    articles={data.articles.data ?? EMPTY_ARTICLES} loadingArticles={data.articles.loading}
    serverArticles onNavigate={onNavigate} /></div>;
}

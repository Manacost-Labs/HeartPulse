'use client';

import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import {
  StreamersSkeleton, StreamersUnavailable, StreamerView, isStreamerPage, type StreamerPage,
} from '@/src/modules/streamers/public';
import { usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';
import { useStreamersData } from './useStreamersData';

const merge = (shown: StreamerPage, next: StreamerPage): StreamerPage => ({
  ...shown, decks: [...shown.decks, ...next.decks.filter(deck => !shown.decks.some(row => row.deckId === deck.deckId && row.format === deck.format))],
  total: next.total,
});
const shown = (page: StreamerPage) => page.decks.length;

/** Страница стримера: колоды с фильтрами по формату и классу. */
export function StreamerPageClient({ slug, initial }: { slug: string; initial: StreamerPage | null }) {
  const access = usePublicAccess();
  const data = useStreamersData({ path: `/api/streamers/${encodeURIComponent(slug)}`, initial, isPage: isStreamerPage, merge, shown });
  return <PublicPageShell activeTab="streamers" pathname={`/streamers/${slug}/`} access={access} navigate={navigate} wide>
    <section className="streamers-page space-y-4">
      {data.page
        ? <StreamerView page={{ ...data.page, filters: data.filters }} loading={data.loading} loadingMore={data.loadingMore}
          onFilters={data.setFilters} onMore={data.more} />
        : data.failed ? <StreamersUnavailable onRetry={data.retry} /> : <StreamersSkeleton />}
    </section>
  </PublicPageShell>;
}

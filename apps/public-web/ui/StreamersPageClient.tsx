'use client';

import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import {
  DEFAULT_STREAMERS_FILTERS, StreamersSkeleton, StreamersUnavailable, StreamersView, isStreamersPage, type StreamersPage,
} from '@/src/modules/streamers/public';
import { SectionBanner } from '@/src/shared/ui/EditorialRouteChrome';
import { usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';
import { useStreamersData } from './useStreamersData';

const merge = (shown: StreamersPage, next: StreamersPage): StreamersPage => ({
  ...shown, streamers: [...shown.streamers, ...next.streamers.filter(item => !shown.streamers.some(row => row.slug === item.slug))], total: next.total,
});
const shown = (page: StreamersPage) => page.streamers.length;

/** «Стримеры»: сервер кладёт в HTML то, что успел прочитать, остальное и фильтры грузит браузер. */
export function StreamersPageClient({ initial }: { initial: StreamersPage | null }) {
  const access = usePublicAccess();
  const data = useStreamersData({ path: '/api/streamers', defaults: DEFAULT_STREAMERS_FILTERS, initial, isPage: isStreamersPage, merge, shown });
  return <PublicPageShell activeTab="streamers" pathname="/streamers/" access={access} navigate={navigate} wide>
    <section className="streamers-page space-y-4">
      <SectionBanner title="Стримеры"
        subtitle="Колоды стримеров Hearthstone с HSGuru, ссылки на их Twitch и YouTube и кто сейчас в эфире" />
      {data.page
        ? <StreamersView page={{ ...data.page, filters: data.filters }} live={data.page.live} loading={data.loading}
          loadingMore={data.loadingMore} onFilters={data.setFilters} onMore={data.more} />
        : data.failed ? <StreamersUnavailable onRetry={data.retry} /> : <StreamersSkeleton />}
    </section>
  </PublicPageShell>;
}

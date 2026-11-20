'use client';

import './TierListPage.css';

import { useEffect, useMemo, useState } from 'react';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { TierList } from '@/src/features/DeferredRoutes';
import { useArenaCompanionIds, useArenaTierList,
  type TierlistData } from '@/src/modules/arenaTierList/public';
import { openTierlistView, type CompactTierlist } from '@/apps/public-web/lib/openTierlistView';
import { seoDataDate } from '@/apps/public-web/lib/seoDataDate';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { navigate, navigateTab } from './navigation';

const EMPTY_DATA: TierlistData = {
  sections: [], cards: {}, updatedAt: null, source: 'hsreplay',
};

/**
 * One view for everyone. `pool` is the open tier list the server read: a viewer without access (a guest, a
 * robot, a signed-in visitor without a subscription) gets the subscriber's view on it, rendered on the server,
 * with the closed parts locked in place. A subscriber gets the same view, which switches to the protected data
 * once it has arrived (until then the open data stays). Without a snapshot the page falls back to the full
 * view and its subscription gate.
 */
/**
 * The date, sample and source of the shown data, dated with `<time>` in Moscow time (the same text on the server
 * and in the browser). The protected answer has its own date and no rounded sample, so it is shown without one.
 */
function DataLine({ updatedAt, games }: { updatedAt: string | null; games: number | null }) {
  const date = seoDataDate(updatedAt, Date.now());
  return <p className="tierlist-data-line">
    {date ? <>Данные на <time dateTime={date.iso}>{`${date.date}, ${date.time} МСК`}</time></> : 'Дата обновления неизвестна'}
    {`${games ? ` · по данным более ${games.toLocaleString('ru-RU')} игр` : ''} · источник HSReplay`}
  </p>;
}

export function TierListPageClient({ pool }: { pool: CompactTierlist | null }) {
  const access = usePublicAccess();
  const { allowed, pending } = paidAccess(access, 'arena');
  const tierlist = useArenaTierList(access.user?.id, allowed);
  const companionIds = useArenaCompanionIds(access.user?.id, allowed && tierlist.source !== 'hsreplay');
  const openData = useMemo(() => pool ? openTierlistView(pool) : null, [pool]);
  const paidReady = allowed && (tierlist.state.data?.sections.length ?? 0) > 0;
  const openLayer = openData !== null && !paidReady;
  const data = openLayer ? openData : (tierlist.state.data ?? { ...EMPTY_DATA, source: tierlist.source });
  const [updatedAtLabel, setUpdatedAtLabel] = useState('Нет данных');
  useEffect(() => {
    setUpdatedAtLabel(data.updatedAt
      ? new Date(data.updatedAt).toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
      : 'Нет данных');
  }, [data.updatedAt]);

  return <PublicPageShell activeTab="tierlist" pathname="/tierlist/" parchmentPreload="tablet-up" access={access}
    navigate={navigate} updatedAtLabel={updatedAtLabel}>
    {/* The full view (protected data, or the gate without a snapshot) is the closed part the JSON-LD names. The same
        element in both states, so the view is not remounted (class and filters stay) when the protected data arrives. */}
    <div className={openLayer ? undefined : 'paywalled-tierlist'} style={{ display: 'contents' }}>
      <TierList data={data} loading={openLayer ? false : tierlist.loading || pending}
        error={openLayer ? false : tierlist.error} companionIds={companionIds}
        tierlistSource={openLayer ? 'hsreplay' : tierlist.source} onTierlistSourceChange={tierlist.changeSource}
        switchingTierlistSource={!openLayer && tierlist.switching} onNavigate={navigateTab}
        authUser={access.user} subscriptionStatus={access.subscription}
        subscriptionLoading={pending} onRefreshSubscription={access.refresh}
        accessGranted={allowed} openLayer={openLayer} serverRendered
        dataLine={openLayer && pool ? <DataLine updatedAt={pool.updatedAt} games={pool.sampleGamesAtLeast} />
          // With an open snapshot the line stays when the protected data arrives (no shift); without one the page starts
          // from the skeleton, which has no line, so the protected view shows none either (skeleton-route-geometry).
          : pool && tierlist.source === 'hsreplay' && data.updatedAt ? <DataLine updatedAt={data.updatedAt} games={null} /> : undefined} />
    </div>
  </PublicPageShell>;
}

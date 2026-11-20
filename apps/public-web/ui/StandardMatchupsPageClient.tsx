'use client';

import { useCallback, useEffect, useState } from 'react';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import StandardMatchupsPage from '@/src/features/StandardMatchups';
import { StandardMatchupsOpen } from '@/src/features/StandardMatchupsOpen';
import { useStandardMatchups, type PublicStandardMatchups, type StandardMatchupsFormat } from '@/src/modules/standardMatchups/public';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

/** The browser fetches the matrix chunk while the subscriber's data loads, so the swap needs no wait. */
const loadMatrixChunk = () => import('@/src/features/StandardMatchupMatrix');

/**
 * `initial` is the open slice the server printed (`null`: it had no snapshot, the page says so and the
 * browser asks again). A subscriber's matrix replaces it only once its data and its chunk are both here.
 */
export function StandardMatchupsPageClient({ initial, format = 'standard' }: {
  initial: PublicStandardMatchups | null; format?: StandardMatchupsFormat;
}) {
  const access = usePublicAccess();
  const { allowed } = paidAccess(access, 'standard');
  const matchups = useStandardMatchups(access.user?.id, allowed, { syncUrl: true, pathFormat: format });
  // Each format has its own address: the subscriber's switch goes there and keeps rank, period and floor.
  const changeFormat = useCallback((next: StandardMatchupsFormat) => {
    if (next !== format) navigate(`${next === 'wild' ? '/standard/matchups/wild/' : '/standard/matchups/'}${window.location.search}`);
  }, [format]);
  const [chunkReady, setChunkReady] = useState(false);
  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    void loadMatrixChunk().then(() => { if (!cancelled) setChunkReady(true); }, () => undefined);
    return () => { cancelled = true; };
  }, [allowed]);
  const paidData = matchups.state.data ?? matchups.shown;
  // Once the subscriber's matrix is up it stays: a format switch empties `data` for a moment, and falling back
  // to the open layer would unmount the matrix and lose its selection.
  const [paidShown, setPaidShown] = useState(false);
  const paidReady = allowed && chunkReady && (paidData !== null || paidShown);
  useEffect(() => { if (paidReady) setPaidShown(true); }, [paidReady]);
  const [updatedAtLabel, setUpdatedAtLabel] = useState('Нет данных');
  const updatedAt = paidReady ? paidData?.updatedAt : initial?.updatedAt;
  useEffect(() => {
    setUpdatedAtLabel(updatedAt
      ? new Date(updatedAt).toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
      : 'Нет данных');
  }, [updatedAt]);

  return <PublicPageShell activeTab="standard-matchups" pathname={format === 'wild' ? '/standard/matchups/wild/' : '/standard/matchups/'} parchmentPreload="tablet-up"
    access={access} navigate={navigate} updatedAtLabel={updatedAtLabel} wide>
    {paidReady
      ? <StandardMatchupsPage external={{ format: matchups.format, changeFormat,
        slice: matchups.slice, changeSlice: matchups.changeSlice,
        data: paidData, loading: matchups.loading, error: matchups.error,
        retry: matchups.retry }} />
      : <StandardMatchupsOpen initial={initial} format={format} paywall={{ authUser: access.user, subscriptionStatus: access.subscription,
        subscriptionLoading: access.checking, onRefreshSubscription: access.refresh }} />}
  </PublicPageShell>;
}

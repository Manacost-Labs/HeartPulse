'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import StandardMatchupsPage from '@/src/features/StandardMatchups';
import { StandardMatchupsOpen } from '@/src/features/StandardMatchupsOpen';
import { useStandardMatchups, type PublicStandardMatchups } from '@/src/modules/standardMatchups/public';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { useLazyChunk } from './useLazyChunk';
import { navigate } from './navigation';

/** The browser fetches the matrix chunk while the subscriber's data loads, so the swap needs no wait. */
const loadMatrixChunk = () => import('@/src/features/StandardMatchupMatrix');

/**
 * `initial` is the open slice the server printed (`null`: it had no snapshot, the page says so and the
 * browser asks again). A subscriber's matrix replaces it only once its data and its chunk are both here.
 */
export function StandardMatchupsPageClient({ initial }: { initial: PublicStandardMatchups | null }) {
  const access = usePublicAccess();
  const { allowed } = paidAccess(access, 'standard');
  const matchups = useStandardMatchups(access.user?.id, allowed, { syncUrl: true });
  const chunk = useLazyChunk(allowed, loadMatrixChunk);
  const paidData = matchups.state.data ?? matchups.shown;
  // Once the subscriber's matrix is up it stays: a format switch empties `data` for a moment, and falling back
  // to the open layer would unmount the matrix and lose its selection.
  const [paidShown, setPaidShown] = useState(false);
  const paidReady = allowed && chunk.ready && (paidData !== null || paidShown);
  useEffect(() => { if (paidReady) setPaidShown(true); }, [paidReady]);
  // A subscriber never waits silently: when the matrix cannot arrive (its data failed or was refused, or its
  // chunk did not load) the open view says so, with a way to try again.
  const failed = allowed && !paidReady && (matchups.error || chunk.failed);
  const retryPaid = () => { matchups.retry(); chunk.retry(); };
  const [updatedAtLabel, setUpdatedAtLabel] = useState('Нет данных');
  const updatedAt = paidReady ? paidData?.updatedAt : initial?.updatedAt;
  useEffect(() => {
    setUpdatedAtLabel(updatedAt
      ? new Date(updatedAt).toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
      : 'Нет данных');
  }, [updatedAt]);

  return <PublicPageShell activeTab="standard-matchups" pathname="/standard/matchups/" parchmentPreload="tablet-up"
    access={access} navigate={navigate} updatedAtLabel={updatedAtLabel} wide>
    {paidReady
      ? <StandardMatchupsPage external={{ format: matchups.format, changeFormat: matchups.changeFormat,
        slice: matchups.slice, changeSlice: matchups.changeSlice,
        data: paidData, loading: matchups.loading, error: matchups.error,
        retry: matchups.retry }} />
      : <>
        {failed ? <div className="standard-matchups__error flex flex-wrap items-center gap-2 text-sm" role="alert"
          data-matchups-swap-error="">
          <AlertTriangle size={15} aria-hidden="true" />
          <span>Не удалось загрузить вашу матрицу матчапов: пока показан общий срез.</span>
          <button type="button" onClick={retryPaid}>Повторить</button>
        </div> : null}
        <StandardMatchupsOpen initial={initial} paywall={{ authUser: access.user, subscriptionStatus: access.subscription,
        subscriptionLoading: access.checking, onRefreshSubscription: access.refresh }} />
      </>}
  </PublicPageShell>;
}

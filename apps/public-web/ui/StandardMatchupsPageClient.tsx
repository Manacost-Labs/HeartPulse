'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import StandardMatchupsPage from '@/src/features/StandardMatchups';
import { setPageFormat, usePageFormat } from '@/src/shared/navigation/pageFormat';
import {
  openStandardMatchupsData, useOpenStandardMatchups, useStandardMatchups, type PublicStandardMatchups,
  type StandardMatchupsFormat,
} from '@/src/modules/standardMatchups/public';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { PaidOfferProvider } from './PaidOffer';
import { navigate } from './navigation';

const OFFER_TITLE = 'Ранги, периоды и порог игр — в подписке';
const OFFER_TEXT = 'Общий срез по всем рангам открыт всем. Тариф «Алмаз» открывает матчапы по отдельным рангам, периоды патчей и порог игр в паре.';
const noSubscribe = () => () => undefined;

/**
 * The matchup page is the subscriber's component for everyone. A guest and a robot get it on the open general
 * slice (`initial`, printed by the server; `null`: no snapshot, the page says so and the browser asks again) with
 * the HSGuru filters as locks; a subscriber's slice replaces the open data inside the same component, so nothing is
 * remounted. Until the browser has run, the content is inert: the server's markup has no live control to land on.
 */
export function StandardMatchupsPageClient({ initial }: { initial: PublicStandardMatchups | null }) {
  const access = usePublicAccess();
  const { allowed, pending } = paidAccess(access, 'standard');
  const matchups = useStandardMatchups(access.user?.id, allowed, { syncUrl: true });
  const pageFormat = usePageFormat() ?? 'standard';
  const format: StandardMatchupsFormat = allowed ? matchups.format : pageFormat;
  const open = useOpenStandardMatchups(initial, format);
  const openData = useMemo(() => open.data ? openStandardMatchupsData(open.data) : null, [open.data]);
  const paidData = matchups.state.data ?? matchups.shown;
  const paidUsable = allowed && paidData !== null && paidData.format === format;
  const target = paidUsable ? paidData : openData;
  // The page is prerendered as Standard: a reader who asks for Wild (or switches to it) keeps the matrix on screen, in
  // its own format, until the other format's data is here, then it is replaced in place. No skeleton, no shift. A
  // format that could not be loaded is never covered by the other one's numbers.
  const held = useRef<typeof target>(null);
  if (target) held.current = target;
  const failed = allowed ? matchups.error && !paidUsable : open.failed;
  const data = target ?? (failed ? null : held.current);
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  const [updatedAtLabel, setUpdatedAtLabel] = useState('Нет данных');
  const updatedAt = data?.updatedAt;
  useEffect(() => {
    setUpdatedAtLabel(updatedAt
      ? new Date(updatedAt).toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
      : 'Нет данных');
  }, [updatedAt]);

  const external = {
    format: data?.format ?? format,
    changeFormat: allowed ? matchups.changeFormat : (next: StandardMatchupsFormat) => setPageFormat(next),
    slice: allowed ? matchups.slice : undefined,
    changeSlice: allowed ? matchups.changeSlice : undefined,
    data,
    // The rest of the open slice arriving behind the printed part is not a reload: only an empty page is loading.
    loading: allowed ? matchups.loading : data === null && !failed,
    // A subscriber whose own data failed keeps the open slice on screen with the message and its retry.
    error: failed,
    retry: allowed ? () => { matchups.retry(); open.retry(); } : open.retry,
    locks: access.user && (pending || access.checking) ? 'pending' as const : 'locked' as const,
  };
  return <PublicPageShell activeTab="standard-matchups" pathname="/standard/matchups/" parchmentPreload="tablet-up"
    access={access} navigate={navigate} updatedAtLabel={updatedAtLabel} wide>
    <PaidOfferProvider title={OFFER_TITLE} text={OFFER_TEXT} entitlement="standard">
      <div inert={!hydrated || undefined}><StandardMatchupsPage external={external} /></div>
    </PaidOfferProvider>
  </PublicPageShell>;
}

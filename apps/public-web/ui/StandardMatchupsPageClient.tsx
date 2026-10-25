'use client';

import { useEffect, useState } from 'react';
import PaywallGate from '@/src/components/PaywallGate';
import PaywallPending from '@/src/components/PaywallPending';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import StandardMatchupsPage from '@/src/features/StandardMatchups';
import { useStandardMatchups } from '@/src/modules/standardMatchups/public';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

export function StandardMatchupsPageClient() {
  const access = usePublicAccess();
  const { allowed, pending } = paidAccess(access, 'standard');
  const matchups = useStandardMatchups(access.user?.id, allowed, { syncUrl: true });
  const [updatedAtLabel, setUpdatedAtLabel] = useState('Нет данных');
  useEffect(() => {
    const updatedAt = matchups.state.data?.updatedAt;
    setUpdatedAtLabel(updatedAt
      ? new Date(updatedAt).toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
      : 'Нет данных');
  }, [matchups.state.data?.updatedAt]);

  return <PublicPageShell activeTab="standard-matchups" pathname="/standard/matchups/" parchmentPreload="tablet-up"
    access={access} navigate={navigate} updatedAtLabel={updatedAtLabel} wide>
    {allowed
      ? <StandardMatchupsPage external={{ format: matchups.format, changeFormat: matchups.changeFormat,
        slice: matchups.slice, changeSlice: matchups.changeSlice,
        data: matchups.state.data ?? matchups.shown, loading: matchups.loading, error: matchups.error,
        retry: matchups.retry }} />
      : <section className="standard-matchups space-y-5 sm:space-y-6">
        <header className="traditional-mode-banner">
          <div className="traditional-mode-banner__copy">
            <h1>Матчапы</h1>
            <p>Сравнение силы актуальных архетипов против каждого соперника.</p>
          </div>
        </header>
        {pending
          ? <PaywallPending>Проверяем доступ к матчапам…</PaywallPending>
          : <PaywallGate active
            title="Подтвердите подписку Манакоста для доступа к матчапам"
            variant="standard" headingLevel="h2" authUser={access.user} subscriptionStatus={access.subscription}
            subscriptionLoading={access.checking} onRefreshSubscription={access.refresh} />}
      </section>}
  </PublicPageShell>;
}

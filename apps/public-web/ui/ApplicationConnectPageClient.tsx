'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

function ConnectLoading() {
  return <section className="application-connect__loading" aria-busy="true">
    <h1>Подключить Manacost Tracker</h1>
    <p>Загружаем безопасное подтверждение подключения…</p>
  </section>;
}

// The existing account route reads the browser URL and sessionStorage during
// its first render; keep it behind a client-only boundary without serializing
// the device code or identity into shared HTML.
const AccountRoute = dynamic(() => import('@/src/modules/accountRoute/public'), {
  ssr: false,
  loading: ConnectLoading,
});

export function ApplicationConnectPageClient() {
  const access = usePublicAccess();
  return <PublicPageShell activeTab="home" pathname="/connect/" account access={access} navigate={navigate}>
    <Suspense fallback={<ConnectLoading />}>
      <AccountRoute connect profileId={null} user={access.user} checking={access.checking}
        onChange={access.onAuthChange} />
    </Suspense>
  </PublicPageShell>;
}

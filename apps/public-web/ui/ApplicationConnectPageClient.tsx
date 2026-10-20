'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { ApplicationConnectSkeleton } from '@/src/modules/applicationConnect/ApplicationConnectSkeleton';
// The sign-in card's skeleton stands in inside the lazy connect view (`?login`).
import { usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

// The connect view's first state, fitted from its own classes. Imported from
// the file rather than the module's public entry, which is the lazy page.
function ConnectLoading() {
  return <ApplicationConnectSkeleton />;
}

// The existing account route reads the browser URL and sessionStorage during
// its first render; keep it behind a client-only boundary without serializing
// the device code or identity into shared HTML.
// The sign-in fallback inside the connect page needs the login skeleton's
// geometry; it loads with the page's chunk instead of the route's first paint.
const AccountRoute = dynamic(() => Promise.all([
  import('@/src/modules/accountRoute/public'),
  import('@/src/modules/identity/ui/LoginCardSkeleton.css'),
]).then(([route]) => route), {
  ssr: false,
  loading: ConnectLoading,
});

export function ApplicationConnectPageClient() {
  const access = usePublicAccess();
  return <PublicPageShell activeTab="home" pathname="/connect/" account access={access} navigate={navigate}>
    <div style={{ minHeight: '100svh' }}>
    <Suspense fallback={<ConnectLoading />}>
      <AccountRoute connect profileId={null} user={access.user} checking={access.checking}
        onChange={access.onAuthChange} />
    </Suspense>
    </div>
  </PublicPageShell>;
}

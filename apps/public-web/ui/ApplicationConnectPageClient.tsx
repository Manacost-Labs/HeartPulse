'use client';

import dynamic from 'next/dynamic';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { ApplicationConnectSkeleton } from '@/src/modules/applicationConnect/ApplicationConnectSkeleton';
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
// A plain import() keeps Next's client-only bailout (one loading fallback in
// the server HTML); the wrapper module brings the sign-in skeleton's CSS.
const AccountRoute = dynamic(() => import('./connectAccountRoute'), {
  ssr: false,
  loading: ConnectLoading,
});

export function ApplicationConnectPageClient() {
  const access = usePublicAccess();
  return <PublicPageShell activeTab="home" pathname="/connect/" account access={access} navigate={navigate}>
    {/* No Suspense of its own: dynamic() already shows ConnectLoading. A second
        boundary around the large skeleton made the streamed HTML carry both. */}
    <div style={{ minHeight: '100svh' }}>
      <AccountRoute connect user={access.user} checking={access.checking || access.provisional}
        onChange={access.onAuthChange} />
    </div>
  </PublicPageShell>;
}

import React, { useEffect, useState } from 'react';
import AccountRoute from '../accountRoute/public';
import { pendingReaderInteraction, readerAuthContinuation } from './continuation';
import { fetchReaderSignInSite, type ReaderSignInSite } from './signInSite';

/** Reader continuation belongs to the existing lazy account surface, never the public-page bootstrap. */
export default function ReaderAccountRoute(props: React.ComponentProps<typeof AccountRoute>) {
  const search = typeof window === 'undefined' ? '' : window.location.search;
  const hash = typeof window === 'undefined' ? '' : window.location.hash;
  const [signInFor, setSignInFor] = useState<ReaderSignInSite | null>(null);
  const guest = !props.connect && !props.user && !props.checking;
  useEffect(() => {
    if (props.connect) return;
    const next = readerAuthContinuation(search, () => window.sessionStorage, Boolean(props.user), Date.now(), hash);
    // The browser-only handle must not linger in copied URLs or later navigation.
    if (hash.startsWith('#reader_interaction=')) window.history.replaceState(window.history.state, '', `${window.location.pathname}${search}`);
    if (next) window.location.replace(next);
  }, [search, hash, props.user, props.connect]);
  useEffect(() => {
    // Declared after the capture above, so a fragment handle is already in session storage here.
    const uid = guest ? pendingReaderInteraction(() => window.sessionStorage) : null;
    if (!uid) { setSignInFor(null); return undefined; }
    const abort = new AbortController();
    void fetchReaderSignInSite(uid, abort.signal).then(site => { if (!abort.signal.aborted) setSignInFor(site); });
    return () => abort.abort();
  }, [guest]);
  return <AccountRoute {...props} signInFor={signInFor ?? undefined} />;
}

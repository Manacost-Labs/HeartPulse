import React, { useEffect, useMemo, useState } from 'react';
import AccountRoute from '../accountRoute/public';
import { incomingReaderInteraction, readerAuthContinuation } from './continuation';
import { fetchReaderSignInSite, type ReaderSignInSite } from './signInSite';

type Lookup = { uid: string; site: ReaderSignInSite | null };

/** Reader continuation belongs to the existing lazy account surface, never the public-page bootstrap. */
export default function ReaderAccountRoute(props: React.ComponentProps<typeof AccountRoute>) {
  const search = typeof window === 'undefined' ? '' : window.location.search;
  const hash = typeof window === 'undefined' ? '' : window.location.hash;
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const guest = !props.connect && !props.user && !props.checking;
  useEffect(() => {
    if (props.connect) return;
    const next = readerAuthContinuation(search, () => window.sessionStorage, Boolean(props.user), Date.now(), hash);
    // The browser-only handle must not linger in copied URLs or later navigation.
    if (hash.startsWith('#reader_interaction=')) window.history.replaceState(window.history.state, '', `${window.location.pathname}${search}`);
    if (next) window.location.replace(next);
  }, [search, hash, props.user, props.connect]);
  // Known while rendering, before the fragment is captured, so the card holds the place for the site from its first frame.
  const uid = useMemo(() => (guest ? incomingReaderInteraction(search, hash, () => window.sessionStorage) : null), [guest, search, hash]);
  useEffect(() => {
    if (!uid) return undefined;
    const abort = new AbortController();
    void fetchReaderSignInSite(uid, abort.signal).then(site => { if (!abort.signal.aborted) setLookup({ uid, site }); });
    return () => abort.abort();
  }, [uid]);
  // Until the server answers, and if it never names a site, the neutral words stay: the card does not change height.
  const signInFor = uid ? (lookup?.uid === uid && lookup.site) || 'unnamed' : undefined;
  return <AccountRoute {...props} signInFor={signInFor} />;
}

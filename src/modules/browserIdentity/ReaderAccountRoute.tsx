import React, { useEffect } from 'react';
import AccountRoute from '../accountRoute/public';
import { readerAuthContinuation } from './continuation';

/** Reader continuation belongs to the existing lazy account surface, never the public-page bootstrap. */
export default function ReaderAccountRoute(props: React.ComponentProps<typeof AccountRoute>) {
  const search = typeof window === 'undefined' ? '' : window.location.search;
  const hash = typeof window === 'undefined' ? '' : window.location.hash;
  useEffect(() => {
    if (props.connect || props.profileId) return;
    const next = readerAuthContinuation(search, () => window.sessionStorage, Boolean(props.user), Date.now(), hash);
    // The browser-only handle must not linger in copied URLs or later navigation.
    if (hash.startsWith('#reader_interaction=')) window.history.replaceState(window.history.state, '', `${window.location.pathname}${search}`);
    if (next) window.location.replace(next);
  }, [search, hash, props.user, props.connect, props.profileId]);
  return <AccountRoute {...props} />;
}

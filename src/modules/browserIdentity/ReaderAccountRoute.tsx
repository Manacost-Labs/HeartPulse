import React, { useEffect } from 'react';
import AccountRoute from '../accountRoute/public';
import { readerAuthContinuation } from './continuation';

/** Reader continuation belongs to the existing lazy account surface, never the public-page bootstrap. */
export default function ReaderAccountRoute(props: React.ComponentProps<typeof AccountRoute>) {
  const search = typeof window === 'undefined' ? '' : window.location.search;
  useEffect(() => {
    if (props.connect || props.profileId) return;
    const next = readerAuthContinuation(search, () => window.sessionStorage, Boolean(props.user));
    if (next) window.location.replace(next);
  }, [search, props.user, props.connect, props.profileId]);
  return <AccountRoute {...props} />;
}

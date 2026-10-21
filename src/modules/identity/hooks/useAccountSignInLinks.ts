import { useEffect, useState } from 'react';
import { fetchLinkedSignInProviders } from '../api/privateAccountApi';
import { accountLinkReturn } from '../model/accountDashboard';

/**
 * The signed-in account's linked sign-in providers (null until known), and the
 * one message a provider's link flow returned with. The return marker leaves
 * the address so a reload does not repeat the message. `onMessage` should be
 * stable, such as a state setter.
 */
export function useAccountSignInLinks(
  accountId: string,
  onMessage: (message: { type: 'ok' | 'err'; text: string }) => void,
): ReadonlySet<string> | null {
  const [linkedProviders, setLinkedProviders] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!accountId) return undefined;
    const controller = new AbortController();
    void fetchLinkedSignInProviders(controller.signal).then(providers => {
      if (!controller.signal.aborted) setLinkedProviders(providers);
    });
    return () => controller.abort();
  }, [accountId]);
  useEffect(() => {
    if (!accountId) return;
    const linkReturn = accountLinkReturn(window.location.search);
    if (!linkReturn) return;
    onMessage({ type: linkReturn.type, text: linkReturn.text });
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${linkReturn.search}${window.location.hash}`);
  }, [accountId, onMessage]);
  return linkedProviders;
}

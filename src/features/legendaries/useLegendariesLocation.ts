import { useCallback, useEffect, useState } from 'react';

type Location = { activeClass: string; groupId: string | null };

/**
 * The chosen class and group live in the address (`?class=mage&group=<cardId>`),
 * so a link, a reload or a return from the payment page lands on the same group.
 * The first render is the default (server HTML); the address is read after it.
 */
export function useLegendariesLocation(classIds: readonly string[]) {
  const [location, setLocation] = useState<Location>({ activeClass: 'all', groupId: null });
  /** The group the address named when the page opened: the one to scroll to, once. */
  const [addressGroup, setAddressGroup] = useState<string | null>(null);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const requested = query.get('class');
    const activeClass = requested && classIds.includes(requested) ? requested : 'all';
    const group = query.get('group');
    const groupId = group && /^[\w.-]{1,64}$/.test(group) ? group : null;
    setLocation({ activeClass, groupId });
    setAddressGroup(groupId);
  }, [classIds]);
  const write = useCallback((next: Location) => {
    setLocation(next);
    try {
      const url = new URL(window.location.href);
      if (next.activeClass === 'all') url.searchParams.delete('class'); else url.searchParams.set('class', next.activeClass);
      if (next.groupId) url.searchParams.set('group', next.groupId); else url.searchParams.delete('group');
      window.history.replaceState(window.history.state, '', url);
    } catch { /* The address is a convenience; the state above still holds. */ }
  }, []);
  const setActiveClass = useCallback((activeClass: string) => write({ activeClass, groupId: null }), [write]);
  const selectGroup = useCallback((groupId: string | null) => write({ ...location, groupId }), [write, location]);
  return { activeClass: location.activeClass, groupId: location.groupId, addressGroup, setActiveClass, selectGroup };
}

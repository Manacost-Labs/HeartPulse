'use client';

import { useEffect, useState } from 'react';

/**
 * Whether the subscriber's own (protected) data is reachable: the open list on a page stays until this is true,
 * so a failed protected read never replaces it with the paid view's error. Idle (false) while `enabled` is false.
 */
export function useProtectedRead(url: string, enabled: boolean): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (!enabled) { setOk(false); return undefined; }
    let current = true;
    fetch(url, { credentials: 'same-origin' })
      .then(response => { if (current) setOk(response.ok); void response.body?.cancel(); })
      .catch(() => { if (current) setOk(false); });
    return () => { current = false; };
  }, [url, enabled]);
  return ok;
}

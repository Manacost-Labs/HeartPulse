import { createContext, useContext } from 'react';

/**
 * The opener of the subscription offer. `PaidOfferProvider` (apps/public-web/ui/PaidOffer.tsx) provides
 * it; the locks of `PaidLocks.tsx` and `PaidLockButton` read it. It lives here, so code in `src/features`
 * can use the offer without importing from `apps/`.
 */
export const OfferContext = createContext<(() => void) | null>(null);

/** The opener of the nearest `PaidOfferProvider`, or `null` without one. */
export function usePaidOffer(): (() => void) | null {
  return useContext(OfferContext);
}

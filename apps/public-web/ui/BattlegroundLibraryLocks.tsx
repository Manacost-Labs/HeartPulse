'use client';

import { useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import PaywallGate, { type PaywallAccessState } from '@/src/components/PaywallGate';
import './BattlegroundLibraryPublic.css';

/**
 * The closed part of the library for a guest: filters and comparison of the listings, the per-round strength,
 * purchases, board positions and the history of a card. A button without data; a press opens the subscription offer.
 */
export function BattlegroundLibraryLocks({ label, offer: offerTitle, ...access }: PaywallAccessState & { label: string; offer: string }) {
  const [offer, setOffer] = useState(false);
  return <div className="bg-library-locks">
    <button type="button" aria-expanded={offer} onClick={() => setOffer(true)}>
      <LockKeyhole aria-hidden="true" size={16} />{label}<span className="sr-only"> — по подписке</span>
    </button>
    {offer ? <PaywallGate active presentation="inline" headingLevel="h2" title={offerTitle} {...access} /> : null}
  </div>;
}

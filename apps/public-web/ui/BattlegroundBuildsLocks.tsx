'use client';

import { useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import PaywallGate, { type PaywallAccessState } from '@/src/components/PaywallGate';

/**
 * The closed part under the open builds: narrow rating ranges, fork analysis and
 * trinkets by range. It carries no data; a press opens the subscription offer.
 */
export function BattlegroundBuildsLocks({ note, title, ...access }: PaywallAccessState & { note: string; title: string }) {
  const [offer, setOffer] = useState(false);
  return <div className="bg-builds-locks">
    <p>{note}</p>
    <button type="button" aria-expanded={offer} onClick={() => setOffer(true)}>
      <LockKeyhole aria-hidden="true" size={16} />Подробнее по подписке
    </button>
    {offer ? <PaywallGate active presentation="inline" headingLevel="h2" title={title} {...access} /> : null}
  </div>;
}

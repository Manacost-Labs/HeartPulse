'use client';

import { useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import PaywallGate, { type PaywallAccessState } from '@/src/components/PaywallGate';

/**
 * The closed part of `/heroes/<id>/` for a guest: narrower rating ranges, the full distribution of places,
 * builds with metrics and the change between patches. A button without data; a press opens the subscription offer.
 */
export function BattlegroundHeroPaidLocks(access: PaywallAccessState) {
  const [offer, setOffer] = useState(false);
  return <div>
    <p className="bg-hero-locks">
      <button type="button" aria-expanded={offer} onClick={() => setOffer(true)}>
        <LockKeyhole aria-hidden="true" size={16} />Диапазоны Топ 20%, 5%, 1%, места и динамика
        <span className="sr-only"> — по подписке</span>
      </button>
    </p>
    {offer ? <PaywallGate active presentation="inline" headingLevel="h2"
      title="Статистика героя по узким диапазонам, распределение мест и динамика доступны подписчикам" {...access} /> : null}
  </div>;
}

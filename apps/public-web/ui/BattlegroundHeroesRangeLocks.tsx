'use client';

import { useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import PaywallGate, { type PaywallAccessState } from '@/src/components/PaywallGate';

const LOCKED_RANGES = ['Топ 20%', 'Топ 5%', 'Топ 1%'];

/**
 * The closed part of `/heroes/` for a guest: the narrower rating ranges, shown
 * as locked buttons. They carry no data; a press opens the subscription offer.
 */
export function BattlegroundHeroesRangeLocks(access: PaywallAccessState) {
  const [offer, setOffer] = useState(false);
  return <div className="bg-heroes-locks">
    <div className="bg-heroes-locks__ranges" role="group" aria-label="Рейтинговые диапазоны">
      <strong aria-current="true">Топ 50%</strong>
      {LOCKED_RANGES.map(label => <button key={label} type="button" aria-expanded={offer} onClick={() => setOffer(true)}>
        <LockKeyhole aria-hidden="true" size={16} />{label}<span className="sr-only"> — по подписке</span>
      </button>)}
    </div>
    <p>Сравнение рейтинговых диапазонов и динамика между патчами — по подписке.</p>
    {offer ? <PaywallGate active presentation="inline" headingLevel="h2"
      title="Узкие диапазоны рейтинга и динамика между патчами доступны подписчикам" {...access} /> : null}
  </div>;
}

import { useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import PaywallGate, { type PaywallAccessState } from '../components/PaywallGate';

/**
 * The closed part of an archetype page for everyone without access: the
 * sections a subscriber has, shown as locks. They carry no data; the page's
 * JSON-LD names them (`hasPart.cssSelector`). A press opens the offer.
 * The styles are `apps/public-web/ui/OpenDeckList.css`, loaded with the open
 * builds the block always comes with, so the catalog page does not carry them.
 */
export function ArchetypePaidLocks({ paywall }: { paywall: PaywallAccessState }) {
  const [offer, setOffer] = useState(false);
  return <div className="paywalled-archetype archetype-paid-locks">
    <section className="paywalled-archetype-analysis" aria-labelledby="archetype-lock-analysis">
      <h2 id="archetype-lock-analysis"><LockKeyhole aria-hidden="true" size={16} /> Матчапы и муллиган</h2>
      <p>Винрейт против каждого класса и влияние карт в муллигане и доборе. Доступно по подписке.</p>
    </section>
    <section className="paywalled-archetype-history" aria-labelledby="archetype-lock-history">
      <h2 id="archetype-lock-history"><LockKeyhole aria-hidden="true" size={16} /> История и ранги</h2>
      <p>Срезы по дням и винрейт по рангам. Доступно по подписке.</p>
    </section>
    <button type="button" className="archetype-copy-button archetype-paid-locks__offer" aria-expanded={offer} onClick={() => setOffer(true)}>
      Открыть доступ
    </button>
    {offer ? <PaywallGate active presentation="inline" surface="archetype" variant="standard"
      title="Матчапы, муллиган и история архетипа" {...paywall} /> : null}
  </div>;
}

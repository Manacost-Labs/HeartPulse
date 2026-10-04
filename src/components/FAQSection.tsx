import { useId, useState } from 'react';
import { FAQ_ITEMS } from '../content/faq';
import './FAQSection.css';

export default function FAQSection() {
  const panelBaseId = useId();
  const headingId = 'faq-heading';
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section id="faq" aria-labelledby={headingId} className="faq-section">
      <h2 id={headingId} className="faq-section__heading">Частые вопросы</h2>
      <div className="faq-section__list">
        {FAQ_ITEMS.map((item, index) => {
          const expanded = open === index;
          const panelId = `${panelBaseId}-panel-${index}`;
          return (
            <div key={item.q} className="faq-card">
              <button
                type="button"
                className="faq-card__trigger"
                onClick={() => setOpen(expanded ? null : index)}
                aria-expanded={expanded}
                aria-controls={panelId}
              >
                <span className="faq-card__question">{item.q}</span>
                <span aria-hidden="true" className="faq-card__icon">{expanded ? '−' : '+'}</span>
              </button>
              <div id={panelId} className="faq-card__panel" hidden={!expanded}>
                <p className="faq-card__answer">{item.a}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

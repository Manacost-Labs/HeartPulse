import type { ReactNode } from 'react';
import { Info } from 'lucide-react';

export const NO_DATA = 'нет данных';

export function Section({ id, title, lead, children }: { id: string; title: string; lead?: ReactNode; children: ReactNode }) {
  return <section className="sa-section" aria-labelledby={`sa-${id}-title`} data-section={id}>
    <header className="sa-section__head">
      <h3 id={`sa-${id}-title`}>{title}</h3>
      {lead && <p>{lead}</p>}
    </header>
    {children}
  </section>;
}

export function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'up' | 'down' }) {
  return <li className="sa-stat">
    <span className="sa-stat__label">{label}</span>
    <strong className="sa-stat__value" data-tone={tone} data-empty={value === NO_DATA || undefined}>{value}</strong>
    {hint && <small className="sa-stat__hint">{hint}</small>}
  </li>;
}

export const Chip = ({ tone, children }: { tone: 'warn' | 'ok' | 'muted'; children: ReactNode }) => <span className="sa-chip" data-tone={tone}>{children}</span>;

export function Callout({ tone = 'warn', children }: { tone?: 'warn' | 'info'; children: ReactNode }) {
  return <div className="sa-callout" data-tone={tone}><Info size={16} aria-hidden="true" /><div>{children}</div></div>;
}

/* Стоимость базы по ценам тарифов: начало против конца периода. */

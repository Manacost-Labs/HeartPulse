import { useEffect, useState } from 'react';
import { Check, History, Link2 } from 'lucide-react';
import type { PatchCardView } from '../../modules/patchNotes/public';

/* Ways out of one change card: a link to it and the earlier patches that changed the same card. */

/** Copies `…/standard/patches/?version=…#card-…` and marks the card as the page target. */
export function CopyLinkButton({ card }: { card: PatchCardView }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const copy = async () => {
    const url = new URL(window.location.href);
    url.hash = card.anchor;
    // replaceState keeps the history clean; the hashchange-free update still moves :target styling on the next paint.
    window.history.replaceState(window.history.state, '', url);
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
    } catch {
      window.location.hash = card.anchor;
    }
  };
  return (
    <button type="button" className="hp-patch-card__copy" onClick={() => void copy()}
      aria-label={copied ? 'Ссылка скопирована' : `Скопировать ссылку на изменение «${card.name}»`}>
      {copied ? <Check aria-hidden="true" /> : <Link2 aria-hidden="true" />}
      {copied ? 'Скопировано' : 'Ссылка'}
    </button>
  );
}

const versionDates = new Intl.DateTimeFormat('ru-RU', { month: 'short', year: 'numeric', timeZone: 'Europe/Moscow' });

/** Earlier patches of the archive that changed this card, newest first. */
export function CardHistory({ card }: { card: PatchCardView }) {
  if (!card.history.length) return null;
  return (
    <p className="hp-patch-card__history">
      <History aria-hidden="true" />
      <span>Менялась в патчах</span>
      {card.history.map((item, index) => (
        <span key={item.version}>
          <a href={item.href} title={item.publishedAt ? versionDates.format(new Date(item.publishedAt)) : undefined}>{item.version}</a>
          {index < card.history.length - 1 && ','}
        </span>
      ))}
    </p>
  );
}

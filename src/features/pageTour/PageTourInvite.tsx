import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Compass, X } from 'lucide-react';
import { writeAutoTourOptOut, writeTourInviteDeclined } from './pageTourAutoStart';
import './PageTourInvite.css';

/** An untouched offer leaves by itself; the page stays eligible for a later visit. */
const AUTO_HIDE_MS = 20_000;
/** Matches the exit animation in PageTourInvite.css (`--motion-base`). */
const EXIT_MS = 220;

/**
 * The first-visit offer of a page tour: a small non-modal card in the corner
 * that never takes focus, blocks the page or moves the layout. It portals to
 * <body> so a transformed or clipped header cannot trap its fixed position.
 */
export default function PageTourInvite({ storageKey, onAccept, onDismiss }: {
  storageKey: string; onAccept: () => void; onDismiss: () => void;
}) {
  const titleId = useId();
  const [closing, setClosing] = useState(false);
  const [held, setHeld] = useState(false);
  // The body is read after mount, never during render, so the module stays server-safe.
  const [host, setHost] = useState<HTMLElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => { setHost(document.body); }, []);

  const leave = (after: () => void) => {
    if (closing) return;
    setClosing(true);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(after, reduced ? 0 : EXIT_MS);
  };

  // Hovering or focusing the card holds it open while the visitor decides.
  useEffect(() => {
    if (held || closing) return undefined;
    const timer = window.setTimeout(() => leave(onDismiss), AUTO_HIDE_MS);
    return () => window.clearTimeout(timer);
  });

  const decline = () => {
    writeTourInviteDeclined(storageKey);
    leave(onDismiss);
  };

  if (!host) return null;
  return createPortal(
    <aside
      ref={rootRef}
      className="page-tour-invite"
      data-state={closing ? 'closed' : 'open'}
      aria-labelledby={titleId}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={event => { if (!rootRef.current?.contains(event.relatedTarget as Node | null)) setHeld(false); }}
      onKeyDown={event => { if (event.key === 'Escape') decline(); }}
    >
      <Compass className="page-tour-invite__icon" size={22} aria-hidden="true" />
      <div className="page-tour-invite__text" aria-live="polite">
        <p id={titleId} className="page-tour-invite__title">Впервые на этой странице?</p>
        <p className="page-tour-invite__body">Покажем за минуту, где что находится.</p>
        <div className="page-tour-invite__actions">
          <button type="button" className="page-tour-invite__accept" onClick={() => leave(onAccept)}>Показать</button>
          <button type="button" className="page-tour-invite__later" onClick={decline}>Не сейчас</button>
          <button
            type="button"
            className="page-tour-invite__never"
            onClick={() => {
              writeAutoTourOptOut();
              decline();
            }}
          >
            Больше не предлагать
          </button>
        </div>
      </div>
      <button type="button" className="page-tour-invite__close" aria-label="Закрыть предложение тура" onClick={decline}>
        <X size={16} aria-hidden="true" />
      </button>
    </aside>,
    host,
  );
}

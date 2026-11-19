import { lazy, Suspense, useCallback, useEffect, useState, type FocusEvent, type MouseEvent } from 'react';
import type { CardPreviewTarget } from '../CardPreviewTooltip';
import './FunDeckCardPreview.css';

// The tooltip and its image loader are fetched on the first hover or focus,
// not with the route.
const CardPreviewTooltip = lazy(() => import('../CardPreviewTooltip'));

const POINTER = '(hover: hover) and (pointer: fine)';
const CARD = '[data-fun-card]';

function previewOf(element: Element): CardPreviewTarget | null {
  const { funCard, funCardName, funCardImage } = (element as HTMLElement).dataset;
  if (!funCard) return null;
  return { id: funCard, name: funCardName || funCard, imageUrl: funCardImage || null, rect: element.getBoundingClientRect() };
}

/**
 * One full-card preview for every tile and portrait of the page, by event
 * delegation: a mouse over a card or a keyboard focus on it opens it; leaving,
 * blur, Escape, scroll and resize close it. Touch devices get none: a tap on
 * a card opens its page.
 */
export function useFunDeckCardPreview() {
  const [preview, setPreview] = useState<(CardPreviewTarget & { source: Element; via: 'mouse' | 'focus' }) | null>(null);
  const close = useCallback(() => setPreview(null), []);

  const open = useCallback((element: Element, via: 'mouse' | 'focus') => {
    const target = previewOf(element);
    setPreview(current => (current?.source === element ? current : target && { ...target, source: element, via }));
  }, []);

  useEffect(() => {
    if (!preview) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    // A mouse preview closes on scroll. A keyboard focus scrolls the card into view on its own,
    // so that preview follows its card instead.
    const onScroll = () => {
      if (preview.via !== 'focus' || !preview.source.isConnected) return close();
      const rect = preview.source.getBoundingClientRect();
      setPreview(current => (current && current.source === preview.source ? { ...current, rect } : current));
      return undefined;
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [preview, close]);

  const listeners = {
    onMouseOver: (event: MouseEvent<HTMLElement>) => {
      const card = (event.target as Element).closest?.(CARD);
      if (card && window.matchMedia(POINTER).matches) open(card, 'mouse');
    },
    onMouseOut: (event: MouseEvent<HTMLElement>) => {
      const card = (event.target as Element).closest?.(CARD);
      if (card && !(event.relatedTarget instanceof Node && card.contains(event.relatedTarget))) close();
    },
    onFocus: (event: FocusEvent<HTMLElement>) => {
      const card = (event.target as Element).closest?.(CARD);
      if (card && card.matches(':focus-visible')) open(card, 'focus');
    },
    onBlur: (event: FocusEvent<HTMLElement>) => {
      if ((event.target as Element).closest?.(CARD)) close();
    },
  };
  const tooltip = preview ? (
    <Suspense fallback={null}>
      <CardPreviewTooltip preview={preview} bare keepOnScroll />
    </Suspense>
  ) : null;
  return { listeners, tooltip };
}

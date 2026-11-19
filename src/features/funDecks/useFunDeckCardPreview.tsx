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
  const [preview, setPreview] = useState<(CardPreviewTarget & { source: Element }) | null>(null);
  const close = useCallback(() => setPreview(null), []);

  const open = useCallback((element: Element) => {
    const target = previewOf(element);
    setPreview(current => (current?.source === element ? current : target && { ...target, source: element }));
  }, []);

  useEffect(() => {
    if (!preview) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [preview, close]);

  const listeners = {
    onMouseOver: (event: MouseEvent<HTMLElement>) => {
      const card = (event.target as Element).closest?.(CARD);
      if (card && window.matchMedia(POINTER).matches) open(card);
    },
    onMouseOut: (event: MouseEvent<HTMLElement>) => {
      const card = (event.target as Element).closest?.(CARD);
      if (card && !(event.relatedTarget instanceof Node && card.contains(event.relatedTarget))) close();
    },
    onFocus: (event: FocusEvent<HTMLElement>) => {
      const card = (event.target as Element).closest?.(CARD);
      if (card && card.matches(':focus-visible')) open(card);
    },
    onBlur: (event: FocusEvent<HTMLElement>) => {
      if ((event.target as Element).closest?.(CARD)) close();
    },
  };
  const tooltip = preview ? (
    <Suspense fallback={null}>
      <CardPreviewTooltip preview={preview} bare />
    </Suspense>
  ) : null;
  return { listeners, tooltip };
}

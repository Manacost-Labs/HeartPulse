import { useEffect, useState } from 'react';

/**
 * True once the element is within one screen (`window.innerHeight` px above
 * and below the viewport; `screens` changes the multiple), and from then on. `immediate` skips the wait, for the cards
 * that are in view on arrival. Without IntersectionObserver the answer is yes.
 * `ref` is a callback ref: when the card is drawn by another element (the deck view changes, the kept view replaces
 * the server tiles as the page hydrates), the wait moves to the new element and the old one is no longer watched.
 */
export function useNearScreen<T extends Element>(immediate = false, screens = 1) {
  const [element, ref] = useState<T | null>(null);
  const [near, setNear] = useState(immediate);
  useEffect(() => {
    if (near) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return undefined;
    }
    if (!element) return undefined;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setNear(true);
        observer.disconnect();
      }
    }, { rootMargin: `${Math.round(window.innerHeight * screens)}px 0px` });
    observer.observe(element);
    return () => observer.disconnect();
  }, [near, screens, element]);
  return { ref, near };
}

import { useEffect, useRef, useState } from 'react';

/**
 * True once the element is within one screen (`window.innerHeight` px above
 * and below the viewport; `screens` changes the multiple), and from then on. `immediate` skips the wait, for the cards
 * that are in view on arrival. Without IntersectionObserver the answer is yes.
 */
export function useNearScreen<T extends Element>(immediate = false, screens = 1) {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(immediate);
  useEffect(() => {
    if (near) return undefined;
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return undefined;
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setNear(true);
        observer.disconnect();
      }
    }, { rootMargin: `${Math.round(window.innerHeight * screens)}px 0px` });
    observer.observe(element);
    return () => observer.disconnect();
  }, [near, screens]);
  return { ref, near };
}

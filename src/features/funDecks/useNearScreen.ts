import { useEffect, useRef, useState } from 'react';

/**
 * True once the element is within `margin` of the viewport (about one screen
 * by default), and from then on. `immediate` skips the wait, for the cards
 * that are in view on arrival. Without IntersectionObserver the answer is yes.
 */
export function useNearScreen<T extends Element>(immediate = false, margin = '100% 0px') {
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
    }, { rootMargin: margin });
    observer.observe(element);
    return () => observer.disconnect();
  }, [near, margin]);
  return { ref, near };
}

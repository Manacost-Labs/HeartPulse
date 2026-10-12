import { useEffect, useRef, useState } from 'react';

export function usePlotWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => {
      const measured = Math.round(entries[0].contentRect.width);
      if (measured > 0) setWidth(Math.max(280, measured));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

import { type ReactNode, useEffect, useState } from 'react';

/** Applies a quiet visual handoff once a lazy route has committed. */
export function RouteContentReveal({ children }: { children: ReactNode }) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return <div className={`route-content-reveal${entered ? ' route-content-reveal--entered' : ''}`}>{children}</div>;
}

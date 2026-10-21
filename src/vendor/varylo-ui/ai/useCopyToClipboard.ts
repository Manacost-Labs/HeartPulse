'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type CopyState = 'idle' | 'copied' | 'error';

/** Copies text and reports the outcome for a while, so buttons can show "Copied" or "Copy failed". */
export function useCopyToClipboard(resetAfter = 2000) {
  const [state, setState] = useState<CopyState>('idle');
  const [error, setError] = useState<Error | null>(null);
  const timer = useRef<number>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = useCallback(
    async (text: string) => {
      window.clearTimeout(timer.current);
      try {
        if (!navigator.clipboard) throw new Error('Clipboard access is not available in this context');
        await navigator.clipboard.writeText(text);
        setError(null);
        setState('copied');
      } catch (cause) {
        setError(cause instanceof Error ? cause : new Error(String(cause)));
        setState('error');
      }
      timer.current = window.setTimeout(() => setState('idle'), resetAfter);
    },
    [resetAfter],
  );

  return { state, error, copy };
}

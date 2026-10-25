'use client';

import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';

type CopyState = 'idle' | 'copied' | 'failed';

/** Копирует код колоды; итог объявляется экранному диктору и гаснет через две секунды. */
export function CopyDeckCode({ code, label }: { code: string; label: string }) {
  const [state, setState] = useState<CopyState>('idle');

  useEffect(() => {
    if (state === 'idle') return undefined;
    const timer = window.setTimeout(() => setState('idle'), 2_000);
    return () => window.clearTimeout(timer);
  }, [state]);

  const copy = () => {
    if (!navigator.clipboard) {
      setState('failed');
      return;
    }
    void navigator.clipboard.writeText(code).then(() => setState('copied'), () => setState('failed'));
  };

  return <button type="button" className="streamers-copy" data-state={state} onClick={copy}
    aria-label={`Скопировать код колоды «${label}»`}>
    {state === 'copied' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
    <span aria-live="polite">{state === 'copied' ? 'Скопировано' : state === 'failed' ? 'Не вышло' : 'Код'}</span>
  </button>;
}

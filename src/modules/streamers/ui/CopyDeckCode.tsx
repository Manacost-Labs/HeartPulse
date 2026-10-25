'use client';

import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';

type CopyState = 'idle' | 'copied' | 'failed';

/** Тихая иконка: копирует код колоды; итог объявляется экранному диктору и гаснет через две секунды. */
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

  const status = state === 'copied' ? 'Скопировано' : state === 'failed' ? 'Не вышло' : '';
  return <span className="streamers-copy-wrap">
    <button type="button" className="streamers-copy" data-state={state} onClick={copy}
      aria-label={`Скопировать код колоды «${label}»`} title="Скопировать код колоды">
      {state === 'copied' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
    </button>
    <span className="streamers-copy__status" role="status">{status}</span>
  </span>;
}

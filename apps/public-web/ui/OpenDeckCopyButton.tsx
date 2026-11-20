'use client';

import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';

type CopyState = 'idle' | 'ok' | 'error';

async function writeText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // A browser may expose the Clipboard API and still refuse the write: use the selection fallback.
    }
  }
  const field = document.createElement('textarea');
  field.value = value;
  field.readOnly = true;
  field.setAttribute('aria-hidden', 'true');
  field.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(field);
  field.select();
  try {
    if (!document.execCommand('copy')) throw new Error('Clipboard write failed');
  } finally {
    field.remove();
  }
}

/**
 * «Скопировать код»: the one client island of an open deck list. The list
 * itself is server HTML; this only writes the deck code to the clipboard.
 */
export function OpenDeckCopyButton({ code, title }: { code: string; title: string }) {
  const [state, setState] = useState<CopyState>('idle');
  useEffect(() => {
    if (state === 'idle') return undefined;
    const timer = window.setTimeout(() => setState('idle'), state === 'ok' ? 1_600 : 2_000);
    return () => window.clearTimeout(timer);
  }, [state]);
  const label = state === 'ok' ? 'Код скопирован' : state === 'error' ? 'Не удалось скопировать' : 'Скопировать код';
  return <button type="button" className={`archetype-copy-button open-deck__copy${state === 'ok' ? ' archetype-copy-button--copied' : ''}`}
    aria-label={`${label}: ${title}`} onClick={() => { void writeText(code).then(() => setState('ok'), () => setState('error')); }}>
    {state === 'ok' ? <Check aria-hidden="true" size={16} /> : <Copy aria-hidden="true" size={16} />}
    <span aria-live="polite">{label}</span>
  </button>;
}

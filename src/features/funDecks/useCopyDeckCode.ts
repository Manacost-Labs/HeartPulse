import { useEffect, useState } from 'react';

async function writeClipboardText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Fall through for browsers that expose Clipboard API but deny writes.
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.readOnly = true;
  textarea.setAttribute('aria-hidden', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, value.length);

  try {
    if (!document.execCommand('copy')) throw new Error('Clipboard write failed');
  } finally {
    textarea.remove();
  }
}

export type CopyDeckCodeState = 'idle' | 'ok' | 'error';

const LABELS: Record<CopyDeckCodeState, string> = {
  idle: 'Скопировать код колоды',
  ok: 'Код скопирован',
  error: 'Не удалось скопировать',
};

/** Copies a deck code and reports the outcome for a moment, then returns to idle. */
export function useCopyDeckCode(deckCode: string) {
  const [state, setState] = useState<CopyDeckCodeState>('idle');

  useEffect(() => {
    if (state === 'idle') return undefined;
    const timeout = window.setTimeout(() => setState('idle'), state === 'ok' ? 1600 : 2000);
    return () => window.clearTimeout(timeout);
  }, [state]);

  const copy = async () => {
    try {
      await writeClipboardText(deckCode);
      setState('ok');
    } catch {
      setState('error');
    }
  };

  return { state, label: LABELS[state], copy };
}

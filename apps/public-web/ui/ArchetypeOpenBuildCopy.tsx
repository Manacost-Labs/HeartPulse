'use client';

import { Copy } from 'lucide-react';
import { useCopyDeckCode } from '@/src/features/funDecks/useCopyDeckCode';

/** «Скопировать код»: the one client island of an open build; the build itself is server HTML. */
export function ArchetypeOpenBuildCopy({ deckCode, title }: { deckCode: string; title: string }) {
  const { state, label, copy } = useCopyDeckCode(deckCode);
  return <button type="button" className={`archetype-copy-button${state === 'ok' ? ' archetype-copy-button--copied' : ''}`}
    aria-label={`${label}: ${title}`} onClick={() => void copy()}>
    <Copy aria-hidden="true" size={16} />
    <span aria-live="polite">{state === 'idle' ? 'Скопировать код' : label}</span>
  </button>;
}

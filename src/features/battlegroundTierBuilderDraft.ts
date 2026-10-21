import { useEffect, useRef, useState } from 'react';
import {
  buildTierBuilderCards, createBuilderHistory, readTierBuilderDraft, tierBuilderDraft,
  type TierBuilderCard, type TierBuilderPlacement,
} from '../modules/battlegrounds/public';
import { publicResourceUrl } from '../publicResourceUrl';
import { fetchWithDeadline } from '../shared/http/fetchWithDeadline';

/** The classic runtime (`/bg-legacy/shared.js`) that synchronizes the live pools with bundled fallbacks. */
export type ClassicRuntime = {
  loadBattlegroundsLibrary: (options: { locale: string; includeEnglish: boolean }) => Promise<{ cards?: unknown }>;
  loadCurrentHeroesData: () => Promise<unknown>;
  loadCurrentAccessoriesData: () => Promise<{ small?: unknown; large?: unknown }>;
  loadImageFromSource: (src: string) => Promise<HTMLImageElement>;
};

const DRAFT_KEY = 'hearthpulse-tier-draft-v1';

export function readStorage(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

export function writeStorage(key: string, value: string): boolean {
  try { window.localStorage.setItem(key, value); return true; } catch { return false; }
}

function readSavedDraft(): unknown {
  try {
    const saved = JSON.parse(readStorage(DRAFT_KEY) || 'null');
    return saved?.version === 1 ? saved.draft : null;
  } catch { return null; }
}

/** Spells and English names only enrich the pool; without them the builder still opens. */
function optionalJson(path: string): Promise<{ cards?: unknown }> {
  return fetchWithDeadline(path, { headers: { Accept: 'application/json' } })
    .then(response => response.ok ? response.json() : { cards: [] })
    .catch(() => ({ cards: [] }));
}

/** The pool from the classic runtime plus the restored browser draft; `failed` when the runtime rejects. */
export function useTierBuilderPool(runtime: ClassicRuntime) {
  const [pool, setPool] = useState<{ cards: TierBuilderCard[]; draft: TierBuilderPlacement } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void Promise.all([
      runtime.loadBattlegroundsLibrary({ locale: 'ruRU', includeEnglish: true }),
      optionalJson('/api/battlegrounds-spells?locale=ru_RU&pageSize=200'),
      optionalJson('/api/battlegrounds-card-names?locale=en_US'),
      runtime.loadCurrentHeroesData(),
      runtime.loadCurrentAccessoriesData(),
    ]).then(([library, spells, englishNames, heroTiers, accessories]) => {
      if (!active) return;
      const cards = buildTierBuilderCards({ library, spells, englishNames, heroTiers, accessories }, publicResourceUrl);
      setPool({ cards, draft: readTierBuilderDraft(cards.map(card => card.id), readSavedDraft()) });
    }, error => {
      console.error(error);
      if (active) setFailed(true);
    });
    return () => { active = false; };
  }, [runtime]);
  return { pool, failed };
}

/** Every placement is a draft: kept for undo at once, written to the browser a moment later, on unmount and on page hide. */
export function useTierBuilderDraft(ids: string[] | null, placement: TierBuilderPlacement) {
  const [history] = useState(createBuilderHistory);
  const pending = useRef<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [status, setStatus] = useState('');
  useEffect(() => {
    if (!ids) return undefined;
    history.commit(placement);
    setCanUndo(history.canUndo());
    const snapshot = JSON.stringify({ version: 1, draft: tierBuilderDraft(ids, placement) });
    if (readStorage(DRAFT_KEY) === snapshot) {
      // An undo inside the save delay returns to the stored draft: nothing is left to write.
      if (pending.current) setStatus('Черновик сохранён в этом браузере');
      pending.current = null;
      return undefined;
    }
    pending.current = snapshot;
    setStatus('Сохраняю черновик…');
    const timer = window.setTimeout(() => {
      pending.current = null;
      setStatus(writeStorage(DRAFT_KEY, snapshot)
        ? 'Черновик сохранён в этом браузере'
        : 'Браузер не разрешает сохранить черновик. Экспортируйте результат перед выходом.');
    }, 250);
    return () => window.clearTimeout(timer);
  }, [history, ids, placement]);
  // A reload or a closed tab inside the 250 ms window must not lose the last move.
  useEffect(() => {
    const flush = () => {
      if (pending.current) writeStorage(DRAFT_KEY, pending.current);
      pending.current = null;
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);
  const undo = (): unknown => {
    const previous = history.undo();
    setCanUndo(history.canUndo());
    return previous;
  };
  return { canUndo, status, undo };
}

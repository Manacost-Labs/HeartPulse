import 'server-only';
import { cache } from 'react';
import { publicBattlegroundLibraryCard } from './publicBattlegroundLibraryCardData';

/** Loads an anonymous card projection without forwarding a browser session. */
export const loadPublicBattlegroundLibraryCard = cache(async (kind: string, slugAndDbfId: string) => {
  if (kind !== 'minions' && kind !== 'spells') return null;
  if (slugAndDbfId.length > 180) return null;
  const match = slugAndDbfId.match(/^(.+)-([1-9][0-9]*)$/u);
  if (!match || match[1].length > 80 || !Number.isSafeInteger(Number(match[2]))) return null;
  const origin = new URL(process.env.LEGACY_WEB_ORIGIN ?? 'http://127.0.0.1:3001');
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/') {
    throw new Error('Invalid legacy origin');
  }
  const cardKind = kind === 'minions' ? 'minion' : 'spell';
  const response = await fetch(new URL(`/api/bg/library/public/${cardKind}/${match[2]}`, origin), {
    cache: 'no-store', credentials: 'omit', redirect: 'error',
    signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json' },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Public Battleground card temporarily unavailable');
  return publicBattlegroundLibraryCard(await response.json(), kind, match[2]);
});

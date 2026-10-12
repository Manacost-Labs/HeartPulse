import { gameRulesFromCards, type GameRules } from '../model/legality';

/** Loaded only for Death Knights or Tourists; the public source receives no session credentials. */
export async function loadGameRules(signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<GameRules> {
  const response = await fetcher('https://api.hearthstonejson.com/v1/latest/enUS/cards.collectible.json', {
    signal, credentials: 'omit', headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('Не удалось загрузить требования к картам');
  return gameRulesFromCards(await response.json());
}

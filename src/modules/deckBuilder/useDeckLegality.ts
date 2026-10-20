import { useEffect, useState } from 'react';
import { loadGameRules } from './api/gameRules';
import { isLegalDeckCard, legalityIssues, rebalanceRunes, touristDestination, type GameRules, type RuneCost } from './model/legality';
import type { BuilderCard, BuilderClass, BuilderEntry } from './model/selection';

const empty: GameRules = { runes: {}, tourists: {} };

export function useDeckLegality(deck: BuilderEntry[], heroClass: BuilderClass, load = loadGameRules) {
  const [rules, setRules] = useState<GameRules | null>(null);
  const [runes, setRunes] = useState<RuneCost>({ blood: 1, frost: 1, unholy: 1 });
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const needsRules = heroClass === 'DEATHKNIGHT' || deck.some(card => /турист|tourist/i.test(card.text ?? ''));
  useEffect(() => {
    if (!needsRules || rules) return;
    const controller = new AbortController();
    setError('');
    void load(AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]))
      .then(result => { if (!controller.signal.aborted) setRules(result); })
      .catch(() => { if (!controller.signal.aborted) setError('Не удалось загрузить требования к картам. Повторите загрузку.'); });
    return () => controller.abort();
  }, [load, needsRules, rules, retry]);
  const destination = touristDestination(deck, heroClass, rules ?? empty);
  const issues = legalityIssues(deck, heroClass, rules ?? empty, runes);
  if (needsRules && !rules) issues.unshift(error || 'Загружаем требования к картам');
  return { destination, runes, error: needsRules ? error : '', needsRunes: heroClass === 'DEATHKNIGHT' || destination === 'DEATHKNIGHT',
    issues, loading: needsRules && !rules && !error,
    legal: (card: BuilderCard, current = deck) => !(needsRules && !rules) && isLegalDeckCard(card, heroClass, current, rules ?? empty, runes),
    changeRunes: (key: keyof RuneCost, count: number) => setRunes(current => rebalanceRunes(current, key, count)),
    reset: () => setRunes({ blood: 1, frost: 1, unholy: 1 }),
    retry: () => setRetry(value => value + 1) };
}

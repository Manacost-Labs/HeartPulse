'use client';
import { useEffect, useState } from 'react';
import { constructedCardPeriodFromSearch, constructedCardRankFromSearch, type ConstructedCardPeriod, type ConstructedCardRank } from './model/statisticsContext';
const currentSearch = () => typeof window === 'undefined' ? '' : window.location.search;

export function useConstructedCardPeriod(initialSearch?: string): [ConstructedCardPeriod, (value: ConstructedCardPeriod) => void] {
  const [value, setValue] = useState(() => constructedCardPeriodFromSearch(initialSearch ?? currentSearch()));
  useEffect(() => {
    const sync = () => setValue(constructedCardPeriodFromSearch(currentSearch()));
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  return [value, setValue];
}

export function useConstructedCardRank(initialSearch?: string): [ConstructedCardRank, (value: ConstructedCardRank) => void] {
  const [value, setValue] = useState(() => constructedCardRankFromSearch(initialSearch ?? currentSearch()));
  useEffect(() => {
    const sync = () => setValue(constructedCardRankFromSearch(currentSearch()));
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  return [value, setValue];
}

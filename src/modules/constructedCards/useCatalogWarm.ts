'use client';
import { useEffect } from 'react';
import type { CatalogLocation } from './model/catalogLocation';
import { adjacentConstructedCardCatalogContexts, constructedCardCatalogUrl } from './model/catalogQuery';

export function useCatalogWarm(state: CatalogLocation, ready: boolean, statsAccess: boolean, prefetch: (url: string, statsAccess: boolean) => Promise<void>) {
  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (!ready || document.visibilityState === 'hidden' || connection?.saveData || ['slow-2g', '2g'].includes(connection?.effectiveType ?? '')) return;
    let cancelled = false; let idle: number | null = null;
    const warm = async () => {
      for (const candidate of adjacentConstructedCardCatalogContexts(state)) {
        if (cancelled || document.visibilityState === 'hidden') return;
        await prefetch(constructedCardCatalogUrl({ ...state, ...candidate, page: 1, query: state.filters.query }), statsAccess);
      }
    };
    const timer = window.setTimeout(() => {
      if ('requestIdleCallback' in window) idle = window.requestIdleCallback(() => { void warm(); }, { timeout: 2000 });
      else void warm();
    }, 900);
    return () => { cancelled = true; window.clearTimeout(timer); if (idle !== null) window.cancelIdleCallback(idle); };
  }, [state, ready, statsAccess, prefetch]);
}

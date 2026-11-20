import type { Router } from 'express';
import type { PublicBattlegroundHero, PublicBattlegroundHeroProfile, PublicBattlegroundHeroStats } from './battlegroundHeroPublicTypes.js';

export function isPositiveDbfId(value: unknown): boolean {
  const raw = String(value ?? '');
  const parsed = Number(raw);
  return /^[1-9][0-9]*$/.test(raw) && Number.isSafeInteger(parsed) && parsed > 0;
}

/**
 * Registers the anonymous identity of a hero, its open profile (game content of
 * the hero library; see `battlegroundHeroPublicProfile.ts`) and its open
 * statistics (the base rating range, solo and duos; see
 * `battlegroundHeroStatsProjection.ts`). Everything else about a hero (other
 * ranges, placement distribution, compositions with metrics, patch history)
 * stays on guarded routes.
 */
export function registerPublicBattlegroundHeroRoute(router: Router, options: {
  loadHero: (dbfId: string) => Promise<PublicBattlegroundHero | null>;
  /** Open statistics of the hero; `null` when it is not rated. A rejection is a 503 with `Retry-After`. */
  loadStats?: (dbfId: number) => Promise<PublicBattlegroundHeroStats | null>;
  /** Open profile of the hero; `null` when the library has none or fails (never a rejection). */
  loadProfile?: (dbfId: number) => Promise<PublicBattlegroundHeroProfile | null>;
  imageUrl: (value: string | null) => string;
  retryAfterSeconds: number;
  onError?: (error: unknown) => void;
}): void {
  router.get('/api/bg/heroes/public/:dbfId', async (request, response) => {
    const dbfId = String(request.params.dbfId ?? '');
    response.set('X-Robots-Tag', 'noindex, nofollow');
    response.set('Cache-Control', 'public, max-age=60');
    if (!isPositiveDbfId(dbfId)) return response.status(404).json({ error: 'Hero not found' });
    try {
      const hero = await options.loadHero(dbfId);
      if (!hero) return response.status(404).json({ error: 'Hero not found' });
      // A failing statistics source with no copy is a retryable 503 like the catalog: never a 200 without figures.
      const [stats, profile] = await Promise.all([
        options.loadStats ? options.loadStats(hero.dbfId) : null,
        options.loadProfile ? options.loadProfile(hero.dbfId) : null,
      ]);
      return response.json({ stats, profile, hero: {
        dbfId: hero.dbfId, cardId: hero.cardId, name: hero.name,
        image: options.imageUrl(hero.image),
        heroPower: hero.heroPower ? {
          name: hero.heroPower.name, text: hero.heroPower.text,
          image: options.imageUrl(hero.heroPower.image),
        } : null,
      } });
    } catch (error) {
      try { options.onError?.(error); } catch { /* diagnostics are best-effort */ }
      response.set('Cache-Control', 'no-store');
      response.set('Retry-After', String(options.retryAfterSeconds));
      return response.status(503).json({ error: 'Hero catalog temporarily unavailable' });
    }
  });
}

import type { Router } from 'express';
import type { PublicBattlegroundHero } from './battlegroundHeroPublicTypes.js';

export function isPositiveDbfId(value: unknown): boolean {
  const raw = String(value ?? '');
  const parsed = Number(raw);
  return /^[1-9][0-9]*$/.test(raw) && Number.isSafeInteger(parsed) && parsed > 0;
}

/** Registers only anonymous identity fields; account statistics stay on guarded routes. */
export function registerPublicBattlegroundHeroRoute(router: Router, options: {
  loadHero: (dbfId: string) => Promise<PublicBattlegroundHero | null>;
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
      return response.json({ hero: {
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

export const HSREPLAY_NO_ARENASMITH_TIER = 'U';

export function normalizeArenasmithTier(value: unknown): string | null {
  const tier = String(value ?? '').trim().toUpperCase();
  return /^[SABCDEF]$/.test(tier) ? tier : null;
}

export function tierFromArenasmithScore(score: number | null | undefined): string | null {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  if (score >= 53) return 'S';
  if (score >= 45) return 'A';
  if (score >= 35) return 'B';
  if (score >= 24) return 'C';
  if (score >= 10) return 'D';
  return 'E';
}


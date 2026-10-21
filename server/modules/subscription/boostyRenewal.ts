/**
 * Whether Boosty will charge the subscriber again at the next payment date.
 * Kept only when the provider sends a real boolean: the account page then says
 * "renews automatically" or "will not renew", and says nothing otherwise.
 * Display data only; access decisions never read it.
 */
export function normalizeBoostyRenewal(subscriber: unknown): Record<string, never> | { willRenew: boolean } {
  if (!subscriber || typeof subscriber !== 'object' || Array.isArray(subscriber)) return {};
  const value = (subscriber as Record<string, unknown>).willRenew;
  return typeof value === 'boolean' ? { willRenew: value } : {};
}

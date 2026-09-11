export const APPLICATION_AUTH_SCOPES = [
  'profile.read',
  'subscription.read',
  'catalog.read',
  'images.read',
  'statistics.read',
  'tracker.write',
] as const;

export type ApplicationAuthScope = typeof APPLICATION_AUTH_SCOPES[number];

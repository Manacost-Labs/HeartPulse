export type ArticleAccessMode = 'arena' | 'battlegrounds' | 'standard' | 'wild' | 'general';

export type ArticleAccessEntitlement =
  | 'arenaArticles'
  | 'battlegroundsArticles'
  | 'standard';

export function articleAccessEntitlement(mode: ArticleAccessMode): ArticleAccessEntitlement | null {
  if (mode === 'arena') return 'arenaArticles';
  if (mode === 'battlegrounds') return 'battlegroundsArticles';
  if (mode === 'standard' || mode === 'wild') return 'standard';
  return null;
}

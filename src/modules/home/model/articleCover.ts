/**
 * Widths `/api/article-cover?w=` serves (server/articleCoverRoutes.ts rejects
 * any other). The articles module keeps the same list; the markup test keeps
 * them equal.
 */
export const HOME_ARTICLE_COVER_WIDTHS = [480, 720, 960] as const;

// Rendered teaser widths of `.home-latest-articles__board`, whose columns
// follow the `.home-workbench` container: one column, then two with the lead
// teaser spanning both (768 px, and again from 1041 px beside the sidebar),
// then three from 1422 px. Measured; a small overestimate only costs bytes.
export const HOME_LEAD_COVER_SIZES =
  '(min-width: 1800px) 548px, (min-width: 1422px) calc(39vw - 154px), (min-width: 1024px) calc(100vw - 360px), (min-width: 768px) calc(100vw - 84px), calc(100vw - 48px)';
export const HOME_COVER_SIZES =
  '(min-width: 1800px) 410px, (min-width: 1422px) calc(29vw - 112px), (min-width: 1041px) calc(45vw - 140px), (min-width: 1024px) calc(100vw - 360px), (min-width: 768px) calc(50vw - 44px), calc(100vw - 48px)';

/**
 * A proxied cover as WebP variants for `srcSet`; `src` is the widest variant
 * for browsers that ignore `srcSet`. Other sources are returned unchanged.
 */
export function responsiveHomeCover(src: string): { src: string; srcSet?: string } {
  // A comma or space would split a srcset candidate.
  if (!src.startsWith('/api/article-cover?') || /[\s,]/.test(src)) return { src };
  const variant = (width: number) => `${src}&w=${width}`;
  return {
    src: variant(HOME_ARTICLE_COVER_WIDTHS[HOME_ARTICLE_COVER_WIDTHS.length - 1]),
    srcSet: HOME_ARTICLE_COVER_WIDTHS.map(width => `${variant(width)} ${width}w`).join(', '),
  };
}

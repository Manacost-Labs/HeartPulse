/**
 * The public menu reads the patch archive once the browser is idle, for its
 * «Новый» patch badge. Fixtures that list every API read of a page answer it
 * with an empty archive (no badge) instead of counting it as page data.
 */
export const MENU_PATCH_ARCHIVE = { patches: [], updatedAt: '2026-01-01T00:00:00.000Z' };

export function isMenuBackgroundRead(pathname) {
  return pathname.replace(/\/+$/, '') === '/api/patch-notes';
}

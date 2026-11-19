import type { ReactNode } from 'react';
import menuArt from './menuArt.json';

/** Menu art is painted at 40, 80 and 120 px and shown at 40 px, so a 1x screen takes the small file and a dense one the larger. */
export const NAV_ICON_SIZE = 40;
export const MODE_EMBLEM_SIZE = 48;

const ICONS: ReadonlySet<string> = new Set(menuArt.icons);
const BANNERS: ReadonlySet<string> = new Set(menuArt.banners);

/**
 * The art is served `immutable` under fixed names, so its URL carries the version of the set:
 * a redrawn icon gets a new URL instead of the browser's 30-day copy. `version` is a hash of
 * `public/menu/` (tests/routes.test.ts recomputes it), so redrawn art without a new version fails the tests.
 */
export const artUrl = (path: string): string => `${path}?v=${menuArt.version}`;

/** `/menu/icons/<id>-{40,80,120}.webp` as a width-descriptor srcset; the files are listed in `menuArt.json`. */
export const menuIconSrcSet = (id: string): string => [40, 80, 120].map(width => `${artUrl(`/menu/icons/${id}-${width}.webp`)} ${width}w`).join(', ');

/** The painted icon of a menu item or `mode-<id>` emblem; nothing for an id without art (tests/routes.test.ts keeps every menu item covered). */
export function NavigationIcon({ id, size = NAV_ICON_SIZE, fallback = null }: { id: string; size?: number; fallback?: ReactNode }) {
  if (!ICONS.has(id)) return fallback;
  // `sizes` is the real slot: at 48 px a 1x screen takes the 80 px file, not the 40 px one stretched.
  return <img className="hp-nav-art" src={artUrl(`/menu/icons/${id}-80.webp`)} srcSet={menuIconSrcSet(id)} sizes={`${size}px`} width={size} height={size} loading="lazy" decoding="async" alt="" />;
}

/** Width of the two banner files; `sizes` of the cards says which one a card needs. */
export const MODE_BANNER_WIDTHS = [440, 571] as const;

/** `srcset` of a mode's banner art (440×616 and 571×800), or nothing for a mode without art. */
export const modeBannerSrcSet = (mode: string): string | undefined => BANNERS.has(mode)
  ? MODE_BANNER_WIDTHS.map(width => `${artUrl(`/menu/banners/${mode}-${width}.webp`)} ${width}w`).join(', ')
  : undefined;

/** The tall banner file of a mode, the `src` beside `modeBannerSrcSet`. */
export const modeBannerSrc = (mode: string): string => artUrl(`/menu/banners/${mode}-440.webp`);

/** The wide strip behind the face of the mode button (520×160). */
export const modeFaceSrc = (mode: string): string | undefined => BANNERS.has(mode) ? artUrl(`/menu/banners/${mode}-face.webp`) : undefined;

import type { ReactNode } from 'react';
import menuArt from './menuArt.json';

/** Menu art is drawn at 96 px for dense displays and shown at 40 px. */
export const NAV_ICON_SIZE = 40;
export const MODE_EMBLEM_SIZE = 48;

const ICONS: Readonly<Record<string, string>> = menuArt.icons;
const BANNERS: Readonly<Record<string, string>> = menuArt.banners;

/** The painted icon of a menu item or `mode-<id>` emblem; nothing for an id without art (tests/routes.test.ts keeps every menu item covered). */
export function NavigationIcon({ id, size = NAV_ICON_SIZE, fallback = null }: { id: string; size?: number; fallback?: ReactNode }) {
  const src = ICONS[id];
  return src ? <img className="hp-nav-art" src={src} width={size} height={size} loading="lazy" decoding="async" alt="" /> : fallback;
}

export const modeBannerSrc = (mode: string): string | undefined => BANNERS[mode];

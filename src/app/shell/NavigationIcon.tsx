import artManifest from './menuArtManifest.json';
import type { MenuIcon } from './menuIcons';

/** The icon art of an item is 40 px on screen, drawn at 80 px for dense displays. */
export const NAV_ICON_SIZE = 40;
const ICON_ART = new Set<string>(artManifest.icons);
const BANNER_ART = new Set<string>(artManifest.banners);

/** Painted art of an item when its file is in the manifest, otherwise the line icon at the same size. */
export function NavigationIcon({ id, Icon }: { id: string; Icon: MenuIcon }) {
  if (ICON_ART.has(id)) {
    return <img className="hp-nav-art" src={`/menu/icons/${id}.webp`} width={NAV_ICON_SIZE} height={NAV_ICON_SIZE}
      loading="lazy" decoding="async" alt="" />;
  }
  return <Icon size={NAV_ICON_SIZE} strokeWidth={1.3} />;
}

/** The banner file of a mode, or null while only the gradient fallback exists. */
export function modeBannerSrc(mode: string): string | null {
  return BANNER_ART.has(mode) ? `/menu/banners/${mode}.webp` : null;
}

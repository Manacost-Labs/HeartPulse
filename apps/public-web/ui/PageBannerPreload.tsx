/** The AVIF entry of the page banner's `image-set()` in `TraditionalModeBanner.css`. */
const PAGE_BANNER_AVIF_URL = '/wallpaper/profile-hero-hth-1430.avif';

/**
 * Head hint for the page banner art, for a page whose measured LCP element is
 * that banner. As a CSS background it is found only after every stylesheet is
 * parsed; React sends this high-priority preload in the `Link` response header
 * instead. Such a page limits the shell's parchment preload to 768px and wider,
 * where the parchment paints first, so on phones the two do not split the
 * bandwidth. `type` makes a browser without AVIF skip the hint; `image-set()`
 * then picks the WebP, so no browser downloads both files.
 */
export function PageBannerPreload() {
  return <link rel="preload" href={PAGE_BANNER_AVIF_URL} as="image" type="image/avif" fetchPriority="high" />;
}

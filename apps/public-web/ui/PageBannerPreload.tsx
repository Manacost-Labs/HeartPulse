/** The AVIF entries of the page banner's `image-set()` in `PublicPageBanner.css`. */
const PAGE_BANNER_AVIF_URL = '/wallpaper/profile-hero-hth-1430.avif';
const PAGE_BANNER_PHONE_AVIF_URL = '/wallpaper/profile-hero-hth-860.avif';
/** The banner's phone layout in `PublicPageBanner.css`, which picks the 860 px file. */
const PAGE_BANNER_PHONE = '(max-width: 720px)';

/**
 * Head hints for the page banner art, for a page whose measured LCP element is
 * that banner. As a CSS background it is found only after every stylesheet is
 * parsed; React sends these high-priority preloads in the `Link` response
 * header instead. `media` matches the CSS breakpoint, so each width fetches
 * only the file it paints. `type` makes a browser without AVIF skip the hint;
 * `image-set()` then picks the WebP, so no browser downloads both files.
 * Elsewhere the hint is left out: on a Slow 4G phone it delayed the first
 * paint of the tier list by 0.3-0.6 s, sharing bandwidth with the stylesheets.
 */
export function PageBannerPreload() {
  return <>
    <link rel="preload" href={PAGE_BANNER_PHONE_AVIF_URL} as="image" type="image/avif" media={PAGE_BANNER_PHONE} fetchPriority="high" />
    <link rel="preload" href={PAGE_BANNER_AVIF_URL} as="image" type="image/avif" media="(min-width: 721px)" fetchPriority="high" />
  </>;
}

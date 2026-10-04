/**
 * Bounded page dimensions attached to first-party Web Vitals.
 *
 * The browser derives every value with this module and the API accepts only
 * the exact shapes defined here, so a raw path, an id, a query string or page
 * text can never become a metric attribute. Both runtimes import it, so it
 * must not touch DOM or Node globals.
 */

/**
 * One template per `apps/public-web/app/**\/page.tsx`, written like the app
 * directory. `tests/web-vitals-dimensions.test.ts` keeps the list equal to the
 * app pages; every other path reports as `other`.
 */
export const WEB_VITAL_ROUTE_TEMPLATES = [
  '/',
  '/admin/',
  '/archetypes/',
  '/archetypes/[archetypeId]/',
  '/archetypes/wild/',
  '/articles/',
  '/battlegrounds/strategies/',
  '/battlegrounds/tier-builder/',
  '/battlegrounds/tier-list/',
  '/classes/',
  '/connect/',
  '/contests/',
  '/cosmetics/',
  '/cosmetics/[kind]/',
  '/cosmetics/[kind]/[cardId]/',
  '/deck-builder/',
  '/developers/api/',
  '/faq/',
  '/gallery/',
  '/guides-archive/',
  '/guides-archive/[guideSlug]/',
  '/heroes/',
  '/heroes/[dbfId]/',
  '/id/[publicProfileId]/',
  '/legendaries/',
  '/library/',
  '/library/[kind]/',
  '/library/[kind]/[slugAndDbfId]/',
  '/library/archive/',
  '/library/archive/[kind]/',
  '/library/archive/[kind]/[slugAndDbfId]/',
  '/privacy/',
  '/profiles/[legacyPublicProfileId]/',
  '/standard/archetypes/',
  '/standard/archetypes/[format]/[archetypeSlug]/',
  '/standard/cards/',
  '/standard/cards/[format]/',
  '/standard/cards/[format]/[cardId]/',
  '/standard/fun-decks/',
  '/standard/matchups/',
  '/standard/meta/',
  '/standard/meta/[format]/[archetypeSlug]/',
  '/standard/vicious-gold/',
  '/terms/',
  '/tierlist/',
] as const;

export type WebVitalRoute = typeof WEB_VITAL_ROUTE_TEMPLATES[number] | 'other';

export const WEB_VITAL_DEVICES = ['mobile', 'desktop'] as const;

export type WebVitalDevice = typeof WEB_VITAL_DEVICES[number];

/** The public shell switches from the mobile top bar to the desktop sidebar here (design.md). */
export const WEB_VITAL_DESKTOP_MEDIA_QUERY = '(min-width: 1024px)';

/** Structural subset of a DOM element; only the tag and class names are ever read. */
export type LcpElementLike = {
  tagName: string;
  classList: Iterable<string> | ArrayLike<string>;
  parentElement: LcpElementLike | null;
};

const MAX_PATHNAME_LENGTH = 512;
const MAX_CLASS_LENGTH = 48;
const MAX_LCP_TARGET_LENGTH = 64;
const MAX_ANCESTOR_DEPTH = 3;
const NO_LCP_ELEMENT = 'none';
const OTHER_TAG = 'other';

const ROUTE_PATTERNS = WEB_VITAL_ROUTE_TEMPLATES.map(template => {
  const segments = template.split('/').filter(Boolean);
  // Like the Next.js router, a static segment outranks a dynamic one at the first difference.
  const specificity = segments.map(segment => (segment.startsWith('[') ? '0' : '1')).join('');
  return { template, segments, specificity };
});

const LCP_TARGET_TAGS = new Set([
  'a', 'article', 'aside', 'blockquote', 'button', 'caption', 'code', 'dd', 'div', 'dt', 'em',
  'figcaption', 'figure', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'image', 'img',
  'label', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'small', 'span', 'strong', 'summary',
  'svg', 'table', 'td', 'th', 'time', 'ul', 'video',
]);
// Lower-case BEM names only: no hashes, arbitrary values, variants or mixed case.
const CLASS_PATTERN = /^[a-z][a-z0-9]*(?:(?:-|--|__)[a-z0-9]+)*$/;
// A run of digits is more likely an entity id than a component name.
const ID_LIKE_CLASS = /[0-9]{3}/;
// Tailwind utilities describe styling rather than the component and repeat on every page.
const UTILITY_CLASS = /^(?:[mp][xytrbl]?|[wh]|size|min|max|inset|top|right|bottom|left|z|gap|space|text|font|leading|tracking|bg|border|rounded|shadow|drop|ring|outline|opacity|object|overflow|items|justify|content|self|place|flex|grid|col|row|order|basis|grow|shrink|aspect|blur|transition|duration|ease|delay|animate|cursor|select|pointer|whitespace|break|line|underline|decoration|sr|not|scroll|snap|fill|stroke|translate|rotate|scale|origin|block|inline|hidden|absolute|relative|fixed|sticky|static|uppercase|lowercase|capitalize|italic|truncate|container|contents|isolate|visible|invisible)(?:-|$)/;

/** Map a pathname to its page template, or `other` when no Next.js page matches. */
export function webVitalRouteTemplate(pathname: string): WebVitalRoute {
  if (pathname.length > MAX_PATHNAME_LENGTH) return 'other';
  const segments = pathname.split('/').filter(Boolean);
  let match: (typeof ROUTE_PATTERNS)[number] | undefined;
  for (const pattern of ROUTE_PATTERNS) {
    if (pattern.segments.length !== segments.length) continue;
    if (!pattern.segments.every((segment, index) => segment.startsWith('[') || segment === segments[index])) continue;
    if (!match || pattern.specificity > match.specificity) match = pattern;
  }
  return match?.template ?? 'other';
}

export function isWebVitalRoute(value: unknown): value is WebVitalRoute {
  return value === 'other' || (WEB_VITAL_ROUTE_TEMPLATES as readonly unknown[]).includes(value);
}

export function isWebVitalDevice(value: unknown): value is WebVitalDevice {
  return (WEB_VITAL_DEVICES as readonly unknown[]).includes(value);
}

function isComponentClass(name: string): boolean {
  return name.length <= MAX_CLASS_LENGTH
    && CLASS_PATTERN.test(name)
    && !ID_LIKE_CLASS.test(name)
    && !UTILITY_CLASS.test(name);
}

function componentClass(element: LcpElementLike): string | null {
  let first: string | null = null;
  for (const name of Array.from(element.classList)) {
    if (!isComponentClass(name)) continue;
    if (name.includes('__')) return name;
    first ??= name;
  }
  return first;
}

/**
 * Describe the LCP element as `tag` or `tag.class`. The class is the
 * element's component class, or its nearest ancestor's within three levels
 * when the element itself carries only utilities (typical for images inside a
 * component wrapper). Text, ids, attributes and URLs are never read.
 */
export function webVitalLcpTarget(element: LcpElementLike | null | undefined): string {
  if (!element) return NO_LCP_ELEMENT;
  const tagName = element.tagName.toLowerCase();
  const tag = LCP_TARGET_TAGS.has(tagName) ? tagName : OTHER_TAG;
  let node: LcpElementLike | null = element;
  for (let depth = 0; node && depth <= MAX_ANCESTOR_DEPTH; depth += 1) {
    const name = componentClass(node);
    if (name) return `${tag}.${name}`;
    node = node.parentElement;
  }
  return tag;
}

export function isWebVitalLcpTarget(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > MAX_LCP_TARGET_LENGTH) return false;
  if (value === NO_LCP_ELEMENT) return true;
  const [tag, name, ...rest] = value.split('.');
  if (rest.length > 0 || (tag !== OTHER_TAG && !LCP_TARGET_TAGS.has(tag))) return false;
  return name === undefined || isComponentClass(name);
}

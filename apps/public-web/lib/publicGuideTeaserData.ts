export type PublicGuideTeaser = {
  slug: string;
  title: string;
  description: string;
  image: string | null;
  publishedAt: string | null;
  kind: string | null;
  kindSlug: string | null;
  menuName: string | null;
  updatedAt: string | null;
  /** Sanitized open part of the text: the only guide text the page ever receives. */
  excerptHtml: string;
  toc: PublicGuideTocEntry[];
  hasPaid: boolean;
  indexable: boolean;
};

export type PublicGuideTocEntry = { id: string; text: string; level: 2 | 3 };

const MAX_EXCERPT_LENGTH = 60_000;
const MAX_TOC_ENTRIES = 120;
// The tags and attributes the Express sanitizer can emit; anything else is not its output.
const EXCERPT_TAGS = /^(?:a|b|blockquote|br|div|em|h2|h3|h4|hr|i|img|li|ol|p|pre|span|strong|table|tbody|td|th|thead|tr|u|ul)$/;
const EXCERPT_ATTRIBUTES = /^(?:id|href|target|rel|src|alt|loading|decoding|class|colspan|rowspan|scope)$/;

function nullableText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new Error('Invalid public guide teaser');
  return value;
}

function safeImage(value: unknown): string | null {
  const image = nullableText(value);
  if (!image) return null;
  if (image.startsWith('/') && !image.startsWith('//')) return image;
  try { if (new URL(image).protocol === 'https:') return image; } catch { /* reject invalid URL */ }
  throw new Error('Invalid public guide teaser');
}

function excerptHtml(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.length > MAX_EXCERPT_LENGTH) throw new Error('Invalid public guide teaser');
  for (const tag of value.matchAll(/<\/?([a-z0-9]+)((?:\s+[a-z-]+(?:="[^"]*")?)*)\s*\/?>/gi)) {
    const attributes = [...tag[2].matchAll(/\s+([a-z-]+)=?/gi)].map(match => match[1].toLowerCase());
    if (!EXCERPT_TAGS.test(tag[1].toLowerCase()) || attributes.some(name => !EXCERPT_ATTRIBUTES.test(name))
      || /\s(?:href|src)="\s*(?!https?:|mailto:|tel:|#)/i.test(tag[0])) throw new Error('Invalid public guide teaser');
  }
  // Every `<` that opens something must have matched a tag above.
  if (value.replace(/<\/?[a-z0-9]+(?:\s+[a-z-]+(?:="[^"]*")?)*\s*\/?>/gi, '').includes('<')) throw new Error('Invalid public guide teaser');
  return value;
}

function tocEntries(value: unknown): PublicGuideTocEntry[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_TOC_ENTRIES) throw new Error('Invalid public guide teaser');
  return value.map(entry => {
    const item = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
    if (typeof item.id !== 'string' || !/^[\w-]{1,120}$/.test(item.id) || typeof item.text !== 'string'
      || !item.text.trim() || item.text.length > 200 || (item.level !== 2 && item.level !== 3)) {
      throw new Error('Invalid public guide teaser');
    }
    return { id: item.id, text: item.text, level: item.level };
  });
}

/** Prevents full guide content from entering server-rendered guest HTML. */
export function publicGuideTeaser(raw: unknown, slug: string): PublicGuideTeaser {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid public guide teaser');
  const value = raw as Record<string, unknown>;
  if (typeof value.slug !== 'string' || !value.slug || /[\/\x00-\x1f]/.test(value.slug)
    || (value.slug !== slug && !/^\d+$/.test(slug))
    || typeof value.title !== 'string' || !value.title.trim()
    || typeof value.description !== 'string') throw new Error('Invalid public guide teaser');
  return {
    slug: value.slug, title: value.title, description: value.description,
    image: safeImage(value.image), publishedAt: nullableText(value.publishedAt),
    kind: nullableText(value.kind), kindSlug: nullableText(value.kindSlug),
    menuName: nullableText(value.menuName), updatedAt: nullableText(value.updatedAt),
    excerptHtml: excerptHtml(value.excerptHtml), toc: tocEntries(value.toc),
    // A server without the open part answers like a guide that is not ready to be indexed.
    hasPaid: value.hasPaid !== false, indexable: value.indexable === true,
  };
}

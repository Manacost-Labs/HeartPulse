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
const MAX_TOC_ENTRIES = 300;
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

const TAG_OPEN = /<(\/?)([a-z][a-z0-9]*)/y;
const TAG_ATTRIBUTE = /\s+([a-z][a-z-]*)(?:="([^"<>]*)")?/y;
const TAG_END = /\s*(\/?)>/y;
const SAFE_HREF = /^(?:https?:\/\/|mailto:|tel:|#)/i;
const SAFE_SRC = /^https?:\/\//i;

/**
 * One pass: every `<` must open a tag of the sanitizer's vocabulary with whole name="value"
 * attributes (the sanitizer escapes `<`, `>` and quotes inside values), else the text is refused.
 * Attribute values are read as values, never as names.
 */
function excerptHtml(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.length > MAX_EXCERPT_LENGTH) throw new Error('Invalid public guide teaser');
  const invalid = () => new Error('Invalid public guide teaser');
  for (let at = value.indexOf('<'); at >= 0; at = value.indexOf('<', TAG_END.lastIndex)) {
    TAG_OPEN.lastIndex = at;
    const open = TAG_OPEN.exec(value);
    if (!open || !EXCERPT_TAGS.test(open[2])) throw invalid();
    let position = TAG_OPEN.lastIndex;
    for (;;) {
      TAG_ATTRIBUTE.lastIndex = position;
      const attribute = TAG_ATTRIBUTE.exec(value);
      if (!attribute) break;
      const [, name, attributeValue] = attribute;
      if (!EXCERPT_ATTRIBUTES.test(name)) throw invalid();
      if (name === 'href' && !SAFE_HREF.test(attributeValue ?? '')) throw invalid();
      if (name === 'src' && !SAFE_SRC.test(attributeValue ?? '')) throw invalid();
      position = TAG_ATTRIBUTE.lastIndex;
    }
    TAG_END.lastIndex = position;
    if (!TAG_END.exec(value)) throw invalid();
  }
  return value;
}

function tocEntries(value: unknown): PublicGuideTocEntry[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('Invalid public guide teaser');
  // A long outline is shortened, never a reason for the page to fail.
  return value.slice(0, MAX_TOC_ENTRIES).map(entry => {
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

export type PublicGuideTeaser = {
  slug: string;
  title: string;
  description: string;
  image: string | null;
  publishedAt: string | null;
  kind: string | null;
  kindSlug: string | null;
  menuName: string | null;
};

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
    menuName: nullableText(value.menuName),
  };
}

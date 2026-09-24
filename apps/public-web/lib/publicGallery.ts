import 'server-only';

export type PublicGalleryItem = {
  id: string;
  title: string;
  description: string;
  tag: string;
  source: string;
  width: number;
  height: number;
  bytes: number;
  format: string;
  previewUrl: string;
  thumbUrl: string;
  imageUrl: string;
  downloadUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type PublicGalleryData = { items: PublicGalleryItem[]; updatedAt: string | null };

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid public gallery response');
  }
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function nonnegative(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function publicGalleryData(value: unknown): PublicGalleryData {
  const data = record(value);
  if (!Array.isArray(data.items)) throw new Error('Invalid public gallery response');
  return {
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : null,
    items: data.items.map(value => {
      const item = record(value);
      const id = text(item.id);
      const title = text(item.title);
      if (!id || !title) throw new Error('Invalid public gallery item');
      const imageBase = `/api/gallery/${encodeURIComponent(id)}`;
      return {
        id, title, description: text(item.description), tag: text(item.tag),
        source: text(item.source), width: nonnegative(item.width),
        height: nonnegative(item.height), bytes: nonnegative(item.bytes),
        format: text(item.format), createdAt: text(item.createdAt),
        updatedAt: text(item.updatedAt),
        previewUrl: `${imageBase}/preview`, thumbUrl: `${imageBase}/thumb`,
        imageUrl: `${imageBase}/original`, downloadUrl: `${imageBase}/download`,
      };
    }),
  };
}

/** Fetches only the anonymous Express gallery projection for server rendering. */
export async function loadPublicGallery(): Promise<PublicGalleryData> {
  const origin = new URL(process.env.LEGACY_WEB_ORIGIN ?? 'http://127.0.0.1:3001');
  if (!['http:', 'https:'].includes(origin.protocol)
    || origin.username || origin.password || origin.pathname !== '/') {
    throw new Error('Invalid legacy origin');
  }
  const response = await fetch(new URL('/api/gallery', origin), {
    cache: 'no-store', credentials: 'omit', redirect: 'error',
    signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('Public gallery temporarily unavailable');
  return publicGalleryData(await response.json());
}

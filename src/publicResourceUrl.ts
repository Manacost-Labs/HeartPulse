export { publicResourceUrl } from '../shared/publicResourceUrl';
import { publicResourceUrl } from '../shared/publicResourceUrl';

export function publicResourceImageUrl(
  value: unknown,
  options: { width: number; quality?: number },
): string {
  const source = publicResourceUrl(value);
  if (!source.startsWith('/api/public-resource/')) return source;
  const [pathname, search = ''] = source.split('?', 2);
  const params = new URLSearchParams(search);
  params.set('width', String(Math.round(options.width)));
  params.set('quality', String(Math.round(options.quality ?? 82)));
  params.set('format', 'webp');
  return `${pathname}?${params.toString()}`;
}

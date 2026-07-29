export function isPublicMediaApiRequest(method: string, path: string): boolean {
  const normalizedMethod = String(method).toUpperCase();
  if (normalizedMethod !== 'GET' && normalizedMethod !== 'HEAD') return false;
  return path.startsWith('/public-resource/') || path === '/article-cover';
}

/**
 * Pages are canonical with a trailing slash and the slash-less URL answers
 * with an uncached 301, so linking to it costs one more round trip per click.
 * Files, `/api/` paths and other origins are returned unchanged.
 */
export function canonicalPagePath(path: string): string {
  const [, pathname, rest] = /^(\/(?!\/)[^?#]*)(.*)$/.exec(path) ?? [];
  if (!pathname || pathname.endsWith('/') || pathname.startsWith('/api/') || /\.[^/]*$/.test(pathname)) return path;
  return `${pathname}/${rest}`;
}

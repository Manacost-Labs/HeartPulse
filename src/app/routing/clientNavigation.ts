/**
 * Returns a same-origin document URL that the client router may own.
 *
 * Native navigation remains responsible for downloads, new tabs, API endpoints
 * and referral redirects because those flows have browser or server semantics.
 */
export function shouldHandleClientNavigation({
  metaKey,
  ctrlKey,
  shiftKey,
  altKey,
  href,
  target,
  download,
  origin,
}: {
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  href: string | null;
  target: string | null;
  download: boolean;
  origin: string;
}): URL | null {
  if (
    metaKey
    || ctrlKey
    || shiftKey
    || altKey
    || !href
    || href.startsWith('#')
    || (target && target !== '_self')
    || download
  ) return null;

  let destination: URL;
  try {
    destination = new URL(href, origin);
  } catch {
    return null;
  }
  if (destination.origin !== origin || /^\/(?:api|r)\//.test(destination.pathname)) return null;

  return destination;
}

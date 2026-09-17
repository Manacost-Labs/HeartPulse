/**
 * Returns a same-origin document URL that the client router may own.
 *
 * Native navigation remains responsible for downloads, new tabs, API endpoints
 * and referral redirects because those flows have browser or server semantics.
 */
export function shouldHandleClientNavigation({
  button,
  defaultPrevented,
  metaKey,
  ctrlKey,
  shiftKey,
  altKey,
  href,
  target,
  download,
  optOut,
  origin,
}: {
  button: number;
  defaultPrevented: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  href: string | null;
  target: string | null;
  download: boolean;
  optOut: boolean;
  origin: string;
}): URL | null {
  if (
    defaultPrevented
    || button !== 0
    || metaKey
    || ctrlKey
    || shiftKey
    || altKey
    || !href
    || href.startsWith('#')
    || (target && target !== '_self')
    || download
    || optOut
  ) return null;

  let destination: URL;
  try {
    destination = new URL(href, origin);
  } catch {
    return null;
  }
  if (
    destination.origin !== origin
    || destination.pathname.startsWith('/api/')
    || destination.pathname.startsWith('/r/')
  ) return null;

  return destination;
}

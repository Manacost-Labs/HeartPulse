'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { clientPagePath, installClientNavigation } from './navigation';

function publicAnchorPath(target: EventTarget | null): string | null {
  const anchor = target instanceof Element ? target.closest<HTMLAnchorElement>('a[href]') : null;
  if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')
    || anchor.relList.contains('external') || anchor.hasAttribute('data-native-navigation')) return null;
  const path = clientPagePath(anchor.getAttribute('href') ?? '', location.href);
  if (!path) return null;
  const url = new URL(path, location.href);
  if (url.pathname === location.pathname && url.search === location.search && url.hash) return null;
  return path;
}

/** Legacy views keep real links; the persistent layout supplies App Router navigation. */
export function PublicNavigationBridge() {
  const router = useRouter();
  useEffect(() => {
    const dispose = installClientNavigation(path => router.push(path));
    const prefetched = new Set<string>();
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const destination = publicAnchorPath(event.target);
      if (!destination) return;
      event.preventDefault();
      router.push(destination);
    };
    const prefetch = (event: Event) => {
      const destination = publicAnchorPath(event.target);
      if (!destination || prefetched.has(destination)) return;
      prefetched.add(destination);
      router.prefetch(destination);
    };
    document.addEventListener('click', click);
    document.addEventListener('pointerover', prefetch);
    document.addEventListener('focusin', prefetch);
    return () => {
      dispose();
      document.removeEventListener('click', click);
      document.removeEventListener('pointerover', prefetch);
      document.removeEventListener('focusin', prefetch);
    };
  }, [router]);
  return null;
}

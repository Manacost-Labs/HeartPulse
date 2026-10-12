'use client';
import { useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { clientPagePath, createRoutePrefetcher, installClientNavigation } from './navigation';
import { allowsRoutePrefetch, createRouteIntent } from '@/src/shared/navigation/routePrefetch';
import { NavigationProgress } from '@/src/shared/ui/NavigationProgress';

function publicAnchorPath(target: EventTarget | null): string | null {
  const anchor = target instanceof Element ? target.closest<HTMLAnchorElement>('a[href]') : null;
  if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')
    || anchor.relList.contains('external') || anchor.hasAttribute('data-native-navigation')) return null;
  const path = clientPagePath(anchor.getAttribute('href') ?? '', location.href);
  if (!path) return null;
  if (path.startsWith(`${location.pathname}${location.search}#`)) return null;
  return path;
}

/** Legacy views keep real links; the persistent layout supplies App Router navigation. */
export function PublicNavigationBridge() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    const push = (path: string) => { intent.cancel(); startTransition(() => router.push(path)); };
    const dispose = installClientNavigation(push);
    // AUTO leaves dynamic pages without their content; full intent preparation
    // avoids another server round trip on click. Keep the Next enum out of shared code.
    const prepare = createRoutePrefetcher((path, options) => router.prefetch(path, {
      ...options, kind: 'full' as NonNullable<Parameters<typeof router.prefetch>[1]>['kind'],
    }));
    const allowed = () => {
      const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
      return document.visibilityState === 'visible' && allowsRoutePrefetch({ online: navigator.onLine,
        saveData: connection?.saveData, effectiveType: connection?.effectiveType });
    };
    const intent = createRouteIntent(prepare, allowed);
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const destination = publicAnchorPath(event.target);
      if (!destination) return;
      event.preventDefault();
      push(destination);
    };
    const prefetch = (event: PointerEvent | FocusEvent) => {
      const destination = publicAnchorPath(event.target);
      if (!destination || destination.split('#')[0] === `${location.pathname}${location.search}`) return;
      if (event.type === 'focusin') {
        if (event.target instanceof Element && event.target.matches(':focus-visible')) intent.focus(destination);
      }
      else if ((event as PointerEvent).pointerType !== 'touch') intent.hover(destination);
    };
    const leave = (event: PointerEvent) => {
      if (publicAnchorPath(event.target) !== publicAnchorPath(event.relatedTarget)) intent.cancel();
    };
    document.addEventListener('click', click);
    document.addEventListener('pointerover', prefetch);
    document.addEventListener('focusin', prefetch);
    document.addEventListener('pointerout', leave);
    window.addEventListener('pagehide', intent.cancel);
    return () => {
      dispose();
      intent.dispose();
      document.removeEventListener('click', click);
      document.removeEventListener('pointerover', prefetch);
      document.removeEventListener('focusin', prefetch);
      document.removeEventListener('pointerout', leave);
      window.removeEventListener('pagehide', intent.cancel);
    };
  }, [router, startTransition]);
  return <NavigationProgress pending={pending} />;
}

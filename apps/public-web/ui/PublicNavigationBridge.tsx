'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { clientPagePath, createRoutePrefetcher, installClientNavigation, navigate } from './navigation';
import { observeRouteResponses } from './routeResponses';
import { allowsRoutePrefetch, createRouteIntent } from '@/src/shared/navigation/routePrefetch';
import { createViewportPrefetch } from '@/src/shared/navigation/viewportPrefetch';
import { installPageNavigator } from '@/src/shared/navigation/pageNavigation';
import { NavigationProgress } from '@/src/shared/ui/NavigationProgress';
import { expectRouteEntrance } from '@/src/shared/ui/routeEntrance';
import { motionMs } from '@/src/shared/ui/motionTokens';

/** A click waits at most this long for a prefetch already downloading its page. */
const JOIN_PREFETCH_MS = 2500;
/** Menu links; a page opts a primary link in with `data-route-prefetch`. */
const VIEWPORT_LINKS = '.arena-sidebar a[href], #arena-mobile-menu a[href], a[href][data-route-prefetch]';
/** Drawer links, learned at idle on a phone. */
const PHONE_PRIMARY_LINKS = '#arena-mobile-menu a[href]:not(.arena-mobile-menu-profile)';

type FetchKind = NonNullable<Parameters<ReturnType<typeof useRouter>['prefetch']>[1]>['kind'];

function publicAnchorPath(target: EventTarget | null): string | null {
  const anchor = target instanceof Element ? target.closest<HTMLAnchorElement>('a[href]') : null;
  if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')
    || anchor.relList.contains('external') || anchor.hasAttribute('data-native-navigation')) return null;
  const path = clientPagePath(anchor.getAttribute('href') ?? '', location.href);
  if (!path) return null;
  if (path.startsWith(`${location.pathname}${location.search}#`)) return null;
  return path;
}

const elsewhere = (path: string) => path.split('#')[0] !== `${location.pathname}${location.search}`;

function connectionAllowsPrefetch() {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return document.visibilityState === 'visible' && allowsRoutePrefetch({ online: navigator.onLine,
    saveData: connection?.saveData, effectiveType: connection?.effectiveType });
}

/**
 * Legacy views keep real links; the persistent layout supplies App Router navigation.
 * `onNavigationStart` receives the destination pathname inside the navigation's transition;
 * `onJoining` names a destination that waits for its prefetch (null when none does);
 * each new `routeKey` (the committed pathname) looks for the page's opted-in links.
 */
export function PublicNavigationBridge({ onNavigationStart, onJoining, routeKey }: {
  onNavigationStart?: (pathname: string) => void; onJoining?: (pathname: string | null) => void; routeKey?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [joining, setJoining] = useState(false);
  const scanLinks = useRef<(() => void) | null>(null);
  const focusOnCommit = useRef<{ pathname: string; from: Element | null } | null>(null);
  useEffect(() => {
    const responses = observeRouteResponses();
    let navigation = 0;
    const join = (pathname: string | null) => { setJoining(pathname !== null); onJoining?.(pathname); };
    const commit = (path: string, pathname: string, from: Element | null) => {
      // Query and fragment changes keep the page in place.
      if (pathname !== location.pathname) {
        expectRouteEntrance(pathname);
        focusOnCommit.current = { pathname, from };
      }
      onNavigationStart?.(pathname);
      router.push(path);
    };
    const push = (path: string) => {
      intent.cancel();
      const { pathname, search } = new URL(path, location.href);
      const current = ++navigation;
      const from = document.activeElement;
      const go = () => { join(null); startTransition(() => commit(path, pathname, from)); };
      const prepared = responses.pending(`${pathname}${search}`);
      if (!prepared) { go(); return; }
      // The wait stays outside React: an async action would hold every later
      // transition (Back, another click) until it settles.
      join(pathname);
      void Promise.race([prepared, new Promise(resolve => setTimeout(resolve, JOIN_PREFETCH_MS))]).then(() => {
        // A newer click or Back while waiting wins.
        if (current === navigation) go();
      });
    };
    const supersede = () => { navigation += 1; join(null); };
    const dispose = installClientNavigation(push);
    const disposeNavigator = installPageNavigator(navigate);
    // AUTO leaves dynamic pages without their content; full intent preparation
    // avoids another server round trip on click. Keep the Next enum out of shared code.
    const prepare = createRoutePrefetcher((path, options) => router.prefetch(path, { ...options, kind: 'full' as FetchKind }));
    // A visible link only learns its route (AUTO): a prerendered page with its
    // code, a dynamic page its tree. That stays cheap on a phone's data plan.
    const learnRoute = createRoutePrefetcher((path, options) => router.prefetch(path, { ...options, kind: 'auto' as FetchKind }));
    const learned = new Set<string>();
    const learn = (path: string) => { learned.add(path.split('#')[0]); learnRoute(path); };
    const intent = createRouteIntent(prepare, connectionAllowsPrefetch, { dwellMs: motionMs('--motion-fast') });
    const viewport = createViewportPrefetch(learn, connectionAllowsPrefetch, link => {
      const path = publicAnchorPath(link);
      return path && elsewhere(path) ? path : null;
    });
    const idle = window.requestIdleCallback?.bind(window) ?? ((callback: () => void) => window.setTimeout(callback, 1));
    const cancelIdle = window.cancelIdleCallback?.bind(window) ?? window.clearTimeout.bind(window);
    let scheduled: number | undefined;
    scanLinks.current = () => {
      if (scheduled !== undefined) cancelIdle(scheduled);
      scheduled = idle(() => {
        scheduled = undefined;
        viewport.scan(document.querySelectorAll<HTMLAnchorElement>(VIEWPORT_LINKS));
        // On a phone the drawer opens about half a second before a tap, too
        // late for a slow network: its links learn their routes now.
        const toggle = document.querySelector('.arena-mobile-nav-toggle');
        if (!toggle || !toggle.getClientRects().length || !connectionAllowsPrefetch()) return;
        for (const link of document.querySelectorAll<HTMLAnchorElement>(PHONE_PRIMARY_LINKS)) {
          const path = publicAnchorPath(link);
          if (path && elsewhere(path)) learn(path);
        }
      });
    };
    scanLinks.current();
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const destination = publicAnchorPath(event.target);
      if (!destination) return;
      event.preventDefault();
      push(destination);
    };
    const prefetch = (event: PointerEvent | FocusEvent) => {
      const destination = publicAnchorPath(event.target);
      if (!destination || !elsewhere(destination)) return;
      if (event.type === 'focusin') {
        if (event.target instanceof Element && event.target.matches(':focus-visible')) intent.focus(destination);
      }
      else if ((event as PointerEvent).pointerType !== 'touch') intent.hover(destination);
    };
    // A primary press starts the route about 100 ms before its click. A touch
    // may begin a scroll, so it prepares only a menu link that is not already
    // learning its route: a full request queued behind that route tree would
    // start after the click and download the page twice.
    const press = (event: PointerEvent) => {
      if (event.button !== 0 || !event.isPrimary || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const destination = publicAnchorPath(event.target);
      if (!destination || !elsewhere(destination)) return;
      if (event.pointerType === 'touch' && (learned.has(destination.split('#')[0])
        || !(event.target as Element).closest('a[href]')?.matches(VIEWPORT_LINKS))) return;
      intent.press(destination);
    };
    const leave = (event: PointerEvent) => {
      if (publicAnchorPath(event.target) !== publicAnchorPath(event.relatedTarget)) intent.cancel();
    };
    document.addEventListener('click', click);
    document.addEventListener('pointerover', prefetch);
    document.addEventListener('pointerdown', press);
    document.addEventListener('focusin', prefetch);
    document.addEventListener('pointerout', leave);
    window.addEventListener('pagehide', intent.cancel);
    window.addEventListener('popstate', supersede);
    return () => {
      dispose();
      disposeNavigator();
      responses.dispose();
      intent.dispose();
      viewport.dispose();
      if (scheduled !== undefined) cancelIdle(scheduled);
      scanLinks.current = null;
      supersede();
      document.removeEventListener('click', click);
      document.removeEventListener('pointerover', prefetch);
      document.removeEventListener('pointerdown', press);
      document.removeEventListener('focusin', prefetch);
      document.removeEventListener('pointerout', leave);
      window.removeEventListener('pagehide', intent.cancel);
      window.removeEventListener('popstate', supersede);
    };
  }, [router, startTransition, onNavigationStart]);
  useEffect(() => {
    scanLinks.current?.();
    // Keyboard and screen reader users continue at the new page, not at the link
    // they left (the persistent menu keeps it focused otherwise). Back keeps focus.
    // Focus the reader moved elsewhere meanwhile (the header search) stays.
    const target = focusOnCommit.current;
    focusOnCommit.current = null;
    const active = document.activeElement;
    if (target && routeKey && target.pathname.replace(/\/+$/, '') === routeKey.replace(/\/+$/, '')
      && (!active || active === document.body || active === target.from || !target.from?.isConnected)) {
      document.getElementById('main-content')?.focus({ preventScroll: true });
    }
  }, [routeKey]);
  return <NavigationProgress pending={pending || joining} />;
}

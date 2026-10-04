'use client';

import { useEffect, useState, type ComponentProps, type ComponentType, type ReactElement } from 'react';
import PaywallPending from '@/src/components/PaywallPending';
import { hasAuthSessionHint } from '@/src/modules/identity/public';

// The paid Battlegrounds views, with their stylesheets, load only once the
// viewer may open them: a guest downloads the gate and nothing of the view.
// The server never renders them (access is unknown there), so no HTML
// changes. A loaded module is kept and rendered in the same render that
// grants access; there is no Suspense boundary, whose reveal throttle would
// hold an already loaded view back by about 300 ms. While the module still
// loads, the gate's reserved height stays.
type BattlegroundsModule = typeof import('@/src/features/Battlegrounds');
type BgLibraryModule = typeof import('@/src/features/BgLibrary');

function moduleLoader<T>(load: () => Promise<T>) {
  let loaded: T | null = null;
  let pending: Promise<T> | null = null;
  return {
    current: () => loaded,
    load: () => {
      pending ??= load().then(module => { loaded = module; return module; }, error => { pending = null; throw error; });
      return pending;
    },
  };
}

const battlegrounds = moduleLoader<BattlegroundsModule>(() => import('@/src/features/Battlegrounds'));
const bgLibrary = moduleLoader<BgLibraryModule>(() => import('@/src/features/BgLibrary'));
export const loadBattlegrounds = battlegrounds.load;
export const loadBgLibrary = bgLibrary.load;

function useLoadedModule<T>(loader: { current: () => T | null; load: () => Promise<T> }): T | null {
  const [state, setState] = useState<{ module: T | null; error: unknown }>(() => ({ module: loader.current(), error: null }));
  useEffect(() => {
    if (state.module) return;
    let active = true;
    loader.load().then(module => { if (active) setState({ module, error: null }); },
      error => { if (active) setState({ module: null, error }); });
    return () => { active = false; };
  }, [loader, state.module]);
  // A chunk that cannot load reaches the route's error boundary, which offers a reload.
  if (state.error) throw state.error;
  return state.module;
}

const pending = <PaywallPending>Загружаем раздел…</PaywallPending>;

// The view keeps the gate's height around its own first, data-less render,
// so the footer does not jump into view and out again when it mounts.
function render<P extends object>(View: ComponentType<P> | undefined, props: P): ReactElement {
  return View ? <div className="arena-paid-view"><View {...props} /></div> : pending;
}

export function BattlegroundHeroesRoute(props: ComponentProps<BattlegroundsModule['BattlegroundHeroesRoute']>) {
  return render(useLoadedModule(battlegrounds)?.BattlegroundHeroesRoute, props);
}

export function BattlegroundTierList() {
  return render(useLoadedModule(battlegrounds)?.BattlegroundTierList, {});
}

export function BattlegroundTierBuilderEmbed() {
  return render(useLoadedModule(battlegrounds)?.BattlegroundTierBuilderEmbed, {});
}

export function BattlegroundStrategyBuilderEmbed() {
  return render(useLoadedModule(battlegrounds)?.BattlegroundStrategyBuilderEmbed, {});
}

export function BgLibrary(props: ComponentProps<BgLibraryModule['default']>) {
  return render(useLoadedModule(bgLibrary)?.default, props);
}

/**
 * A remembered session is probably a subscriber's: start the view's download
 * while the access check runs, so it is ready when the check finishes.
 * The hint grants nothing; the page still renders the view only when allowed.
 */
export function usePaidViewPrefetch(load: () => Promise<unknown>) {
  useEffect(() => {
    if (hasAuthSessionHint()) load().catch(() => { /* The view retries when it renders. */ });
  }, [load]);
}

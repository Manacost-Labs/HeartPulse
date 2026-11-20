'use client';

import type { ComponentProps, ComponentType, ReactElement } from 'react';
import PaywallPending from '@/src/components/PaywallPending';
import { moduleLoader, useLoadedModule } from './lazyPaidView';

export { usePaidViewPrefetch } from './lazyPaidView';

// The paid Battlegrounds views, with their stylesheets, load only once the
// viewer may open them: a guest downloads the gate and nothing of the view.
// The server never renders them (access is unknown there), so no HTML
// changes. A loaded module is kept and rendered in the same render that
// grants access; there is no Suspense boundary, whose reveal throttle would
// hold an already loaded view back by about 300 ms. While the module still
// loads, the gate's reserved height stays.
type BattlegroundsModule = typeof import('@/src/features/Battlegrounds');
type BgLibraryModule = typeof import('@/src/features/BgLibrary');
type TierBuilderModule = typeof import('@/src/features/BattlegroundTierBuilder');
type BgLibraryCatalogModule = typeof import('@/src/features/bgLibraryCatalog');

const battlegrounds = moduleLoader<BattlegroundsModule>(() => import('@/src/features/Battlegrounds'));
const bgLibrary = moduleLoader<BgLibraryModule>(() => import('@/src/features/BgLibrary'));
// A listing page keeps its own view and needs only the protected catalog's reader, not the library views.
const bgLibraryCatalog = moduleLoader<BgLibraryCatalogModule>(() => import('@/src/features/bgLibraryCatalog'));
// The tier builder and its VaryloUI tier list are a chunk of their own: no other view needs them.
const tierBuilder = moduleLoader<TierBuilderModule>(() => import('@/src/features/BattlegroundTierBuilder'));
export const loadBattlegrounds = battlegrounds.load;
export const loadBgLibrary = bgLibrary.load;
export const loadBgLibraryCatalog = bgLibraryCatalog.load;
export const loadBattlegroundTierBuilder = tierBuilder.load;

const pending = <PaywallPending plate={false}>Загружаем раздел…</PaywallPending>;

// The view keeps the gate's height around its own first, data-less render,
// so the footer does not jump into view and out again when it mounts.
function render<P extends object>(View: ComponentType<P> | undefined, props: P): ReactElement {
  return View ? <div className="arena-paid-view"><View {...props} /></div> : pending;
}

const idle = { current: () => null, load: () => new Promise<null>(() => undefined) };

/**
 * Whether the Battlegrounds module is loaded. Nothing is downloaded until `enabled` (the viewer may open the
 * paid views), so a page with an open part keeps it on screen until the paid view can replace it in one render.
 */
export function useBattlegroundsModuleLoaded(enabled: boolean): boolean {
  return useLoadedModule<BattlegroundsModule | null>(enabled ? battlegrounds : idle) !== null;
}

/**
 * The library's protected catalog (a resource for `useBattlegroundLibraryData`) once the module is loaded and
 * `enabled`; `undefined` before. A listing page renders its one view throughout and only swaps its cards to it.
 */
export function useBgLibraryCatalogResource(enabled: boolean): BgLibraryCatalogModule['bgLibraryCatalogResource'] | undefined {
  return useLoadedModule<BgLibraryCatalogModule | null>(enabled ? bgLibraryCatalog : idle)?.bgLibraryCatalogResource;
}

/** Whether the library module is loaded: the same rule as `useBattlegroundsModuleLoaded` for the library views. */
export function useBgLibraryModuleLoaded(enabled: boolean): boolean {
  return useLoadedModule<BgLibraryModule | null>(enabled ? bgLibrary : idle) !== null;
}

export function BattlegroundHeroesRoute(props: ComponentProps<BattlegroundsModule['BattlegroundHeroesRoute']>) {
  return render(useLoadedModule(battlegrounds)?.BattlegroundHeroesRoute, props);
}

export function BattlegroundTierList(props: ComponentProps<BattlegroundsModule['BattlegroundTierList']>) {
  return render(useLoadedModule(battlegrounds)?.BattlegroundTierList, props);
}

export function BattlegroundTierBuilderEmbed() {
  return render(useLoadedModule(tierBuilder)?.default, {});
}

export function BattlegroundStrategyBuilderEmbed() {
  return render(useLoadedModule(battlegrounds)?.BattlegroundStrategyBuilderEmbed, {});
}

export function BgLibrary(props: ComponentProps<BgLibraryModule['default']>) {
  return render(useLoadedModule(bgLibrary)?.default, props);
}

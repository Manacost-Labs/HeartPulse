import type { LucideIcon } from 'lucide-react';
import type { SubscriptionEntitlementKey } from '../../modules/subscriptions/public';

export type RouteGroup =
  | 'home'
  | 'top'
  | 'standard'
  | 'arena'
  | 'bg-primary'
  | 'bg-builder'
  | 'misc'
  | 'footer'
  | 'admin';

export type RouteEntitlement = SubscriptionEntitlementKey;

type RoutePreloadPolicy = 'none' | 'intent';
export type RouteModuleLoader = () => Promise<unknown>;

export type ApplicationRouteSurfaceDefinition = {
  id: string;
  label: string;
  icon: LucideIcon;
  path: `/${string}`;
  group: RouteGroup;
  entitlement: RouteEntitlement | null;
  loader: RouteModuleLoader;
  preload: RoutePreloadPolicy;
  adminOnly?: boolean;
};

type RouteSurfaceCore = Omit<ApplicationRouteSurfaceDefinition, 'loader' | 'preload'>;

export function defineRouteSurface<
  const Surface extends RouteSurfaceCore,
  const Loader extends RouteModuleLoader,
>(
  surface: Surface,
  loader: Loader,
  preload: RoutePreloadPolicy = 'intent',
): Surface & { loader: Loader; preload: RoutePreloadPolicy } {
  return {
    ...surface,
    loader,
    preload,
  };
}

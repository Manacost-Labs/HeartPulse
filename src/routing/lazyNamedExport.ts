import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export function lazyNamedExport<
  T extends Record<string, ComponentType<never>>,
  K extends keyof T,
>(loader: () => Promise<T>, name: K): LazyExoticComponent<T[K]> {
  return lazy(() => loader().then(module => ({ default: module[name] })));
}

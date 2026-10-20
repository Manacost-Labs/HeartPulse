/// <reference types="react/canary" />
import { Component, ViewTransition, addTransitionType, type ReactNode } from 'react';

/** Marks a route navigation; other transitions (filters, tabs, Back, refresh) never animate the content box. */
const ROUTE_TRANSITION_TYPE = 'route-navigation';
const routeNavigationOnly = { [ROUTE_TRANSITION_TYPE]: 'route-content', default: 'none' };

/** Call inside the navigation's transition, before the router update. Reduced motion keeps navigation immediate. */
export function markRouteTransition(): void {
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) addTransitionType(ROUTE_TRANSITION_TYPE);
}

/**
 * The page's content box. On a route navigation the outgoing box fades out
 * where the reader saw it, then the destination fades in; the frame around
 * it changes without motion (`RouteTransition.css`).
 */
export function RouteContent({ children }: { children: ReactNode }) {
  return <ViewTransition name="route-content" share={routeNavigationOnly} enter={routeNavigationOnly}
    exit={routeNavigationOnly} default="none">{children}</ViewTransition>;
}

function contentTop(): number | null {
  return document.querySelector('[data-route-content]')?.getBoundingClientRect().top ?? null;
}

/**
 * Persists across route commits. The outgoing snapshot is placed at the new
 * box, which the router has already scrolled to the top; `--route-old-shift`
 * moves it back to where the reader saw it. Children keep their identity.
 */
export class RouteTransition extends Component<{ routeKey: string; children: ReactNode }> {
  getSnapshotBeforeUpdate(previous: Readonly<{ routeKey: string }>): number | null {
    return previous.routeKey === this.props.routeKey ? null : contentTop();
  }

  componentDidUpdate(_previous: unknown, _state: unknown, outgoingTop: number | null) {
    if (outgoingTop === null) return;
    const shift = outgoingTop - (contentTop() ?? outgoingTop);
    document.documentElement.style.setProperty('--route-old-shift', `${Math.round(shift)}px`);
  }

  render() { return this.props.children; }
}

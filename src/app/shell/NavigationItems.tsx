import type { CSSProperties } from 'react';
import { ChevronDown } from 'lucide-react';
import { canonicalPagePath } from '../routing/canonicalPagePath';
import { NAVIGATION_MODES, type NavigationModeId } from '../routing/navigationData';
import type { TABS, TabId } from '../routing/navigationRoutes';
import { MODE_EMBLEM_SIZE, NavigationIcon, modeBannerSrcSet, modeFaceSrc } from './NavigationIcon';
import { isPlainNavigationClick } from '../routing/isPlainNavigationClick';

/** A banner card is 200 px wide in the desktop panel and about 170 px in the drawer's two columns. */
const MODE_CARD_SIZES = '(min-width: 1024px) 200px, 170px';
const MODE_CARD_EMBLEM_SIZE = 44;

export type NavigationRoute = (typeof TABS)[number];
export type NavigationGroup = NavigationModeId;
export { NAV_ICON_SIZE } from './NavigationIcon';

/** A short honest marker next to a menu item, e.g. «Новый» for a patch published since the last visit. */
export type NavigationBadges = Partial<Record<TabId, { label: string; title: string }>>;

type NavigationRouteLinksProps = {
  routes: readonly NavigationRoute[];
  activeTab: TabId;
  variant: 'mobile' | 'sidebar';
  /** Mode name the compact rail's tooltip adds, so the two «Тир-лист» items stay distinguishable. */
  context?: string;
  badges?: NavigationBadges;
  onNavigate: (tab: TabId) => void;
};

export function NavigationRouteLinks({ routes, activeTab, variant, context, badges, onNavigate }: NavigationRouteLinksProps) {
  return routes.map(tab => {
    const badge = badges?.[tab.id];
    return (
      <a
        key={tab.id}
        href={canonicalPagePath(tab.path)}
        onClick={event => {
          if (!isPlainNavigationClick(event)) return;
          event.preventDefault();
          onNavigate(tab.id);
        }}
        aria-current={activeTab === tab.id ? 'page' : undefined}
        data-nav-link=""
        data-nav-tip={context ? `${tab.label} · ${context}` : tab.label}
        data-variant={variant}
        className="hp-nav-link"
      >
        <span className="hp-nav-icon" aria-hidden="true"><NavigationIcon id={tab.id} /></span>
        <span className="hp-nav-label">{tab.label}</span>
        {badge && <span className="arena-nav-badge" title={badge.title}>{badge.label}</span>}
      </a>
    );
  });
}

/**
 * One list per mode, all in the server HTML. CSS shows the list of the page's mode
 * (`data-page-mode` of the tree) or, on a page without a mode, the last chosen one
 * (`data-nav-mode` of `<html>`, set before the first paint), so no list flashes.
 */
export function NavigationModeLists({ routesOf, ...links }: Omit<NavigationRouteLinksProps, 'routes' | 'context'> & {
  routesOf: Record<NavigationModeId, readonly NavigationRoute[]>;
}) {
  return NAVIGATION_MODES.map(mode => (
    <div key={mode.id} className="hp-nav-list" data-for={mode.id} data-variant={links.variant}>
      <NavigationRouteLinks routes={routesOf[mode.id]} context={mode.label} {...links} />
    </div>
  ));
}

/**
 * The mode switch: a native `<details>`, so the banners open without JavaScript
 * and before hydration. Its button is a small banner: the art of the current
 * mode, the emblem, «Режим» and the mode's name. Each banner of the panel is a
 * link to the mode's main page. The face of the button and the «Текущий» badge
 * exist once per mode and CSS shows the current one, in step with the lists;
 * the art of a face that is not shown is `loading="lazy"` in a `display: none`
 * box, so the browser fetches only the visible one.
 */
export function NavigationModePicker({ variant, mode, onNavigate }: {
  variant: 'mobile' | 'sidebar';
  mode: NavigationModeId;
  onNavigate: (tab: TabId) => void;
}) {
  return (
    <details className="hp-mode" data-variant={variant}>
      <summary className="hp-mode-button" data-nav-tip="Режим: выбрать формат">
        {NAVIGATION_MODES.map(item => {
          const face = modeFaceSrc(item.id);
          return (
            <span key={item.id} className="hp-mode-face" data-for={item.id}>
              {face && <img className="hp-mode-face-art" src={face} width={520} height={160} loading="lazy" decoding="async" alt="" />}
              <span className="hp-mode-emblem" aria-hidden="true"><NavigationIcon id={`mode-${item.id}`} size={MODE_EMBLEM_SIZE} /></span>
              <span className="hp-mode-copy">
                <span className="hp-mode-kicker">Режим</span>
                <span className="hp-mode-name">{item.label}</span>
              </span>
            </span>
          );
        })}
        <span className="hp-mode-chevron" aria-hidden="true"><ChevronDown size={18} strokeWidth={2.6} /></span>
      </summary>
      <div className="hp-mode-panel" role="group" aria-label="Режимы сайта">
        {NAVIGATION_MODES.map((item, index) => {
          const srcSet = modeBannerSrcSet(item.id);
          return (
            <a
              key={item.id}
              href={canonicalPagePath(item.path)}
              className="hp-mode-card"
              data-mode={item.id}
              data-mode-card=""
              aria-current={item.id === mode ? 'true' : undefined}
              style={{ '--i': index } as CSSProperties}
              onClick={event => {
                if (!isPlainNavigationClick(event)) return;
                event.preventDefault();
                onNavigate(item.homeTab as TabId);
              }}
            >
              <span className="hp-mode-art" aria-hidden="true">
                {srcSet && <img src={`/menu/banners/${item.id}-440.webp`} srcSet={srcSet} sizes={MODE_CARD_SIZES} width={440} height={616} loading="lazy" decoding="async" alt="" />}
              </span>
              <span className="hp-mode-badge" data-for={item.id}>Текущий</span>
              <span className="hp-mode-card-text">
                <span className="hp-mode-card-emblem" aria-hidden="true"><NavigationIcon id={`mode-${item.id}`} size={MODE_CARD_EMBLEM_SIZE} /></span>
                <strong>{item.label}</strong>
                <span className="hp-mode-card-desc">{item.description}</span>
              </span>
            </a>
          );
        })}
      </div>
    </details>
  );
}

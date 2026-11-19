import type { CSSProperties } from 'react';
import { ChevronDown } from 'lucide-react';
import { canonicalPagePath } from '../routing/canonicalPagePath';
import { NAVIGATION_MODES, type NavigationModeId } from '../routing/navigationData';
import type { TabId } from '../routing/navigationRoutes';
import type { MenuItemId } from '../routing/navigationPlace';
import { MODE_EMBLEM_SIZE, NavigationIcon, modeBannerSrc, modeBannerSrcSet, modeFaceSrc } from './NavigationIcon';
import { isPlainNavigationClick } from '../routing/isPlainNavigationClick';

/**
 * What CSS needs to show one mode at a time without naming the modes: `data-for`
 * (which mode this element belongs to), `data-page-current` (it is the mode of the
 * page, known on the server) and `data-default` (the first mode, shown when the page
 * has none and nothing is remembered). A new entry of `NAVIGATION_MODES` needs no
 * change here; PublicNavigation.css lists the remembered-mode selectors once.
 */
function modeMarks(id: NavigationModeId, pageMode: NavigationModeId | null) {
  return {
    'data-for': id,
    'data-page-current': id === pageMode ? '' : undefined,
    'data-default': id === NAVIGATION_MODES[0].id ? '' : undefined,
  };
}

/** A banner card is 200 px wide in the desktop panel (182 px at 1360 px); the drawer shows the wide strip instead. */
const MODE_CARD_SIZES = '200px';
const MODE_CARD_EMBLEM_SIZE = 44;

/** An item of a menu list: a route of the site, or a Wild item, which borrows its icon and badge from its twin. */
export type NavigationRoute = { id: MenuItemId; label: string; path: string; twin?: TabId };
export type NavigationGroup = NavigationModeId;
export { NAV_ICON_SIZE } from './NavigationIcon';

/** A short honest marker next to a menu item, e.g. «Новый» for a patch published since the last visit. */
export type NavigationBadges = Partial<Record<TabId, { label: string; title: string }>>;

type NavigationRouteLinksProps = {
  routes: readonly NavigationRoute[];
  activeItem: MenuItemId;
  variant: 'mobile' | 'sidebar';
  /** Mode name the compact rail's tooltip adds, so the two «Тир-лист» items stay distinguishable. */
  context?: string;
  badges?: NavigationBadges;
  onNavigate: (item: MenuItemId) => void;
};

export function NavigationRouteLinks({ routes, activeItem, variant, context, badges, onNavigate }: NavigationRouteLinksProps) {
  return routes.map(tab => {
    const art = tab.twin ?? tab.id;
    const badge = badges?.[art as TabId];
    return (
      <a
        key={tab.id}
        href={canonicalPagePath(tab.path)}
        onClick={event => {
          if (!isPlainNavigationClick(event)) return;
          event.preventDefault();
          onNavigate(tab.id);
        }}
        aria-current={activeItem === tab.id ? 'page' : undefined}
        data-nav-link=""
        data-nav-tip={context ? `${tab.label} · ${context}` : tab.label}
        data-variant={variant}
        className="hp-nav-link"
      >
        <span className="hp-nav-icon" aria-hidden="true"><NavigationIcon id={art} /></span>
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
export function NavigationModeLists({ routesOf, pageMode, ...links }: Omit<NavigationRouteLinksProps, 'routes' | 'context'> & {
  routesOf: Record<NavigationModeId, readonly NavigationRoute[]>;
  pageMode: NavigationModeId | null;
}) {
  return NAVIGATION_MODES.map(mode => (
    <div key={mode.id} className="hp-nav-list" {...modeMarks(mode.id, pageMode)} data-variant={links.variant}>
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
export function NavigationModePicker({ variant, mode, pageMode, onNavigate }: {
  variant: 'mobile' | 'sidebar';
  mode: NavigationModeId;
  pageMode: NavigationModeId | null;
  onNavigate: (item: MenuItemId) => void;
}) {
  return (
    <details className="hp-mode" data-variant={variant}>
      <summary className="hp-mode-button" data-nav-tip="Режим: выбрать формат">
        {NAVIGATION_MODES.map(item => {
          const face = modeFaceSrc(item.id);
          return (
            <span key={item.id} className="hp-mode-face" {...modeMarks(item.id, pageMode)}>
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
      <div className="hp-mode-panel" role="group" aria-label="Режимы сайта" style={{ '--modes': NAVIGATION_MODES.length } as CSSProperties}>
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
                onNavigate(item.homeTab as MenuItemId);
              }}
            >
              <span className="hp-mode-art" aria-hidden="true">
                {srcSet && <img className="hp-mode-art-tall" src={modeBannerSrc(item.id)} srcSet={srcSet} sizes={MODE_CARD_SIZES} width={440} height={616} loading="lazy" decoding="async" alt="" />}
                {srcSet && <img className="hp-mode-art-wide" src={modeFaceSrc(item.id)} width={520} height={160} loading="lazy" decoding="async" alt="" />}
              </span>
              <span className="hp-mode-badge" {...modeMarks(item.id, pageMode)}>Текущий</span>
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

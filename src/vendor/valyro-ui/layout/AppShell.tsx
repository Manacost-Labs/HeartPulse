'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentPropsWithRef, type MouseEvent, type ReactNode } from 'react';
import { MenuIcon, PanelLeftIcon } from '../icons';
import {
  composeHandlers,
  cx,
  mergeRefs,
  useControllableState,
  useDismissableLayer,
  useFocusTrap,
  useLatest,
  usePresence,
} from '../primitives';
import { IconButton, type IconButtonProps } from '../basic/IconButton';
import './AppShell.css';
import { withRef, useId, useLayoutEffect, inertAttr } from '../primitives/react-compat';

export interface AppShellState {
  /** The shell is narrower than `mobileBreakpoint`: the sidebar is an off-canvas drawer. */
  mobile: boolean;
  /** The sidebar shows as an icon rail. Always false on mobile, where the drawer shows it in full. */
  sidebarCollapsed: boolean;
  /** The mobile drawer is open. */
  sidebarOpen: boolean;
  /** The aside is visible (inline, or floating over the main area when the shell is narrow). */
  asideOpen: boolean;
  /** The shell is narrower than `asideBreakpoint`: the aside floats over the main area. */
  asideFloating: boolean;
  /** Collapses / expands the sidebar on desktop; opens / closes the drawer on mobile. */
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleAside: () => void;
  setAsideOpen: (open: boolean) => void;
  /** Element ids, for aria-controls on your own toggles. */
  sidebarId: string;
  asideId: string;
  mainId: string;
}

export interface AppShellLabels {
  skipToContent: string;
  /** Accessible name of the sidebar drawer on mobile. */
  navigation: string;
  /** Accessible name of the aside panel. */
  aside: string;
  expandSidebar: string;
  collapseSidebar: string;
  openNavigation: string;
}

export const defaultAppShellLabels: AppShellLabels = {
  skipToContent: 'Skip to content',
  navigation: 'Navigation',
  aside: 'Details',
  expandSidebar: 'Expand sidebar',
  collapseSidebar: 'Collapse sidebar',
  openNavigation: 'Open navigation',
};

type Slot = ReactNode | ((shell: AppShellState) => ReactNode);

export interface AppShellProps extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  /** Navigation column, e.g. a `<Sidebar>`. A function receives the shell state (`sidebarCollapsed`, `mobile`…). */
  sidebar?: Slot;
  /** Top bar above the main area; stays put while the main area scrolls. */
  header?: Slot;
  /** Optional panel after the main area (details, inspector, settings). */
  aside?: Slot;
  /** Main content; it scrolls on its own. */
  children?: Slot;
  /** Bar under the main area that stays put while it scrolls, e.g. a chat composer or bulk actions. */
  footer?: Slot;
  /** Icon-rail sidebar. Pair with `onSidebarCollapsedChange` (and storage) to remember it. */
  sidebarCollapsed?: boolean;
  defaultSidebarCollapsed?: boolean;
  onSidebarCollapsedChange?: (collapsed: boolean) => void;
  /** Whether the aside shows inline on wide shells. */
  asideOpen?: boolean;
  defaultAsideOpen?: boolean;
  onAsideOpenChange?: (open: boolean) => void;
  /** Below this shell width (px) the sidebar becomes an off-canvas drawer. Measured on the shell, not the window. */
  mobileBreakpoint?: number;
  /** Below this shell width (px) the aside floats over the main area instead of taking a column. */
  asideBreakpoint?: number;
  /** Id of the main element, the skip link's target. */
  mainId?: string;
  labels?: Partial<AppShellLabels>;
}

export interface AppShellSidebarToggleProps extends Omit<IconButtonProps, 'icon' | 'label'> {
  /** Defaults to a panel icon, or a menu icon on mobile. */
  icon?: ReactNode;
  /** Defaults to the shell's label for the current state. */
  label?: string;
}

interface ShellContextValue {
  state: AppShellState;
  labels: AppShellLabels;
  hasSidebar: boolean;
}

const ShellContext = createContext<ShellContextValue | null>(null);

/** State and actions of the surrounding `AppShell` (for toggles and other controls inside it). */
export function useAppShell(): AppShellState {
  const shell = useContext(ShellContext);
  if (!shell) throw new Error('useAppShell must be used inside <AppShell>.');
  return shell.state;
}

const render = (slot: Slot, state: AppShellState) => (typeof slot === 'function' ? slot(state) : slot);

/** Stays on screen while the slide-out animation plays (Glass --ui-duration-slow is 380ms). */
const EXIT_MS = 400;

export const AppShell = withRef(function AppShell({
  sidebar,
  header,
  aside,
  children,
  footer,
  sidebarCollapsed: collapsedProp,
  defaultSidebarCollapsed = false,
  onSidebarCollapsedChange,
  asideOpen: asideOpenProp,
  defaultAsideOpen = true,
  onAsideOpenChange,
  mobileBreakpoint = 768,
  asideBreakpoint = 1200,
  mainId: mainIdProp,
  labels: labelsProp,
  className,
  ref,
  ...rest
}: AppShellProps) {
  const labels = { ...defaultAppShellLabels, ...labelsProp };
  const baseId = useId();
  const mainId = mainIdProp ?? `${baseId}-main`;
  const sidebarId = `${baseId}-sidebar`;
  const asideId = `${baseId}-aside`;

  const rootRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLElement>(null);

  const [collapsed, setCollapsed] = useControllableState({
    value: collapsedProp,
    defaultValue: defaultSidebarCollapsed,
    onChange: onSidebarCollapsedChange,
  });
  const [asideInline, setAsideInline] = useControllableState({
    value: asideOpenProp,
    defaultValue: defaultAsideOpen,
    onChange: onAsideOpenChange,
  });
  /** Transient: the drawer and the floating aside start closed and close when the shell widens. */
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [asideSheetOpen, setAsideSheetOpen] = useState(false);
  /** The inline aside animates only once toggled, not when the page loads with it open. */
  const [asideMotion, setAsideMotion] = useState(false);

  // Breakpoints follow the shell's own width, so a shell inside a smaller frame adapts too.
  const width = useRef<number | null>(null);
  const [size, setSize] = useState<{ measured: boolean; mobile: boolean; asideFloating: boolean }>({
    measured: false,
    mobile: false,
    asideFloating: false,
  });
  const latestBreakpoints = useLatest({ mobileBreakpoint, asideBreakpoint });

  const applyWidth = useCallback((next: number) => {
    width.current = next;
    const { mobileBreakpoint: m, asideBreakpoint: a } = latestBreakpoints.current;
    const mobile = next < m;
    const asideFloating = next < a;
    setSize((prev) =>
      prev.measured && prev.mobile === mobile && prev.asideFloating === asideFloating
        ? prev
        : { measured: true, mobile, asideFloating },
    );
  }, [latestBreakpoints]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    applyWidth(root.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => applyWidth(entries[0].contentRect.width));
    observer.observe(root);
    return () => observer.disconnect();
  }, [applyWidth]);

  useLayoutEffect(() => {
    if (width.current !== null) applyWidth(width.current);
  }, [mobileBreakpoint, asideBreakpoint, applyWidth]);

  // A shell embedded in a page that already has a main landmark (a docs preview) must not add a second one.
  const [nested, setNested] = useState(false);
  useLayoutEffect(() => {
    setNested(!!rootRef.current?.parentElement?.closest('main, [role="main"]'));
  }, []);

  const { mobile, asideFloating } = size;
  const hasSidebar = sidebar != null;
  const hasAside = aside != null;

  // Leaving the narrow layout closes the transient overlays.
  if (!mobile && drawerOpen) setDrawerOpen(false);
  if (!asideFloating && asideSheetOpen) setAsideSheetOpen(false);

  const drawerActive = mobile && drawerOpen && hasSidebar;
  const sheetActive = asideFloating && asideSheetOpen && hasAside;
  const drawer = usePresence(drawerActive, EXIT_MS);
  const sheet = usePresence(sheetActive, EXIT_MS);
  const column = usePresence(!asideFloating && hasAside && asideInline, EXIT_MS);

  const openDrawer = useCallback((open: boolean) => {
    setDrawerOpen(open);
    if (open) setAsideSheetOpen(false);
  }, []);

  const state = useMemo<AppShellState>(() => {
    const asideOpen = asideFloating ? asideSheetOpen : asideInline;
    const setAsideOpen = (open: boolean) => {
      if (asideFloating) {
        setAsideSheetOpen(open);
        if (open) setDrawerOpen(false);
      } else {
        setAsideMotion(true);
        setAsideInline(open);
      }
    };
    return {
      mobile,
      sidebarCollapsed: !mobile && collapsed,
      sidebarOpen: mobile && drawerOpen,
      asideOpen: hasAside && asideOpen,
      asideFloating,
      toggleSidebar: () => (mobile ? openDrawer(!drawerOpen) : setCollapsed(!collapsed)),
      setSidebarCollapsed: setCollapsed,
      setSidebarOpen: openDrawer,
      toggleAside: () => setAsideOpen(!asideOpen),
      setAsideOpen,
      sidebarId,
      asideId,
      mainId,
    };
  }, [mobile, collapsed, drawerOpen, asideFloating, asideSheetOpen, asideInline, hasAside, setCollapsed, setAsideInline, openDrawer, sidebarId, asideId, mainId]);

  // Mobile drawer: modal. Focus moves in and is trapped; Escape or a press on the scrim closes it.
  useFocusTrap(drawerRef, drawerActive);
  useDismissableLayer({ enabled: drawerActive, refs: [drawerRef], onDismiss: () => setDrawerOpen(false) });

  // Floating aside: non-modal. Escape or a press outside closes it; toggles pointing at it count as inside.
  const asideTogglesRef = useMemo(
    () => ({
      get current(): Element | null {
        return rootRef.current?.querySelector(`[aria-controls="${CSS.escape(asideId)}"]`) ?? null;
      },
    }),
    [asideId],
  );
  useDismissableLayer({ enabled: sheetActive, refs: [asideRef, asideTogglesRef], onDismiss: () => closeSheet() });
  const sheetReturnFocus = useRef<HTMLElement | null>(null);
  const closeSheet = () => {
    setAsideSheetOpen(false);
    const target = sheetReturnFocus.current;
    sheetReturnFocus.current = null;
    if (target?.isConnected && asideRef.current?.contains(document.activeElement)) target.focus({ preventScroll: true });
  };
  useEffect(() => {
    const panel = asideRef.current;
    if (!sheetActive || !panel) return;
    sheetReturnFocus.current = document.activeElement as HTMLElement | null;
    panel.focus({ preventScroll: true });
  }, [sheetActive]);

  const skipToMain = (event: MouseEvent<HTMLAnchorElement>) => {
    // Hash routers treat "#id" as a route, so focus the target instead of following the link.
    event.preventDefault();
    mainRef.current?.focus();
    mainRef.current?.scrollIntoView({ block: 'nearest' });
  };

  const context = useMemo<ShellContextValue>(() => ({ state, labels, hasSidebar }), [state, labels, hasSidebar]);
  const sidebarHidden = mobile && !drawer.isMounted;
  const asidePresence = asideFloating ? sheet : column;

  return (
    <ShellContext.Provider value={context}>
      <div
        {...rest}
        ref={mergeRefs(rootRef, ref)}
        className={cx('ui-app-shell', className)}
        data-measured={size.measured || undefined}
        data-mobile={mobile || undefined}
        data-sidebar={hasSidebar ? (state.sidebarCollapsed ? 'collapsed' : 'expanded') : undefined}
        data-aside-floating={asideFloating || undefined}
      >
        <a className="ui-app-shell__skip" href={`#${mainId}`} onClick={skipToMain}>
          {labels.skipToContent}
        </a>

        {hasSidebar && mobile && drawer.isMounted && (
          <div className="ui-app-shell__scrim" data-state={drawer.state} aria-hidden="true" />
        )}
        {hasSidebar && (
          <div
            ref={drawerRef}
            id={sidebarId}
            className="ui-app-shell__sidebar"
            data-state={mobile ? drawer.state : undefined}
            hidden={sidebarHidden}
            role={mobile ? 'dialog' : undefined}
            aria-modal={mobile ? true : undefined}
            aria-label={mobile ? labels.navigation : undefined}
            tabIndex={mobile ? -1 : undefined}
          >
            {render(sidebar, state)}
          </div>
        )}

        <div className="ui-app-shell__body" inert={inertAttr(drawerActive || undefined)}>
          {header != null && <header className="ui-app-shell__header">{render(header, state)}</header>}
          <div className="ui-app-shell__frame">
            <div className="ui-app-shell__column">
              {/* role instead of <main>: dropping the landmark when nested must not remount the content. */}
              <div ref={mainRef} id={mainId} role={nested ? undefined : 'main'} className="ui-app-shell__main" tabIndex={-1}>
                {render(children, state)}
              </div>
              {footer != null && <div className="ui-app-shell__footer">{render(footer, state)}</div>}
            </div>
            {hasAside && (
              <aside
                ref={asideRef}
                id={asideId}
                className="ui-app-shell__aside"
                aria-label={labels.aside}
                data-state={asidePresence.state}
                data-motion={asideFloating || asideMotion || undefined}
                hidden={!asidePresence.isMounted}
                tabIndex={asideFloating ? -1 : undefined}
              >
                <div className="ui-app-shell__aside-inner">{render(aside, state)}</div>
              </aside>
            )}
          </div>
        </div>
      </div>
    </ShellContext.Provider>
  );
});

/** Header button for the sidebar: collapses it to a rail on desktop, opens the drawer on mobile. */
export const AppShellSidebarToggle = withRef(function AppShellSidebarToggle({ icon, label, onClick, ...rest }: AppShellSidebarToggleProps) {
  const shell = useContext(ShellContext);
  if (!shell) throw new Error('AppShellSidebarToggle must be rendered inside <AppShell>.');
  const { state, labels, hasSidebar } = shell;
  if (!hasSidebar) return null;
  const defaultLabel = state.mobile
    ? labels.openNavigation
    : state.sidebarCollapsed
      ? labels.expandSidebar
      : labels.collapseSidebar;
  return (
    <IconButton
      {...rest}
      label={label ?? defaultLabel}
      icon={icon ?? (state.mobile ? <MenuIcon /> : <PanelLeftIcon />)}
      aria-controls={state.sidebarId}
      aria-expanded={state.mobile ? state.sidebarOpen : !state.sidebarCollapsed}
      onClick={composeHandlers(onClick, state.toggleSidebar)}
    />
  );
});

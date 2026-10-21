'use client';

import { useContext, useMemo, useState, type ComponentPropsWithRef } from 'react';
import { PortalContainerContext } from '../primitives/Portal';
import { cx } from '../primitives/utils';
import { ThemeContext, type ThemeMode, type ThemeName } from './ThemeProvider';
import './ThemeScope.css';
import { withRef } from '../primitives/react-compat';

export interface ThemeScopeProps extends ComponentPropsWithRef<'div'> {
  /** Defaults to the enclosing ThemeProvider / ThemeScope theme. */
  theme?: ThemeName;
  /** Defaults to the enclosing mode. */
  mode?: ThemeMode;
  /** Defaults to the enclosing locale. */
  locale?: string;
}

/**
 * Themes a subtree instead of the whole page: a `<div data-theme data-mode>` that paints like a
 * page in that theme (`--ui-page-bg`, text colour and font; override `background` via `className`
 * or `style` for a transparent scope). Menus, dialogs, toasts and other portaled layers opened inside
 * render into a container at the end of the scope, so they get its tokens too.
 *
 * ```tsx
 * <ThemeProvider theme="vercel" mode="dark">        // <html>: the app
 *   <ThemeScope theme="glass" mode="light">         // this subtree only
 *     <Dialog …/>                                   // renders inside the scope, glass-light
 *   </ThemeScope>
 * </ThemeProvider>
 * ```
 *
 * - Nested scopes override outer ones; omitted props inherit from the enclosing theme.
 * - Pass `dir="rtl"` to flip the subtree; layers opened inside follow it.
 * - Overlays are `position: fixed` and are not clipped by the scope, as long as no ancestor creates a
 *   containing block (`transform`, `filter`, `backdrop-filter`, `contain`) — the scope itself never does.
 * - SSR: the wrapper and its attributes render on the server, so there is no flash of the outer theme.
 */
export const ThemeScope = withRef(function ThemeScope({ theme, mode, locale, className, children, ...rest }: ThemeScopeProps) {
  const outer = useContext(ThemeContext);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const resolvedTheme = theme ?? outer.theme;
  const resolvedMode = mode ?? outer.mode;
  const resolvedLocale = locale ?? outer.locale;
  const value = useMemo(
    () => ({ theme: resolvedTheme, mode: resolvedMode, locale: resolvedLocale }),
    [resolvedTheme, resolvedMode, resolvedLocale],
  );

  return (
    <div {...rest} className={cx('ui-theme-scope', className)} data-theme={resolvedTheme} data-mode={resolvedMode}>
      <ThemeContext.Provider value={value}>
        <PortalContainerContext.Provider value={container}>{children}</PortalContainerContext.Provider>
      </ThemeContext.Provider>
      {/* Last child, so layers paint above the scope's content at equal z-index. */}
      <div ref={setContainer} className="ui-theme-scope__layers" />
    </div>
  );
});

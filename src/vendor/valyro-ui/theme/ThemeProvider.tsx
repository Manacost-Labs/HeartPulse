'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { ThemeName } from './themes';
import { useLayoutEffect } from '../primitives/react-compat';

/** A registered theme (see ./themes) or the name of a theme whose CSS the app loads itself. */
export type { ThemeName };
export type ThemeMode = 'light' | 'dark';

interface ThemeContextValue {
  theme: ThemeName;
  mode: ThemeMode;
  /** BCP 47 locale for number/date formatting; undefined = the browser's. */
  locale?: string | undefined;
  /** IANA time zone for dates and times; undefined = the reader's. */
  timeZone?: string | undefined;
}

/** The nearest ThemeProvider / ThemeScope; read it with useTheme(). */
export const ThemeContext = createContext<ThemeContextValue>({ theme: 'vercel', mode: 'light' });

export interface ThemeProviderProps {
  theme?: ThemeName;
  mode?: ThemeMode;
  /** Default locale for every component's number/date formatting (a component's own `locale` prop wins). */
  locale?: string;
  /**
   * Default IANA time zone for every component that prints a date or a time of day, e.g. "Europe/Moscow" (a
   * component's own `timeZone` prop wins). Set it when rendering on the server, so the server and the browser print
   * the same time; undefined = the reader's.
   */
  timeZone?: string;
  children: ReactNode;
}

/**
 * Applies `data-theme` / `data-mode` to <html>, so portaled layers
 * (menus, dialogs, toasts) inherit the same tokens as the page.
 * To theme only part of the page, use ThemeScope.
 */
export function ThemeProvider({ theme = 'vercel', mode = 'light', locale, timeZone, children }: ThemeProviderProps) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.mode = mode;
  }, [theme, mode]);

  const value = useMemo(() => ({ theme, mode, locale, timeZone }), [theme, mode, locale, timeZone]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

/** The locale a component should format with: its own prop, else the provider's, else the browser's (undefined). */
export function useLocale(override?: string) {
  const { locale } = useContext(ThemeContext);
  return override ?? locale;
}

/** The time zone a component should print dates in: its own prop, else the provider's, else the reader's (undefined). */
export function useTimeZone(override?: string) {
  const { timeZone } = useContext(ThemeContext);
  return override ?? timeZone;
}

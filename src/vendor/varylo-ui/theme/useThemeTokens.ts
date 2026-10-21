'use client';

import { useLayoutEffect, useState, type RefObject } from 'react';
import { useTheme } from './ThemeProvider';

/**
 * Reads `--ui-*` tokens that JavaScript needs (SVG geometry, virtualised row heights, whether to draw
 * an arrow) from an element's computed style, so a component follows whatever theme is active without
 * knowing its name. Theme files define the values; components never compare theme names.
 *
 * `fallbacks` maps token names to the values used until the element is laid out (and on the server);
 * keep them equal to the reference (Vercel) theme. Values come back as trimmed strings.
 *
 * Re-reads when the enclosing ThemeProvider / ThemeScope switches theme or mode, and once more on the
 * next frame: ThemeProvider writes the <html> attributes in its own layout effect, which runs after
 * this one on first mount and on every switch.
 *
 * ```ts
 * const t = useThemeTokens(ref, { '--ui-chart-curve': 'linear' });
 * const curve = t['--ui-chart-curve'] === 'monotone' ? 'monotone' : 'linear';
 * ```
 */
export function useThemeTokens<T extends Record<`--${string}`, string>>(ref: RefObject<Element | null>, fallbacks: T): T {
  const { theme, mode } = useTheme();
  const [values, setValues] = useState<T>(fallbacks);
  // The fallbacks object is usually a fresh literal; its content is the real dependency.
  const key = JSON.stringify(fallbacks);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const defaults = JSON.parse(key) as T;
    const read = () => {
      const style = getComputedStyle(element);
      setValues((previous) => {
        let changed = false;
        const next = { ...previous };
        for (const name of Object.keys(defaults) as (keyof T & string)[]) {
          const value = (style.getPropertyValue(name).trim() || defaults[name]) as T[keyof T & string];
          if (value !== previous[name]) {
            next[name] = value;
            changed = true;
          }
        }
        return changed ? next : previous;
      });
    };
    read();
    const frame = requestAnimationFrame(read);
    return () => cancelAnimationFrame(frame);
  }, [ref, key, theme, mode]);

  return values;
}

/** A numeric token such as `4px` or `0.5` as a number; `fallback` when it does not parse. */
export function tokenNumber(value: string, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

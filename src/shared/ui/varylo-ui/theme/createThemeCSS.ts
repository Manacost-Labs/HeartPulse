/*
 * createThemeCSS: turns a handful of brand decisions (accent, grey tint, radius, density, glass
 * material, shadow depth, font) into --ui-* overrides for one base theme, light and dark.
 * Pure and DOM-free, so it also runs on a server or in a build script.
 */
import type { ThemeName } from './ThemeProvider';

export type ThemeDensity = 'compact' | 'default' | 'comfortable';

export interface ThemeCSSOptions {
  /** Base theme the overrides refine. */
  theme: ThemeName;
  /** Brand colour (`#rgb` or `#rrggbb`). Hover, soft, readable-text and on-accent shades are derived for both modes. */
  accent?: string;
  /** Tints every neutral (text, borders, fills) towards an OKLCH hue. `chroma` ≈ 0.01 (zinc) … 0.04 (slate); 0 = pure grey. */
  gray?: { hue: number; chroma: number };
  /** Corner radius multiplier (0–2). Pill buttons stay pills. */
  radius?: number;
  /** `--ui-font-sans` stack. */
  fontSans?: string;
  /** Control heights and spacing scale. */
  density?: ThemeDensity;
  /** Glass only: backdrop blur in px (0–60), saturation (1–3) and opacity of the regular material (0.1–0.8). */
  glass?: { blur?: number; saturation?: number; opacity?: number };
  /** Shadow strength multiplier (0 = flat, 1 = theme default, 2 = twice as deep). */
  shadow?: number;
}

export interface ThemeTokens {
  /** Goes in `[data-theme='…']`: tokens shared by both modes plus the light values. */
  base: Record<string, string>;
  /** Goes in `[data-theme='…'][data-mode='dark']`. */
  dark: Record<string, string>;
}

type Mode = 'light' | 'dark';
type ColorMap = Record<string, string>;

interface ModeDefaults {
  /** Every colour the grey tint re-hues. */
  neutrals: ColorMap;
  shadows: ColorMap;
  accent: ColorMap;
  /** Opaque colours text may sit on (page tints and surfaces); readable shades are checked against all of them. */
  backdrops: string[];
}

interface ThemeDefaults {
  fontSans: string;
  radius: Record<string, number>;
  popoverPadding: number;
  light: ModeDefaults;
  dark: ModeDefaults;
  /** Which accent family tokens the theme ties to the accent (Glass makes the primary action the accent). */
  primaryIsAccent: boolean;
  /** --ui-accent-soft per mode: the accent at `alpha`, flattened onto white when `solid` (Vercel light's #e9f2fe). */
  accentSoft: Record<Mode, { alpha: number; solid: boolean }>;
  glass?: { blur: number; saturation: number; opacity: Record<Mode, number> };
}

// ── Theme defaults (mirrors styles/themes/*.css; createThemeCSS.test.ts keeps them in sync) ──

const SPACING: Record<string, number> = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 };
const CONTROLS = { 'control-h-sm': 32, 'control-h-md': 40, 'control-h-lg': 48, 'menu-item-h': 36 };
const DENSITY: Record<Exclude<ThemeDensity, 'default'>, { controls: number; space: number }> = {
  compact: { controls: -4, space: 0.8 },
  comfortable: { controls: 4, space: 1.2 },
};

const a = (rgb: string, alpha: number) => `rgba(${rgb}, ${alpha})`;

/**
 * Builder defaults per base theme. Only themes listed here can be refined by createThemeCSS (and the
 * Theme Builder); other registered themes are edited in their own styles/themes/<name>.css.
 */
export const THEME_DEFAULTS: Record<'vercel' | 'glass', ThemeDefaults> & Partial<Record<ThemeName, ThemeDefaults>> = {
  vercel: {
    fontSans:
      "'Geist', 'Geist Fallback', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji'",
    radius: { xs: 4, sm: 6, md: 8, lg: 12, xl: 16, button: 6, field: 6, card: 12, popover: 12, modal: 12 },
    popoverPadding: 4,
    primaryIsAccent: false,
    accentSoft: { light: { alpha: 0.1, solid: true }, dark: { alpha: 0.16, solid: false } },
    light: {
      neutrals: {
        'gray-100': '#f2f2f2',
        'gray-200': '#ebebeb',
        'gray-300': '#e6e6e6',
        'gray-400': '#ebebeb',
        'gray-500': '#c9c9c9',
        'gray-600': '#a8a8a8',
        'gray-700': '#8f8f8f',
        'gray-800': '#7d7d7d',
        'gray-900': '#666666',
        'gray-1000': '#171717',
        'gray-alpha-100': a('0, 0, 0', 0.05),
        'gray-alpha-200': a('0, 0, 0', 0.08),
        'gray-alpha-300': a('0, 0, 0', 0.1),
        'gray-alpha-400': a('0, 0, 0', 0.08),
        'gray-alpha-500': a('0, 0, 0', 0.21),
        'gray-alpha-600': a('0, 0, 0', 0.34),
        'gray-alpha-700': a('0, 0, 0', 0.44),
        'gray-alpha-800': a('0, 0, 0', 0.51),
        'gray-alpha-900': a('0, 0, 0', 0.61),
        'gray-alpha-1000': a('0, 0, 0', 0.91),
        'page-bg': '#fafafa',
        'border-strong': a('0, 0, 0', 0.16),
        'border-field': a('0, 0, 0', 0.44),
        'fg-subtle': '#6a6a6a',
        'primary-hover': '#383838',
        'tooltip-fg': '#ededed',
        'chart-grid': a('0, 0, 0', 0.06),
        'chart-axis': '#8f8f8f',
      },
      shadows: {
        'shadow-sm': '0 1px 2px rgba(0, 0, 0, 0.04)',
        'shadow-card': '0 2px 2px rgba(0, 0, 0, 0.04), 0 8px 8px -8px rgba(0, 0, 0, 0.04)',
        'shadow-popover':
          '0 0 0 1px rgba(0, 0, 0, 0.08), 0 1px 1px rgba(0, 0, 0, 0.02), 0 4px 8px -4px rgba(0, 0, 0, 0.04), 0 16px 24px -8px rgba(0, 0, 0, 0.06)',
        'shadow-modal':
          '0 0 0 1px rgba(0, 0, 0, 0.08), 0 1px 1px rgba(0, 0, 0, 0.02), 0 8px 16px -4px rgba(0, 0, 0, 0.04), 0 24px 32px -8px rgba(0, 0, 0, 0.06)',
      },
      accent: { accent: '#0070f3' },
      backdrops: ['#fafafa', '#ffffff', '#f2f2f2'],
    },
    dark: {
      neutrals: {
        'gray-100': '#1a1a1a',
        'gray-200': '#1f1f1f',
        'gray-300': '#292929',
        'gray-400': '#2e2e2e',
        'gray-500': '#454545',
        'gray-600': '#878787',
        'gray-700': '#8f8f8f',
        'gray-800': '#7d7d7d',
        'gray-900': '#a1a1a1',
        'gray-1000': '#ededed',
        'gray-alpha-100': a('255, 255, 255', 0.06),
        'gray-alpha-200': a('255, 255, 255', 0.09),
        'gray-alpha-300': a('255, 255, 255', 0.13),
        'gray-alpha-400': a('255, 255, 255', 0.14),
        'gray-alpha-500': a('255, 255, 255', 0.24),
        'gray-alpha-600': a('255, 255, 255', 0.51),
        'gray-alpha-700': a('255, 255, 255', 0.54),
        'gray-alpha-800': a('255, 255, 255', 0.47),
        'gray-alpha-900': a('255, 255, 255', 0.61),
        'gray-alpha-1000': a('255, 255, 255', 0.92),
        bg: '#0a0a0a',
        surface: '#0a0a0a',
        'surface-3': '#262626',
        elevated: '#0f0f0f',
        active: a('255, 255, 255', 0.1),
        border: a('255, 255, 255', 0.12),
        'border-strong': a('255, 255, 255', 0.2),
        'border-field': a('255, 255, 255', 0.36),
        'fg-subtle': '#8f8f8f',
        'fg-faint': '#7c7c7c',
        'fg-disabled': '#565656',
        'fg-inverse': '#0a0a0a',
        'primary-hover': '#cccccc',
        'tooltip-fg': '#0a0a0a',
        'chart-grid': a('255, 255, 255', 0.08),
        'chart-axis': '#7c7c7c',
      },
      shadows: {
        'shadow-sm': '0 1px 2px rgba(0, 0, 0, 0.4)',
        'shadow-card': '0 0 #0000',
        'shadow-popover': '0 0 0 1px rgba(255, 255, 255, 0.1), 0 16px 32px -8px rgba(0, 0, 0, 0.6)',
        'shadow-modal': '0 0 0 1px rgba(255, 255, 255, 0.1), 0 24px 48px -12px rgba(0, 0, 0, 0.7)',
      },
      accent: { accent: '#0070f3' },
      backdrops: ['#000000', '#0a0a0a', '#1a1a1a'],
    },
  },
  glass: {
    fontSans:
      "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, 'Segoe UI Variable Text', 'Segoe UI', Roboto, 'Helvetica Neue', 'Inter', Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji'",
    radius: { xs: 8, sm: 10, md: 14, lg: 20, xl: 28, button: 9999, field: 12, card: 24, popover: 18, modal: 28 },
    popoverPadding: 6,
    primaryIsAccent: true,
    accentSoft: { light: { alpha: 0.14, solid: false }, dark: { alpha: 0.24, solid: false } },
    glass: { blur: 24, saturation: 1.8, opacity: { light: 0.52, dark: 0.48 } },
    light: {
      neutrals: {
        fg: '#1d1d1f',
        'fg-muted': a('60, 60, 67', 0.86),
        'fg-subtle': a('60, 60, 67', 0.78),
        'fg-faint': a('60, 60, 67', 0.6),
        'fg-disabled': a('60, 60, 67', 0.3),
        'surface-3': a('120, 120, 128', 0.16),
        hover: a('120, 120, 128', 0.12),
        active: a('120, 120, 128', 0.2),
        'border-strong': a('60, 60, 67', 0.22),
        'border-field': a('60, 60, 67', 0.56),
        divider: a('60, 60, 67', 0.14),
        'tooltip-fg': '#1d1d1f',
        'chart-grid': a('60, 60, 67', 0.1),
        'chart-axis': a('60, 60, 67', 0.55),
      },
      shadows: {
        'shadow-sm': '0 1px 2px rgba(20, 30, 60, 0.06), 0 2px 6px -2px rgba(20, 30, 60, 0.08)',
        'shadow-card': '0 1px 2px rgba(31, 41, 80, 0.05), 0 4px 12px -4px rgba(31, 41, 80, 0.08), 0 16px 40px -12px rgba(31, 41, 80, 0.14)',
        'shadow-popover':
          '0 2px 6px rgba(31, 41, 80, 0.08), 0 12px 28px -8px rgba(31, 41, 80, 0.16), 0 32px 64px -24px rgba(31, 41, 80, 0.2)',
        'shadow-modal':
          '0 4px 12px rgba(31, 41, 80, 0.08), 0 24px 56px -12px rgba(31, 41, 80, 0.24), 0 48px 96px -32px rgba(31, 41, 80, 0.28)',
      },
      accent: { accent: '#0071e3' },
      // The page tints of the default wallpaper: text may sit straight on any of them.
      backdrops: ['#ffd9e8', '#c9defc', '#d4f5e4', '#e6dcff', '#eef1f6'],
    },
    dark: {
      neutrals: {
        'glass-tint': 'rgb(38, 38, 44)',
        fg: '#f5f5f7',
        'fg-muted': a('235, 235, 245', 0.8),
        'fg-subtle': a('235, 235, 245', 0.7),
        'fg-faint': a('235, 235, 245', 0.45),
        'fg-disabled': a('235, 235, 245', 0.28),
        'surface-3': a('120, 120, 128', 0.32),
        'tooltip-bg': a('50, 50, 56', 0.8),
        'tooltip-fg': '#f5f5f7',
        'chart-axis': a('235, 235, 245', 0.5),
      },
      shadows: {
        'shadow-sm': '0 1px 2px rgba(0, 0, 0, 0.3), 0 2px 6px -2px rgba(0, 0, 0, 0.3)',
        'shadow-card': '0 1px 2px rgba(0, 0, 0, 0.3), 0 4px 12px -4px rgba(0, 0, 0, 0.3), 0 16px 40px -12px rgba(0, 0, 0, 0.45)',
        'shadow-popover':
          '0 2px 8px rgba(0, 0, 0, 0.3), 0 12px 28px -8px rgba(0, 0, 0, 0.45), 0 32px 64px -24px rgba(0, 0, 0, 0.55)',
        'shadow-modal':
          '0 4px 12px rgba(0, 0, 0, 0.35), 0 24px 56px -12px rgba(0, 0, 0, 0.55), 0 48px 96px -32px rgba(0, 0, 0, 0.65)',
      },
      accent: { accent: '#0071e3' },
      backdrops: ['#3b1d6e', '#0f3b78', '#0d5248', '#5a1640', '#07070c'],
    },
  },
};

// ── Colour math (sRGB ↔ OKLCH, WCAG contrast) ──

interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Parses `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()` and `rgba()` (comma or space syntax). */
export function parseColor(input: string): RGBA | null {
  const s = input.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = [...h].map((c) => c + c).join('');
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? Math.round((n(6) / 255) * 1000) / 1000 : 1 };
  }
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/.exec(s);
  if (fn) {
    const alpha = fn[4] === undefined ? 1 : Number(fn[4]) / (fn[5] ? 100 : 1);
    return { r: clamp(Number(fn[1]), 0, 255), g: clamp(Number(fn[2]), 0, 255), b: clamp(Number(fn[3]), 0, 255), a: clamp(alpha, 0, 1) };
  }
  return null;
}

function mustParse(input: string): RGBA {
  const color = parseColor(input);
  if (!color) throw new Error(`createThemeCSS: unsupported colour "${input}" (use #rrggbb or rgb()/rgba())`);
  return color;
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

function formatColor({ r, g, b, a: alpha }: RGBA): string {
  const [R, G, B] = [r, g, b].map((v) => Math.round(clamp(v, 0, 255)));
  if (alpha >= 1) return `#${[R, G, B].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  return `rgba(${R}, ${G}, ${B}, ${round3(alpha)})`;
}

const toLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (v: number) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

function toOklch({ r, g, b }: RGBA): [number, number, number] {
  const [lr, lg, lb] = [r, g, b].map(toLinear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const hue = (Math.atan2(B, A) * 180) / Math.PI;
  return [L, Math.hypot(A, B), hue < 0 ? hue + 360 : hue];
}

/** Linear sRGB of an OKLCH colour; may fall outside [0, 1] (out of gamut). */
function oklchToLinear(L: number, C: number, H: number): [number, number, number] {
  const h = (H * Math.PI) / 180;
  const A = C * Math.cos(h);
  const B = C * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** OKLCH → sRGB, reducing chroma (keeping lightness and hue) until the colour fits the gamut. */
function fromOklch(L: number, C: number, H: number, alpha = 1): RGBA {
  const inGamut = (c: number) => oklchToLinear(L, c, H).every((v) => v >= -1e-4 && v <= 1 + 1e-4);
  let chroma = C;
  if (!inGamut(chroma)) {
    let lo = 0;
    let hi = chroma;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(mid)) lo = mid;
      else hi = mid;
    }
    chroma = lo;
  }
  const [r, g, b] = oklchToLinear(clamp(L, 0, 1), chroma, H).map((v) => fromLinear(clamp(v, 0, 1)));
  return { r, g, b, a: alpha };
}

function luminance({ r, g, b }: RGBA) {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function over(top: RGBA, bottom: RGBA): RGBA {
  const t = top.a;
  return { r: top.r * t + bottom.r * (1 - t), g: top.g * t + bottom.g * (1 - t), b: top.b * t + bottom.b * (1 - t), a: 1 };
}

const WHITE: RGBA = { r: 255, g: 255, b: 255, a: 1 };

/**
 * WCAG 2 contrast ratio (1–21). A translucent foreground is composited over the background;
 * a translucent background over white.
 */
export function contrastRatio(foreground: string, background: string): number {
  return contrastOf(mustParse(foreground), mustParse(background));
}

function contrastOf(fg: RGBA, bg: RGBA): number {
  const back = bg.a < 1 ? over(bg, WHITE) : bg;
  const front = fg.a < 1 ? over(fg, back) : fg;
  const [hi, lo] = [luminance(front), luminance(back)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// ── Token generators ──

const px = (v: number) => `${Math.round(v)}px`;

function accentTokens(defaults: ThemeDefaults, mode: Mode, accentHex: string): ColorMap {
  const accent = mustParse(accentHex);
  if (accent.a < 1) throw new Error('createThemeCSS: the accent must be opaque');
  const [L, C, H] = toOklch(accent);
  const dark = mode === 'dark';

  const nearBlack: RGBA = { r: 10, g: 10, b: 10, a: 1 };
  const fg = contrastOf(WHITE, accent) >= 4.5 || contrastOf(WHITE, accent) >= contrastOf(nearBlack, accent) ? WHITE : nearBlack;
  // Light: darker on hover. Dark: lighter, as on a black page a darker fill looks pressed, not hovered.
  // When that would drop the on-accent text below 4.5:1, the hover moves the other way instead.
  let hover = fromOklch(clamp(L + (dark ? 0.04 : -0.05), 0, 1), C, H);
  if (contrastOf(fg, hover) < 4.5) hover = fromOklch(clamp(L + (fg === WHITE ? -0.05 : 0.05), 0, 1), C, H);
  // A solid soft fill (Vercel light: #e9f2fe-like) or a translucent one over its surface.
  const { alpha: softAlpha, solid } = defaults.accentSoft[mode];
  const soft = solid ? over({ ...accent, a: softAlpha }, WHITE) : { ...accent, a: softAlpha };

  // Readable accent (links, active tabs, soft badges): walk lightness until 4.6:1 against every backdrop and the soft fill.
  const backdrops = defaults[mode].backdrops.map(mustParse);
  const grounds = [...backdrops, ...backdrops.map((bd) => over(soft, bd))];
  let textL = L;
  let text = fromOklch(textL, C, H);
  for (let i = 0; i < 200 && Math.min(...grounds.map((g) => contrastOf(text, g))) < 4.6; i++) {
    textL = clamp(textL + (dark ? 0.005 : -0.005), 0, 1);
    text = fromOklch(textL, C, H);
  }

  const tokens: ColorMap = {
    accent: formatColor(accent),
    'accent-hover': formatColor(hover),
    'accent-fg': formatColor(fg),
    'accent-soft': formatColor(soft),
    'accent-text': formatColor(text),
    info: formatColor(accent),
    'info-soft': formatColor(soft),
    'info-text': formatColor(text),
    'chart-1': formatColor(dark ? fromOklch(clamp(L + 0.04, 0, 1), C, H) : accent),
  };
  if (defaults.primaryIsAccent) {
    tokens.primary = tokens.accent;
    tokens['primary-hover'] = tokens['accent-hover'];
    tokens['primary-fg'] = tokens['accent-fg'];
  }
  return tokens;
}

/** Re-hues a neutral: pure black and white inks get a little lightness so they can carry the tint. */
function tintNeutral(value: string, hue: number, chroma: number): string {
  const color = mustParse(value);
  let [L] = toOklch(color);
  if (color.a < 1 && L < 0.05) L = 0.22;
  if (color.a < 1 && L > 0.98) L = 0.96;
  // Near-white greys carry almost no chroma (slate-50 is ≈ 0.003), mid and dark greys the full amount.
  const c = chroma * clamp((1 - L) * 4, 0, 1);
  return formatColor(fromOklch(L, c, hue, color.a));
}

function scaleShadow(shadow: string, k: number): string {
  // Alpha of every layer scales; 1px rings (borders drawn as shadows) keep theirs.
  return shadow
    .split(/,(?![^(]*\))/)
    .map((layer) => {
      const trimmed = layer.trim();
      if (/^0 0 0 1px /.test(trimmed)) return trimmed;
      return trimmed.replace(/rgba\(([^)]+),\s*([\d.]+)\)/, (_, rgb: string, alpha: string) => `rgba(${rgb}, ${round3(clamp(Number(alpha) * k, 0, 1))})`);
    })
    .join(', ');
}

/** The overrides as two token maps (without the `--ui-` prefix): base (shared + light) and dark. */
export function createThemeTokens(options: ThemeCSSOptions): ThemeTokens {
  const { theme } = options;
  const defaults = THEME_DEFAULTS[theme];
  if (!defaults) throw new Error(`createThemeCSS: unknown theme "${String(theme)}"`);
  const base: ColorMap = {};
  const dark: ColorMap = {};
  const both = (mode: Mode) => (mode === 'light' ? base : dark);

  if (options.fontSans && options.fontSans !== defaults.fontSans) base['font-sans'] = options.fontSans;

  if (options.radius !== undefined && options.radius !== 1) {
    const k = clamp(options.radius, 0, 2);
    for (const [name, value] of Object.entries(defaults.radius)) {
      base[`radius-${name}`] = value >= 999 ? `${value}px` : px(value * k);
    }
  }

  if (options.density && options.density !== 'default') {
    const d = DENSITY[options.density];
    for (const [name, value] of Object.entries(CONTROLS)) base[name] = px(value + d.controls);
    for (const [step, value] of Object.entries(SPACING)) base[`space-${step}`] = px(value * d.space);
  }

  if (options.glass && defaults.glass) {
    const { blur, saturation, opacity } = options.glass;
    if (blur !== undefined && blur !== defaults.glass.blur) base['glass-blur'] = px(clamp(blur, 0, 60));
    if (saturation !== undefined && saturation !== defaults.glass.saturation) base['glass-saturation'] = String(round3(clamp(saturation, 1, 3)));
    if (opacity !== undefined && opacity !== defaults.glass.opacity.light) {
      const delta = clamp(opacity, 0.1, 0.8) - defaults.glass.opacity.light;
      for (const mode of ['light', 'dark'] as const) both(mode)['glass-opacity'] = String(round3(clamp(defaults.glass.opacity[mode] + delta, 0.05, 0.8)));
    }
  }

  for (const mode of ['light', 'dark'] as const) {
    const target = both(mode);
    if (options.gray) {
      const hue = ((options.gray.hue % 360) + 360) % 360;
      const chroma = clamp(options.gray.chroma, 0, 0.08);
      for (const [name, value] of Object.entries(defaults[mode].neutrals)) target[name] = tintNeutral(value, hue, chroma);
    }
    if (options.accent && mustParse(options.accent) && formatColor(mustParse(options.accent)) !== defaults[mode].accent.accent) {
      Object.assign(target, accentTokens(defaults, mode, options.accent));
    }
    if (options.shadow !== undefined && options.shadow !== 1) {
      const k = clamp(options.shadow, 0, 3);
      for (const [name, value] of Object.entries(defaults[mode].shadows)) target[name] = scaleShadow(value, k);
    }
  }
  return { base, dark };
}

function block(selector: string, tokens: ColorMap) {
  const lines = Object.entries(tokens).map(([name, value]) => `  --ui-${name}: ${value};`);
  return `${selector} {\n${lines.join('\n')}\n}`;
}

/**
 * CSS overrides for one base theme, light and dark. Load it after the kit's stylesheet:
 *
 *   createThemeCSS({ theme: 'glass', accent: '#ff2d55', radius: 1.25 })
 *   // [data-theme='glass'] { --ui-radius-…; --ui-accent: #ff2d55; … }
 *   // [data-theme='glass'][data-mode='dark'] { … }
 *
 * Returns an empty string when the options match the theme defaults.
 */
export function createThemeCSS(options: ThemeCSSOptions): string {
  const { base, dark } = createThemeTokens(options);
  const selector = `[data-theme='${options.theme}']`;
  const blocks: string[] = [];
  if (Object.keys(base).length) blocks.push(block(selector, base));
  if (Object.keys(dark).length) blocks.push(block(`${selector}[data-mode='dark']`, dark));
  return blocks.join('\n\n');
}

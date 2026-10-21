import type { FontId } from './fonts';

/**
 * Theme registry: the one list of themes the kit ships. Every entry is backed by
 * `styles/themes/<name>.css`, which defines the complete `--ui-*` token set for `[data-theme='<name>']`
 * (light) and `[data-theme='<name>'][data-mode='dark']`. The `bundled` themes are imported by
 * `styles/index.css` (published as `ui-kit/styles.css`); every other theme is opt-in: the app imports
 * `ui-kit/themes/<name>.css` after `ui-kit/styles.css`. Fonts are opt-in for every theme:
 * `ui-kit/fonts/<id>.css` for each id in `fonts` (src/lib/theme/fonts.ts).
 * Theme pickers (docs, Theme Builder) read this list instead of hard-coding names.
 *
 * Adding a theme: `npm run theme:new -- <name>` copies the reference theme's file and appends an entry
 * here (and to the CLI's copy); then edit the token values. Components never mention a theme name:
 * every difference between themes is a token value (src/lib/styles/theming-contract.test.ts enforces
 * it, and that `fonts` lists exactly the self-hosted families the theme file names).
 */
export type ThemeGroup = 'brand' | 'system' | 'style' | 'game';

export interface ThemeInfo {
  /** `data-theme` value and CSS file name (`styles/themes/<name>.css`). */
  readonly name: string;
  /** Display name for pickers. */
  readonly label: string;
  /** One line for pickers and docs. */
  readonly description: string;
  /** Picker section: a company's look, an OS design system, a visual style, or a game genre. */
  readonly group: ThemeGroup;
  /** Self-hosted font files its font stacks use: `ui-kit/fonts/<id>.css`. */
  readonly fonts: readonly FontId[];
  /** Part of `ui-kit/styles.css`; otherwise the app imports `ui-kit/themes/<name>.css`. */
  readonly bundled?: boolean;
}

export const themes = [
  { name: 'vercel', label: 'Vercel', description: 'Geist: monochrome surfaces, hairline borders and crisp shadows.', group: 'brand', fonts: ['geist', 'geist-mono'], bundled: true },
  { name: 'glass', label: 'Liquid Glass', description: 'Apple Liquid Glass: translucent frosted materials and capsule controls.', group: 'system', fonts: [], bundled: true },
  { name: 'material', label: 'Material', description: 'Material 3: tonal surfaces from one seed colour, large radii, Roboto Flex.', group: 'system', fonts: ['roboto-flex', 'jetbrains-mono'] },
  { name: 'fluent', label: 'Fluent', description: 'Fluent 2 (Windows 11): Mica and Acrylic materials, Segoe UI, soft depth.', group: 'system', fonts: ['selawik'] },
  { name: 'linear', label: 'Linear', description: 'Dark-first SaaS: dense layout, violet accent, subtle gradient edges, Inter.', group: 'brand', fonts: ['inter', 'jetbrains-mono'] },
  { name: 'stripe', label: 'Stripe', description: 'Fintech clarity: indigo accent, airy white surfaces, soft layered shadows.', group: 'brand', fonts: ['inter', 'jetbrains-mono'] },
  { name: 'anthropic', label: 'Anthropic', description: 'Warm ivory and clay, serif headings, calm editorial rhythm.', group: 'brand', fonts: ['inter', 'source-serif-4', 'jetbrains-mono'] },
  { name: 'paper', label: 'Paper', description: 'Notion-like editorial: near-white page, quiet greys, almost no borders.', group: 'style', fonts: ['inter', 'jetbrains-mono'] },
  { name: 'brutalism', label: 'Brutalism', description: 'Neo-brutalism: thick black outlines, hard offset shadows, loud flat colour.', group: 'style', fonts: ['inter', 'unbounded', 'jetbrains-mono'] },
  { name: 'high-contrast', label: 'High Contrast', description: 'WCAG AAA: black on white, heavy focus rings, no transparency, Atkinson Hyperlegible.', group: 'style', fonts: ['atkinson-hyperlegible-next', 'jetbrains-mono'] },
  { name: 'terminal', label: 'Terminal', description: 'Monospace everywhere, phosphor green on black with amber accents, square corners.', group: 'style', fonts: ['jetbrains-mono'] },
  { name: 'pixel', label: 'Pixel', description: '8-bit games: pixel font, blocky bevelled controls, stepped pixel shadows.', group: 'game', fonts: ['jetbrains-mono', 'pixelify-sans', 'press-start-2p'] },
  { name: 'cyber', label: 'Cyber', description: 'Neon sci-fi HUD: chamfered corners, cyan and magenta glow, technical type.', group: 'game', fonts: ['geist', 'unbounded', 'jetbrains-mono'] },
  { name: 'fantasy', label: 'Fantasy', description: 'Classic RPG: leather and parchment, forged-gold buttons, ruby-set corner guards, Cinzel and Garamond.', group: 'game', fonts: ['jetbrains-mono', 'cinzel', 'eb-garamond'] },
  { name: 'playrix', label: 'Playrix', description: 'Casual-game brand: Playrix green candy buttons, sky-blue links, rounded white cards on a leafy page.', group: 'brand', fonts: ['inter', 'unbounded', 'jetbrains-mono'] },
  { name: 'manacost', label: 'Manacost', description: 'Hearthstone news portal: white pages, portal-blue top rules and table heads, navy accent, yellow markers.', group: 'brand', fonts: ['roboto-flex', 'jetbrains-mono'] },
  { name: 'mythic', label: 'Mythic', description: 'Obsidian and gold leaf: gold hairlines and corner lozenges, spaced capital labels, Garamond headings over Inter.', group: 'game', fonts: ['inter', 'eb-garamond', 'jetbrains-mono'] },
  { name: 'frost', label: 'Frost', description: 'Steel and ice: gunmetal night, polished-silver buttons, ice-shard corners, chamfered plates, Cinzel over Inter.', group: 'game', fonts: ['inter', 'cinzel', 'eb-garamond', 'jetbrains-mono'] },
  { name: 'hearthstone', label: 'Hearthstone', description: 'HearthPulse tavern: parchment and red cloth, timber and gold frames, glossy mana-blue buttons, HSDisplay headings.', group: 'game', fonts: ['hs-display', 'inter', 'jetbrains-mono'] },
] as const satisfies readonly ThemeInfo[];

/** A theme shipped with the kit. */
export type BuiltInThemeName = (typeof themes)[number]['name'];

/**
 * A shipped theme, or the name of a theme whose CSS the app loads itself
 * (`[data-theme='<name>']` blocks defining every token, e.g. generated by the theme scaffold).
 */
export type ThemeName = BuiltInThemeName | (string & {});

/** Its file defines the complete token set every theme must match; it is also the `:root` default. */
export const referenceTheme: BuiltInThemeName = 'vercel';

export function findTheme(name: string): ThemeInfo | undefined {
  return themes.find((theme) => theme.name === name);
}

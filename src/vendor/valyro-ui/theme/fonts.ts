/**
 * Self-hosted font families: `src/lib/fonts/<id>.css` (published as `ui-kit/fonts/<id>.css`) plus
 * `src/lib/fonts/<id>/` with the woff2 files and the licence (OFL.txt; LICENSE.txt for a font that is not open
 * source). Each CSS file declares `'<family>'` (latin, latin-ext and, where the font has it, cyrillic subsets) and a metric-matched local
 * `'<family> Fallback'`, so swapping in the webfont does not shift the layout.
 * A theme lists the files its font stacks need in `ThemeInfo.fonts` (src/lib/theme/themes.ts).
 */
export interface FontInfo {
  /** File name: `fonts/<id>.css`. */
  readonly id: string;
  /** The CSS font-family name. */
  readonly family: string;
  /** Has Russian letters; without them Cyrillic text uses the next family in the stack. */
  readonly cyrillic: boolean;
}

export const fonts = [
  { id: 'geist', family: 'Geist', cyrillic: true },
  { id: 'geist-mono', family: 'Geist Mono', cyrillic: true },
  { id: 'inter', family: 'Inter', cyrillic: true },
  { id: 'roboto-flex', family: 'Roboto Flex', cyrillic: true },
  { id: 'selawik', family: 'Selawik', cyrillic: false },
  { id: 'source-serif-4', family: 'Source Serif 4', cyrillic: true },
  { id: 'unbounded', family: 'Unbounded', cyrillic: true },
  { id: 'atkinson-hyperlegible-next', family: 'Atkinson Hyperlegible Next', cyrillic: false },
  { id: 'jetbrains-mono', family: 'JetBrains Mono', cyrillic: true },
  // Upstream lacks capital О and П; every other Russian letter is there.
  { id: 'pixelify-sans', family: 'Pixelify Sans', cyrillic: true },
  { id: 'press-start-2p', family: 'Press Start 2P', cyrillic: true },
  { id: 'vt323', family: 'VT323', cyrillic: false },
  { id: 'tektur', family: 'Tektur', cyrillic: true },
  { id: 'cinzel', family: 'Cinzel', cyrillic: false },
  { id: 'eb-garamond', family: 'EB Garamond', cyrillic: true },
  // HearthPulse's display face (Manacost); not open source: hs-display/LICENSE.txt.
  { id: 'hs-display', family: 'HSDisplay', cyrillic: true },
] as const satisfies readonly FontInfo[];

export type FontId = (typeof fonts)[number]['id'];

export function findFont(id: string): FontInfo | undefined {
  return fonts.find((font) => font.id === id);
}

/** A named hue of the theme (`--ui-red`…) or the accent. */
export type GameTone = 'accent' | 'gray' | 'red' | 'orange' | 'amber' | 'green' | 'teal' | 'blue' | 'purple' | 'pink';

const TONES = new Set<string>(['accent', 'gray', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'purple', 'pink']);

/** CSS colour of a tone: a theme hue for the named ones, anything else as it is. */
export function gameToneColor(tone: GameTone | (string & {}) | undefined): string | undefined {
  if (!tone) return undefined;
  if (!TONES.has(tone)) return tone;
  if (tone === 'accent') return 'var(--ui-accent)';
  if (tone === 'orange') return 'color-mix(in oklab, var(--ui-red) 45%, var(--ui-amber))';
  return `var(--ui-${tone})`;
}

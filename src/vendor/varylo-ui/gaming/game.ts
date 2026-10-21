/*
 * Types shared by the gaming components: pictures, roles and tiers.
 */
import type { ReactNode } from 'react';
import type { GameTone } from './tone';

/**
 * A picture of a champion, item, ability or team: an image URL (rendered lazily at a fixed size, so the layout
 * does not shift), or any node — your own `<img>`, a sprite, an SVG. Without one, or when the URL fails to load,
 * the components show the initials on a neutral plate in the role or tier colour.
 */
export type GameImageSource = string | ReactNode;

/** A role or position (top, jungle… or tank, healer…): the badge on portraits and an option of the role filter. */
export interface GameRole {
  id: string;
  /** Full name: the filter option and what screen readers hear. */
  label: string;
  /** One or two letters on the portrait badge. Default: the first letter of `label`. */
  short?: string;
  /** Role icon, an image URL or a node: replaces `short` on the badge and leads the filter option. */
  icon?: GameImageSource;
  /** Colour of the badge and of portraits without a picture: a theme hue or any CSS colour. Default gray. */
  color?: GameTone | (string & {});
}

/** Theme hues a tier can take. */
export type TierColor = 'red' | 'orange' | 'amber' | 'green' | 'teal' | 'blue' | 'purple' | 'pink' | 'gray';

export interface TierDef {
  id: string;
  /** Shown on the tier chip: S+, A, or a short word. */
  label: string;
  /** Colour of the tier: a theme hue. Default gray. */
  color?: TierColor;
  /** Line next to the chip, e.g. "Meta-defining". */
  description?: string;
}

/** S+ to D on a heat scale, red to gray. */
export const DEFAULT_TIERS: TierDef[] = [
  { id: 'S+', label: 'S+', color: 'red' },
  { id: 'S', label: 'S', color: 'orange' },
  { id: 'A', label: 'A', color: 'amber' },
  { id: 'B', label: 'B', color: 'green' },
  { id: 'C', label: 'C', color: 'blue' },
  { id: 'D', label: 'D', color: 'gray' },
];

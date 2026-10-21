import {
  pageTransitionSpec,
  reducedPageTransition,
  type PageTransitionDirection,
} from '../../vendor/valyro-ui/motion-kit/page-transitions';

import { MODE_ORDER, switchDirection } from './transitionOrder';

export { MODE_ORDER, switchDirection };

/**
 * The ValyroUI presets the site uses (all free ones). The site never plays the
 * long travelling presets (slide, slide-up) on content: they exceed the
 * 150–250 ms budget of an answer to a click.
 */
export type SiteTransitionPreset = 'fade' | 'fade-through' | 'shared-x' | 'shared-y' | 'shared-z' | 'rise' | 'cover' | 'sheet';

export interface RouteTransitionChoice {
  preset: SiteTransitionPreset;
  direction: PageTransitionDirection;
}

/** Ordinary route changes: content rises a little into place. */
export const ROUTE_PRESET: SiteTransitionPreset = 'rise';

const MODES = MODE_ORDER;
const isMode = (segment: string | undefined) => (MODES as readonly string[]).includes(segment ?? '');

/** Pages one opens from a list: an archetype, a card, a Battlegrounds hero or library entry. */
const DETAIL_ROUTES = [
  /^\/standard\/archetypes\/(?:standard|wild)\/[^/]+$/,
  /^\/standard\/cards\/(?:standard|wild)\/[^/]+$/,
  /^\/heroes\/[^/]+$/,
  /^\/library\/[^/]+\/[^/]+$/,
];

const segmentsOf = (path: string) => path.replace(/\/+$/, '').split('/').filter(Boolean);

/**
 * The modes of two paths that differ only in their Стандарт/Вольный segment
 * (`/standard/cards/standard/` ↔ `/standard/cards/wild/`); a list without the
 * segment is the Standard default. Null when the paths are other pages.
 */
function modeSwap(from: string[], to: string[]): [string, string] | null {
  if (from.length === to.length) {
    const differing = from.flatMap((segment, index) => (segment === to[index] ? [] : [index]));
    if (differing.length !== 1) return null;
    const [index] = differing;
    return isMode(from[index]) && isMode(to[index]) ? [from[index], to[index]] : null;
  }
  const [shorter, longer] = from.length < to.length ? [from, to] : [to, from];
  if (longer.length !== shorter.length + 1 || !isMode(longer.at(-1)) || shorter.some((segment, index) => segment !== longer[index])) return null;
  return from === shorter ? ['standard', longer.at(-1)] : [longer.at(-1), 'standard'];
}

/**
 * Which preset a link navigation plays, from where it starts and where it
 * goes. Стандарт ↔ Вольный of the same page slides along x towards the chosen
 * mode (the order of the switch); opening a detail page (archetype, card,
 * hero) or a page nested under the current one zooms in, the step back to the
 * enclosing list zooms out; any other route rises.
 */
export function routeTransitionFor(fromPath: string, toPath: string): RouteTransitionChoice {
  const from = segmentsOf(fromPath);
  const to = segmentsOf(toPath);
  const modes = modeSwap(from, to);
  if (modes) return modes[0] === modes[1] ? { preset: ROUTE_PRESET, direction: 'forward' } : { preset: 'shared-x', direction: switchDirection(MODES, modes[0], modes[1]) };
  const nested = (outer: string[], inner: string[]) => outer.length > 0 && inner.length > outer.length && outer.every((segment, index) => segment === inner[index]);
  if (nested(to, from)) return { preset: 'shared-z', direction: 'back' };
  if (nested(from, to) || DETAIL_ROUTES.some(route => route.test(`/${to.join('/')}`))) return { preset: 'shared-z', direction: 'forward' };
  return { preset: ROUTE_PRESET, direction: 'forward' };
}

/** The entrance of a link navigation from `fromPath` to `toPath`: the chosen preset's entering half. */
export function routeEntranceKeyframes(fromPath: string, toPath: string): Keyframe[] {
  const { preset, direction } = routeTransitionFor(fromPath, toPath);
  return entranceKeyframes(preset, direction);
}

/**
 * The entering half of a preset for content that replaces the old one in
 * place (nothing leaves: the route already swapped it, the grid already
 * re-rendered). The preset's hold frames — the new page waiting while the old
 * one fades out — are dropped, so the entrance starts at once. Reduced motion:
 * the preset's dissolve.
 */
export function entranceKeyframes(preset: SiteTransitionPreset, direction: PageTransitionDirection = 'forward', reduced = false): Keyframe[] {
  const spec = reduced ? reducedPageTransition() : pageTransitionSpec(preset, { direction });
  const frames = spec.enter.keyframes;
  if (frames.length < 2) return [{ opacity: 0 }, { opacity: 1 }];
  const first = frames[0];
  const last = frames[frames.length - 1];
  return [stripTiming(first), stripTiming(last)];
}

function stripTiming(frame: Keyframe): Keyframe {
  const { offset: _offset, easing: _easing, ...rest } = frame;
  return rest;
}

/** How close to a viewport edge (px) a panel counts as docked to it. */
const DOCKED = 8;

/**
 * The entrance of a modal panel from where its layout put it: a panel docked
 * to the bottom across the screen (a phone bottom sheet) rises as a ValyroUI
 * sheet; one docked to the right over the full height (a drawer) slides in as
 * a cover; a centred dialog keeps its own entrance (null).
 */
export function modalEntrancePreset(panel: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom' | 'width' | 'height'>, width: number, height: number): Extract<SiteTransitionPreset, 'sheet' | 'cover'> | null {
  if (Math.abs(panel.bottom - height) <= DOCKED && panel.width >= width - 2 * DOCKED && panel.top > DOCKED) return 'sheet';
  if (Math.abs(panel.right - width) <= DOCKED && panel.height >= height - 2 * DOCKED && panel.left > DOCKED) return 'cover';
  return null;
}

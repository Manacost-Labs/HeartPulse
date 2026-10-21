/*
 * Page transitions: forty choreographies for the moment one page (a route, a step of a flow, a tab
 * panel) gives way to the next. A preset is a pair of Web Animation keyframe lists — the page that
 * leaves and the page that enters — plus which of the two paints on top, one length and the curves.
 * The same pair drives both engines: PageTransition (two live layers in a container, every browser) and
 * animateViewTransition (the snapshots of a View Transition, for a whole document). Sideways presets
 * mirror for `back` and in right-to-left writing; stacked ones (cover, sheet…) swap which page moves, the
 * way a stack of screens pops. Pure: runs in tests and on the server.
 *
 * Tiers: this module holds the engine and the ten free presets (FREE_PAGE_TRANSITIONS) — the calm ones
 * and the everyday app moves. The other thirty are ValyroUI Pro and live in page-transitions-pro.ts,
 * which registers them when imported; a Pro name asked for without it plays fade, with a warning.
 *
 * Cost: most presets move only `transform` and `opacity`, which the compositor animates without layout
 * or paint. The reveals animate a clip-path, which repaints the clipped page every frame, and blur runs
 * a filter over it. A page that stays put while the other moves gets no animation at all, so it is not
 * even promoted to a layer.
 *
 * CPU tier: a machine that renders without a GPU (a virtual machine, a remote desktop, a server, a
 * browser on software WebGL) composites every layer on the processor, pixel by pixel, each frame. There
 * each preset plays its CPU variant instead: one page moves, the other stays still and unanimated, only
 * translate and opacity (no scale, 3D, clip or filter, which software rasterises slowly), within 260 ms.
 */

/**
 * Free: fade, fade-through (out, then in with a slight zoom), shared-x / shared-y / shared-z (a short
 * shift sideways, up or in depth, with a fade), rise (the new page rises a little as the old one fades),
 * slide / slide-up (both pages travel a full width or height), cover (the new page slides over the old
 * one), sheet (rises over the old page, which steps back).
 * Pro (page-transitions-pro.ts): blur, dip (out to the background, then in), uncover (the old page slides
 * off the new one), zoom (through the old page), pop (springs in), scale-down (slides over the old page,
 * which shrinks away), drop (falls in from above with a bounce), elastic (a full slide on a spring), skew
 * (slides in leaning, then straightens), swirl (turns and grows into place), arc (both pages swing along
 * a wheel), fall (the old page tips off its corner and falls), newspaper (spins out, the new one spins
 * in); 3D: flip / flip-x (turns over like a card), cube / cube-y (the faces of a cube), swing (in on a
 * hinge), tilt (tips back, the new one rises), carousel (a turning wheel), room (the walls of a room),
 * doors (out on one hinge, in on the other), depth-slide (step back, slide across, step forward);
 * reveals: circle (grows from the click), wipe / wipe-up (a straight edge sweeps across or up), split /
 * shutter (opens from the middle), diagonal (a slanted edge), diamond (a diamond opens).
 */
export type PageTransitionPreset =
  | 'fade'
  | 'fade-through'
  | 'shared-x'
  | 'shared-y'
  | 'shared-z'
  | 'blur'
  | 'rise'
  | 'dip'
  | 'slide'
  | 'slide-up'
  | 'cover'
  | 'uncover'
  | 'sheet'
  | 'zoom'
  | 'pop'
  | 'scale-down'
  | 'drop'
  | 'elastic'
  | 'skew'
  | 'swirl'
  | 'arc'
  | 'fall'
  | 'newspaper'
  | 'flip'
  | 'flip-x'
  | 'cube'
  | 'cube-y'
  | 'swing'
  | 'tilt'
  | 'carousel'
  | 'room'
  | 'doors'
  | 'depth-slide'
  | 'circle'
  | 'wipe'
  | 'wipe-up'
  | 'split'
  | 'shutter'
  | 'diagonal'
  | 'diamond';

/** Every preset name, free and Pro, in gallery order. */
export const PAGE_TRANSITIONS: readonly PageTransitionPreset[] = [
  'fade',
  'fade-through',
  'shared-x',
  'shared-y',
  'shared-z',
  'blur',
  'rise',
  'dip',
  'slide',
  'slide-up',
  'cover',
  'uncover',
  'sheet',
  'zoom',
  'pop',
  'scale-down',
  'drop',
  'elastic',
  'skew',
  'swirl',
  'arc',
  'fall',
  'newspaper',
  'flip',
  'flip-x',
  'cube',
  'cube-y',
  'swing',
  'tilt',
  'carousel',
  'room',
  'doors',
  'depth-slide',
  'circle',
  'wipe',
  'wipe-up',
  'split',
  'shutter',
  'diagonal',
  'diamond',
];

/** The presets of the free core (valyro-ui); the rest need ValyroUI Pro. */
export const FREE_PAGE_TRANSITIONS: readonly PageTransitionPreset[] = ['fade', 'fade-through', 'shared-x', 'shared-y', 'shared-z', 'rise', 'slide', 'slide-up', 'cover', 'sheet'];

/** forward — deeper into the app (a link, the next step); back — the way back (history, a back button). */
export type PageTransitionDirection = 'forward' | 'back';

/** compositor — transform and opacity only; paint — a clip-path, repainted every frame; filter — a blur. */
export type PageTransitionCost = 'compositor' | 'paint' | 'filter';

/** gpu — the full preset; cpu — its one-layer variant for machines that composite on the processor. */
export type PageTransitionTier = 'gpu' | 'cpu';

/**
 * The CPU variants: dissolve — the top page fades; nudge-x / nudge-y — it fades with a short shift;
 * slide / rise — it slides a full width or height (opaque, so nothing is blended).
 */
export type PageTransitionCpuVariant = 'dissolve' | 'nudge-x' | 'nudge-y' | 'slide' | 'rise';

/** How one of the two pages moves; no keyframes — it stays as it is, without an animation. */
export interface PageMotion {
  keyframes: Keyframe[];
  easing: string;
}

export interface PageTransitionSpec {
  /** The page that leaves. */
  exit: PageMotion;
  /** The page that enters. */
  enter: PageMotion;
  /** Which page paints on top while both are there. */
  top: 'exit' | 'enter';
  /** Length at the reference tempo (`--ui-duration: 200ms`), ms. */
  duration: number;
  /** Depth of the 3D presets, px: the perspective of the container (or the View Transition's image pair). */
  perspective?: number;
  cost: PageTransitionCost;
}

export interface PageTransitionOptions {
  direction?: PageTransitionDirection;
  /** Right-to-left writing: sideways presets mirror. */
  rtl?: boolean;
  /** Where circle grows from, px from the page's top-left corner. Default: the middle. */
  origin?: { x: number; y: number };
  /** Radius that covers the page from `origin`, px (the farthest visible corner). Default: 150% of the page. */
  radius?: number;
  /** cpu — the preset's one-layer variant (see the module comment). Default: gpu. */
  tier?: PageTransitionTier;
}

/** What a preset is built from (page-transitions-pro.ts builds the Pro ones with these). */
export interface PageTransitionContext {
  /** +1 when the new page comes from the inline end (forward in left-to-right writing), −1 when from the start. */
  x: 1 | -1;
  /** The inline side going forward, also when going back: a stacked page leaves the way it came. */
  fx: 1 | -1;
  /** +1 when the new page comes from below (forward), −1 from above (back). */
  y: 1 | -1;
  back: boolean;
  /** circle's origin as a CSS position. */
  at: string;
  /** circle's covering radius as a CSS length. */
  radius: string;
}

export interface PageTransitionDefinition {
  build: (context: PageTransitionContext) => PageTransitionSpec;
  /** What it plays on machines without a GPU. */
  cpu: PageTransitionCpuVariant;
}

/** Decelerates into place: most entrances. */
export const STANDARD = 'cubic-bezier(0.2, 0, 0, 1)';
/** Both pages travel the whole way: slow off, slow in. */
export const IN_OUT = 'cubic-bezier(0.65, 0, 0.35, 1)';
export const OUT = 'cubic-bezier(0, 0, 0.2, 1)';
export const IN = 'cubic-bezier(0.4, 0, 1, 1)';

export const motion = (keyframes: Keyframe[], easing = STANDARD): PageMotion => ({ keyframes, easing });
/** Stays as it is while the other page moves over or off it: no animation, no layer. */
export const still = (): PageMotion => motion([], 'linear');
/** A full page height, but no more than the screen: a tall page does not race past in a blur. */
export const fullHeight = (sign: number) => (sign > 0 ? 'min(100%, 100vh)' : 'max(-100%, -100vh)');
export const reversed = (frames: Keyframe[]) => [...frames].reverse();

/** A short shift along an axis with a fade: out quickly, in as the old page is gone (Material's shared axis). */
const sharedAxis = (axis: 'X' | 'Y', sign: number): PageTransitionSpec => ({
  exit: motion([{ opacity: 1, transform: `translate${axis}(0px)` }, { opacity: 0, offset: 0.3 }, { opacity: 0, transform: `translate${axis}(${-30 * sign}px)` }]),
  enter: motion([{ opacity: 0, transform: `translate${axis}(${30 * sign}px)` }, { opacity: 0, offset: 0.3 }, { opacity: 1, transform: `translate${axis}(0px)` }]),
  top: 'enter',
  duration: 400,
  cost: 'compositor',
});

const FREE: Partial<Record<PageTransitionPreset, PageTransitionDefinition>> = {
  fade: {
    cpu: 'dissolve',
    build: () => ({
      exit: motion([{ opacity: 1 }, { opacity: 0 }], OUT),
      enter: motion([{ opacity: 0 }, { opacity: 1 }]),
      top: 'enter',
      duration: 280,
      cost: 'compositor',
    }),
  },
  'fade-through': {
    cpu: 'dissolve',
    build: () => ({
      exit: motion([{ opacity: 1, easing: IN }, { opacity: 0, offset: 0.35 }, { opacity: 0 }], 'linear'),
      enter: motion(
        [
          { opacity: 0, transform: 'scale(0.92)' },
          { opacity: 0, transform: 'scale(0.92)', offset: 0.35, easing: OUT },
          { opacity: 1, transform: 'scale(1)' },
        ],
        'linear',
      ),
      top: 'enter',
      duration: 380,
      cost: 'compositor',
    }),
  },
  'shared-x': { cpu: 'nudge-x', build: ({ x }) => sharedAxis('X', x) },
  'shared-y': { cpu: 'nudge-y', build: ({ y }) => sharedAxis('Y', y) },
  'shared-z': {
    cpu: 'dissolve',
    build: ({ back }) => {
      const [from, to] = back ? [1.1, 0.8] : [0.8, 1.1];
      return {
        exit: motion([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, offset: 0.3 }, { opacity: 0, transform: `scale(${to})` }]),
        enter: motion([{ opacity: 0, transform: `scale(${from})` }, { opacity: 0, offset: 0.3 }, { opacity: 1, transform: 'scale(1)' }]),
        top: 'enter',
        duration: 400,
        cost: 'compositor',
      };
    },
  },
  rise: {
    cpu: 'nudge-y',
    build: ({ y }) => ({
      exit: motion([{ opacity: 1 }, { opacity: 0, offset: 0.5 }, { opacity: 0 }], OUT),
      enter: motion([
        { opacity: 0, transform: `translateY(${16 * y}px)` },
        { opacity: 1, transform: 'translateY(0px)' },
      ]),
      top: 'enter',
      duration: 360,
      cost: 'compositor',
    }),
  },
  slide: {
    cpu: 'slide',
    build: ({ x }) => ({
      exit: motion([{ transform: 'translateX(0%)' }, { transform: `translateX(${-100 * x}%)` }], IN_OUT),
      enter: motion([{ transform: `translateX(${100 * x}%)` }, { transform: 'translateX(0%)' }], IN_OUT),
      top: 'enter',
      duration: 500,
      cost: 'compositor',
    }),
  },
  'slide-up': {
    cpu: 'rise',
    build: ({ y }) => ({
      exit: motion([{ transform: 'translateY(0px)' }, { transform: `translateY(${fullHeight(-y)})` }], IN_OUT),
      enter: motion([{ transform: `translateY(${fullHeight(y)})` }, { transform: 'translateY(0px)' }], IN_OUT),
      top: 'enter',
      duration: 540,
      cost: 'compositor',
    }),
  },
  cover: {
    cpu: 'slide',
    build: ({ fx, back }) => {
      const under = [
        { opacity: 1, transform: 'translateX(0%)' },
        { opacity: 0.6, transform: `translateX(${-30 * fx}%)` },
      ];
      const over = [{ transform: `translateX(${100 * fx}%)` }, { transform: 'translateX(0%)' }];
      return back
        ? { exit: motion(reversed(over)), enter: motion(reversed(under)), top: 'exit', duration: 500, cost: 'compositor' }
        : { exit: motion(under), enter: motion(over), top: 'enter', duration: 500, cost: 'compositor' };
    },
  },
  sheet: {
    cpu: 'rise',
    build: ({ back }) => {
      const origin = '50% 0%';
      const under = [
        { opacity: 1, transform: 'translateY(0px) scale(1)', transformOrigin: origin },
        { opacity: 0.5, transform: 'translateY(12px) scale(0.92)', transformOrigin: origin },
      ];
      const over = [{ transform: `translateY(${fullHeight(1)})` }, { transform: 'translateY(0px)' }];
      return back
        ? { exit: motion(reversed(over)), enter: motion(reversed(under)), top: 'exit', duration: 520, cost: 'compositor' }
        : { exit: motion(under), enter: motion(over), top: 'enter', duration: 520, cost: 'compositor' };
    },
  },
};

/** The presets this build can play: the free ones, plus the Pro ones once page-transitions-pro.ts is loaded. */
const registered = new Map<PageTransitionPreset, PageTransitionDefinition>(Object.entries(FREE) as [PageTransitionPreset, PageTransitionDefinition][]);

/** Adds presets (page-transitions-pro.ts registers the Pro ones). */
export function registerPageTransitions(definitions: Partial<Record<PageTransitionPreset, PageTransitionDefinition>>) {
  for (const [name, definition] of Object.entries(definitions) as [PageTransitionPreset, PageTransitionDefinition][]) registered.set(name, definition);
}

/** core — in the free valyro-ui package; pro — ValyroUI Pro (valyro-ui-pro, or the CLI's page-transitions-pro). */
export const pageTransitionTier = (preset: PageTransitionPreset): 'core' | 'pro' => (FREE_PAGE_TRANSITIONS.includes(preset) ? 'core' : 'pro');

/** Whether this build can play `preset` (a Pro one needs page-transitions-pro.ts loaded). */
export const isPageTransitionAvailable = (preset: PageTransitionPreset) => registered.has(preset);

const warned = new Set<string>();

/** The definition of `preset`, or fade for a Pro preset without Pro (said once per name in the console). */
function definitionOf(preset: PageTransitionPreset): PageTransitionDefinition {
  const definition = registered.get(preset);
  if (definition) return definition;
  if (!warned.has(preset)) {
    warned.add(preset);
    console.warn(
      PAGE_TRANSITIONS.includes(preset)
        ? `PageTransition: "${preset}" is a ValyroUI Pro preset; install valyro-ui-pro (or add page-transitions-pro with the CLI). Playing "fade".`
        : `PageTransition: unknown preset "${preset}". Playing "fade".`,
    );
  }
  return registered.get('fade')!;
}

/** The CPU variant a preset plays on machines without a GPU. */
export function pageTransitionCpuVariant(preset: PageTransitionPreset): PageTransitionCpuVariant {
  return registered.get(preset)?.cpu ?? 'dissolve';
}

interface CpuMove {
  /** The moving page away from its place: `side` +1 where the new page comes from, −1 where the old one goes. */
  away: (c: PageTransitionContext, side: number) => Keyframe;
  /** The page in its place. */
  rest: Keyframe;
  duration: number;
}

const CPU_MOVES: Record<PageTransitionCpuVariant, CpuMove> = {
  dissolve: { away: () => ({ opacity: 0 }), rest: { opacity: 1 }, duration: 160 },
  'nudge-x': { away: ({ x }, side) => ({ opacity: 0, transform: `translateX(${24 * x * side}px)` }), rest: { opacity: 1, transform: 'translateX(0px)' }, duration: 180 },
  'nudge-y': { away: ({ y }, side) => ({ opacity: 0, transform: `translateY(${24 * y * side}px)` }), rest: { opacity: 1, transform: 'translateY(0px)' }, duration: 180 },
  slide: { away: ({ x }, side) => ({ transform: `translateX(${100 * x * side}%)` }), rest: { transform: 'translateX(0%)' }, duration: 240 },
  rise: { away: ({ y }, side) => ({ transform: `translateY(${fullHeight(y * side)})` }), rest: { transform: 'translateY(0px)' }, duration: 260 },
};

/**
 * The CPU variant of a preset: only the page on top moves — the new one in, or, where the full preset
 * lifts the old one off (uncover, a stack popped going back), the old one out the opposite way — and the
 * page under it has no animation at all.
 */
function cpuSpec(variant: PageTransitionCpuVariant, context: PageTransitionContext, top: 'exit' | 'enter'): PageTransitionSpec {
  const { away, rest, duration } = CPU_MOVES[variant];
  const moving = top === 'enter' ? motion([away(context, 1), rest]) : motion([rest, away(context, -1)]);
  return { exit: top === 'exit' ? moving : still(), enter: top === 'enter' ? moving : still(), top, duration, cost: 'compositor' };
}

/** The keyframes, layering and length of a preset for one change of page. */
export function pageTransitionSpec(preset: PageTransitionPreset, { direction = 'forward', rtl = false, origin, radius, tier = 'gpu' }: PageTransitionOptions = {}): PageTransitionSpec {
  const back = direction === 'back';
  const forwardX: 1 | -1 = rtl ? -1 : 1;
  const round = (value: number) => `${Math.round(value * 10) / 10}px`;
  const definition = definitionOf(preset);
  const context: PageTransitionContext = {
    x: back ? (-forwardX as -1 | 1) : forwardX,
    fx: forwardX,
    y: back ? -1 : 1,
    back,
    at: origin ? `${round(origin.x)} ${round(origin.y)}` : '50% 50%',
    radius: radius === undefined ? '150%' : round(radius),
  };
  const full = definition.build(context);
  return tier === 'cpu' ? cpuSpec(definition.cpu, context, full.top) : full;
}

/**
 * Under reduced motion every preset becomes a short dissolve: the new page fades in over the old one —
 * no travel, no zoom, no turn, and only one page animates.
 */
export function reducedPageTransition(): PageTransitionSpec {
  return { exit: still(), enter: motion([{ opacity: 0 }, { opacity: 1 }]), top: 'enter', duration: 160, cost: 'compositor' };
}

/** The tempo of the theme as a factor of the reference 200 ms, kept within reason: 0.6–1.6. */
export function pageTransitionTempo(themeDuration: number | undefined) {
  if (!themeDuration || !Number.isFinite(themeDuration)) return 1;
  return Math.min(1.6, Math.max(0.6, themeDuration / 200));
}

/** Distance from `origin` to the farthest corner of a `width` × `height` box: the radius that covers all of it. */
export function coverRadius(origin: { x: number; y: number }, width: number, height: number) {
  const dx = Math.max(origin.x, width - origin.x);
  const dy = Math.max(origin.y, height - origin.y);
  return Math.hypot(dx, dy);
}

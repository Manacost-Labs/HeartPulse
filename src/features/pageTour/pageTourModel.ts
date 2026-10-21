/** A small animated explainer drawn above the step text (see PageTourMedia.tsx). */
export type PageTourMediaKind = 'filters' | 'views' | 'interval' | 'scatter' | 'heat' | 'band' | 'impact' | 'sankey' | 'trend';

export type TourPlacement = 'top' | 'right' | 'bottom' | 'left' | 'bottom-sheet';

export type TourRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type PageTourLike = {
  id: string;
  version: number;
  paths: readonly string[];
};

function safePathname(value: string): string {
  const input = value.trim() || '/';
  try {
    return new URL(input, 'https://hearthpulse.net').pathname;
  } catch {
    return input.split(/[?#]/, 1)[0] || '/';
  }
}

export function normalizeTourPath(value: string): string {
  const pathname = safePathname(value.startsWith('/') || /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `/${value}`);
  const normalized = pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '');
  return normalized || '/';
}

function pathPatternMatches(path: string, pattern: string): boolean {
  const pathParts = normalizeTourPath(path).split('/').filter(Boolean);
  const patternParts = normalizeTourPath(pattern).split('/').filter(Boolean);
  if (pathParts.length !== patternParts.length) return false;
  return patternParts.every((part, index) => part.startsWith(':') || part === pathParts[index]);
}

export function resolvePageTour<T extends Pick<PageTourLike, 'paths'>>(path: string, registry: readonly T[]): T | null {
  const normalizedPath = normalizeTourPath(path);
  for (const tour of registry) {
    if (tour.paths.some(pattern => !pattern.includes(':') && normalizeTourPath(pattern) === normalizedPath)) return tour;
  }
  const candidates = registry.flatMap((tour, registryIndex) => tour.paths
    .filter(pattern => pattern.includes(':') && pathPatternMatches(normalizedPath, pattern))
    .map(pattern => ({
      tour,
      registryIndex,
      staticSegments: normalizeTourPath(pattern).split('/').filter(part => part && !part.startsWith(':')).length,
    })));
  candidates.sort((left, right) => (
    right.staticSegments - left.staticSegments
    || left.registryIndex - right.registryIndex
  ));
  return candidates[0]?.tour ?? null;
}

export type PageTourProgress = {
  status: 'in-progress' | 'dismissed' | 'completed';
  stepIndex: number;
};

export type PageTourStepProgress = {
  status: 'in-progress' | 'dismissed' | 'completed';
  stepId?: string;
};

export function parsePageTourProgress(serialized: string | null, stepCount: number): PageTourProgress | null {
  if (!serialized) return null;
  try {
    const value = JSON.parse(serialized) as unknown;
    if (!value || Array.isArray(value) || typeof value !== 'object') return null;
    const candidate = value as Record<string, unknown>;
    if (!['in-progress', 'dismissed', 'completed'].includes(String(candidate.status))) return null;
    if (typeof candidate.stepIndex !== 'number' || !Number.isFinite(candidate.stepIndex)) return null;
    const maximumIndex = Math.max(0, Math.trunc(stepCount) - 1);
    return {
      status: candidate.status as PageTourProgress['status'],
      stepIndex: Math.min(Math.max(Math.trunc(candidate.stepIndex), 0), maximumIndex),
    };
  } catch {
    return null;
  }
}

export function parsePageTourStepProgress(serialized: string | null): PageTourStepProgress | null {
  if (!serialized) return null;
  try {
    const value = JSON.parse(serialized) as unknown;
    if (!value || Array.isArray(value) || typeof value !== 'object') return null;
    const candidate = value as Record<string, unknown>;
    if (!['in-progress', 'dismissed', 'completed'].includes(String(candidate.status))) return null;
    return {
      status: candidate.status as PageTourStepProgress['status'],
      stepId: typeof candidate.stepId === 'string' ? candidate.stepId : undefined,
    };
  } catch {
    return null;
  }
}

export function restorePageTourStepIndex(
  progress: PageTourStepProgress | null,
  stepIds: readonly string[],
): number {
  if (!progress || progress.status === 'completed' || !progress.stepId || stepIds.length === 0) return 0;
  const savedIndex = stepIds.indexOf(progress.stepId);
  return savedIndex >= 0 ? savedIndex : 0;
}

export function shouldWaitForRestoredTourStep(
  progress: PageTourStepProgress | null,
  eligibleStepIds: readonly string[],
  availableStepIds: readonly string[],
): boolean {
  if (!progress || progress.status === 'completed' || !progress.stepId) return false;
  return eligibleStepIds.includes(progress.stepId) && !availableStepIds.includes(progress.stepId);
}

export function isTourTargetVisible(options: {
  targetRect: TourRect;
  viewport: { width: number; height: number };
  insets?: { top: number; right: number; bottom: number; left: number };
  minimumVisibleRatio?: number;
}): boolean {
  const {
    targetRect,
    viewport,
    insets = { top: 0, right: 0, bottom: 0, left: 0 },
    minimumVisibleRatio = 0.5,
  } = options;
  if (targetRect.width <= 0 || targetRect.height <= 0 || viewport.width <= 0 || viewport.height <= 0) return false;
  const usableLeft = Math.max(0, insets.left);
  const usableTop = Math.max(0, insets.top);
  const usableRight = Math.max(usableLeft, viewport.width - Math.max(0, insets.right));
  const usableBottom = Math.max(usableTop, viewport.height - Math.max(0, insets.bottom));
  const intersectionWidth = Math.max(0, Math.min(targetRect.right, usableRight) - Math.max(targetRect.left, usableLeft));
  const intersectionHeight = Math.max(0, Math.min(targetRect.bottom, usableBottom) - Math.max(targetRect.top, usableTop));
  const visibleRatio = (intersectionWidth * intersectionHeight) / (targetRect.width * targetRect.height);
  return visibleRatio >= Math.min(Math.max(minimumVisibleRatio, 0), 1);
}

export function filterAvailableTourSteps<T extends { target: string }>(
  steps: readonly T[],
  options: { isEligible: (step: T) => boolean; hasTarget: (target: string) => boolean },
): T[] {
  return steps.filter(step => options.isEligible(step) && options.hasTarget(step.target));
}

export function pageTourStorageKey(tour: Pick<PageTourLike, 'id' | 'version'>): string {
  return `manacost:page-tour:${tour.id}:v${tour.version}`;
}

function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), count - 1);
}

export function nextTourStepIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(clampIndex(index, count) + 1, count - 1);
}

export function previousTourStepIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return Math.max(clampIndex(index, count) - 1, 0);
}

export type TourStepPlan = { mode: 'popover' | 'sheet'; scrollBy: number };

/**
 * Where a step's card goes and how far the page scrolls first. A popover needs
 * a side of the target with room for the whole card, the way the Valyro
 * floating layer flips; when no side has room (a tall matrix, a full-width
 * chart) or on a phone, the card docks as a bottom sheet and the target moves
 * into the part of the screen above it. `safeTop` keeps targets clear of the
 * sticky header.
 */
export function planTourStep(options: {
  target: { left: number; top: number; width: number; height: number };
  card: { width: number; height: number };
  viewport: { width: number; height: number };
  safeTop: number;
  forceSheet?: boolean;
  offset?: number;
  padding?: number;
}): TourStepPlan {
  const { target, card, viewport, safeTop, forceSheet = false, offset = 12, padding = 12 } = options;
  const usable = viewport.height - safeTop - padding;
  const centeredTop = (height: number, room: number) => (height >= room ? safeTop : safeTop + (room - height) / 2);
  const scrollTo = (desiredTop: number) => {
    const delta = target.top - desiredTop;
    return Math.abs(delta) > 2 ? Math.round(delta) : 0;
  };
  const visible = target.top >= safeTop && target.top + target.height <= viewport.height - padding;
  const sideRoom = Math.max(target.left, viewport.width - target.left - target.width) - padding;
  const fitsBeside = sideRoom >= card.width + offset && card.height <= usable;
  const fitsAround = target.height + offset + card.height <= usable;

  if (!forceSheet && fitsAround) {
    const roomAbove = target.top - safeTop;
    const roomBelow = viewport.height - padding - target.top - target.height;
    if (visible && Math.max(roomAbove, roomBelow) >= card.height + offset) return { mode: 'popover', scrollBy: 0 };
    return { mode: 'popover', scrollBy: scrollTo(centeredTop(target.height + offset + card.height, usable)) };
  }
  if (!forceSheet && fitsBeside) {
    return { mode: 'popover', scrollBy: visible ? 0 : scrollTo(centeredTop(target.height, usable)) };
  }
  const freeBottom = Math.max(safeTop + 48, viewport.height - card.height - padding * 2);
  return { mode: 'sheet', scrollBy: scrollTo(centeredTop(target.height, freeBottom - safeTop)) };
}

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
    return new URL(input, 'https://arena.hs-manacost.ru').pathname;
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

export function resolvePageTour<T extends PageTourLike>(path: string, registry: readonly T[]): T | null {
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

export type TourTimeoutScheduler = {
  setTimeout: (callback: () => void, delay: number) => number;
  clearTimeout: (timerId: number) => void;
};

export function scheduleTourScrollCorrection(
  callback: () => void,
  delay: number,
  scheduler: TourTimeoutScheduler,
): () => void {
  let pending = true;
  const timerId = scheduler.setTimeout(() => {
    pending = false;
    callback();
  }, Math.max(0, delay));
  return () => {
    if (!pending) return;
    pending = false;
    scheduler.clearTimeout(timerId);
  };
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function placeTourPopover(options: {
  targetRect: TourRect;
  popoverSize: { width: number; height: number };
  viewport: { width: number; height: number };
  preferredPlacement?: Exclude<TourPlacement, 'bottom-sheet'>;
  gap?: number;
  padding?: number;
  mobile?: boolean;
}): { left: number; top: number; placement: TourPlacement } {
  const {
    targetRect,
    popoverSize,
    viewport,
    preferredPlacement = 'bottom',
    gap = 12,
    padding = 12,
    mobile = false,
  } = options;
  const maxLeft = viewport.width - popoverSize.width - padding;
  const maxTop = viewport.height - popoverSize.height - padding;

  if (mobile) {
    return {
      left: clamp((viewport.width - popoverSize.width) / 2, padding, maxLeft),
      top: clamp(viewport.height - popoverSize.height - padding, padding, maxTop),
      placement: 'bottom-sheet',
    };
  }

  const coordinates: Record<Exclude<TourPlacement, 'bottom-sheet'>, { left: number; top: number }> = {
    right: { left: targetRect.right + gap, top: targetRect.top + (targetRect.height - popoverSize.height) / 2 },
    left: { left: targetRect.left - popoverSize.width - gap, top: targetRect.top + (targetRect.height - popoverSize.height) / 2 },
    bottom: { left: targetRect.left + (targetRect.width - popoverSize.width) / 2, top: targetRect.bottom + gap },
    top: { left: targetRect.left + (targetRect.width - popoverSize.width) / 2, top: targetRect.top - popoverSize.height - gap },
  };
  const fits = (position: { left: number; top: number }) => (
    position.left >= padding
    && position.top >= padding
    && position.left + popoverSize.width <= viewport.width - padding
    && position.top + popoverSize.height <= viewport.height - padding
  );
  const fallbackOrder: Array<Exclude<TourPlacement, 'bottom-sheet'>> = [preferredPlacement, 'right', 'left', 'bottom', 'top'];
  const availableSpace: Record<Exclude<TourPlacement, 'bottom-sheet'>, number> = {
    right: viewport.width - targetRect.right,
    left: targetRect.left,
    bottom: viewport.height - targetRect.bottom,
    top: targetRect.top,
  };
  const placement = fallbackOrder.find((candidate, index) => fallbackOrder.indexOf(candidate) === index && fits(coordinates[candidate]))
    ?? (Object.entries(availableSpace).sort((a, b) => b[1] - a[1])[0]?.[0] as Exclude<TourPlacement, 'bottom-sheet'>)
    ?? preferredPlacement;
  const position = coordinates[placement];
  return {
    left: clamp(position.left, padding, maxLeft),
    top: clamp(position.top, padding, maxTop),
    placement,
  };
}

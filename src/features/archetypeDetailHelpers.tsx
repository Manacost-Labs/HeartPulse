import React from 'react';
import { isStandardMetaPeriod } from '../../shared/standardMetaPeriods';
import type { PaywallAccessState } from '../components/PaywallGate';
import { LoadingSurface } from '../shared/ui/LoadingSurface';
import { ArchetypesCatalogSkeleton } from './ArchetypesCatalogSkeleton';
import { AsyncSurfaceState } from './recovery/RecoverableSurface';
import type { ArchetypeCatalog } from './archetypeDetailTypes';
import type { ArchetypeClass } from './constructedArchetypeCatalogUrl';

/** The signed-in account keys the subscriber's cached matchup table; access itself stays with PaywallGate. */
export function viewerId(user: PaywallAccessState['authUser']): string | undefined {
  return user && 'id' in user && user.id !== null && user.id !== undefined ? String(user.id) : undefined;
}

export const BUILDS_PENDING_MESSAGE = 'Колоды появятся, когда наберётся выборка';

export function classIcon(classKey: ArchetypeClass | null): string {
  return classKey ? `/class_icon/ui/${classKey}-64.webp` : '/class_icon/neutral.webp';
}

// toLocaleString with options builds an Intl.NumberFormat per call, three per
// catalog row on every render. Counts use 3 digits, toLocaleString's default.
const NUMBER_FORMATS = new Map<number, Intl.NumberFormat>();
export function numberFormat(maximumFractionDigits: number): Intl.NumberFormat {
  const cached = NUMBER_FORMATS.get(maximumFractionDigits);
  if (cached) return cached;
  const format = new Intl.NumberFormat('ru-RU', { maximumFractionDigits });
  NUMBER_FORMATS.set(maximumFractionDigits, format);
  return format;
}

export function formatNumber(value: number | null, suffix = '', maximumFractionDigits = 1): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${numberFormat(maximumFractionDigits).format(value)}${suffix}`;
}

/** The page's HSGuru window: the detail answer names it only in `patch` (`black_empire_ban`). */
export function pagePeriod(detail: Pick<ArchetypeCatalog, 'period' | 'patch'>): string | null {
  return detail.period ?? (isStandardMetaPeriod(detail.patch) ? detail.patch : null);
}

export function LoadingState({ detail = false }: { detail?: boolean }) {
  if (!detail) return <ArchetypesCatalogSkeleton />;
  return <LoadingSurface label="Загружаем архетип" quiet layout="rows"
    className="archetypes-loading archetypes-loading--detail" />;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <AsyncSurfaceState
      variant="error"
      title="Не удалось открыть архетипы"
      message={message}
      actionLabel="Повторить запрос"
      onAction={onRetry}
      className="archetypes-state"
    />
  );
}


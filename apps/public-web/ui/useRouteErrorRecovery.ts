'use client';
import { classifyAppError } from '@/src/components/appErrorRecovery';
import { useRouteErrorReport } from './useRouteErrorReport';

/** The copy every error page shows when its tab outlived a deploy. */
const OUTDATED_PAGE = {
  heading: 'Сайт обновился',
  text: 'Вышла новая версия сайта. Обновите страницу, чтобы продолжить.',
  action: 'Обновить страницу',
} as const;

/**
 * What a route `error.tsx` shows and does with its error. It reports the error
 * and offers the way out that can work: a chunk that cannot load means the tab
 * outlived a deploy, and only a full reload brings the new code; any other
 * failure gets the page's own `copy` and the `retry` Next.js passes to it.
 */
export function useRouteErrorRecovery(
  error: Error & { digest?: string },
  retry: () => void,
  scope: string,
  copy: { heading: string; text: string },
): { heading: string; text: string; action: string; retry: () => void } {
  useRouteErrorReport(error, scope);
  return classifyAppError(error) === 'chunk'
    ? { ...OUTDATED_PAGE, retry: () => window.location.reload() }
    : { ...copy, action: 'Повторить', retry };
}

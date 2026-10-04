import { useSyncExternalStore } from 'react';

// The audience's zone: most viewers see no change once their own applies.
const PRE_HYDRATION_TIME_ZONE = 'Europe/Moscow';

const subscribe = () => () => undefined;

/**
 * Time zone for dates in server-rendered views. The server (UTC) and the
 * browser format a time differently, and different text breaks hydration;
 * so both first render it in one fixed zone, and the browser switches to the
 * viewer's own zone (`undefined`) right after hydrating.
 */
export function useViewerTimeZone(): string | undefined {
  return useSyncExternalStore(subscribe, () => undefined, () => PRE_HYDRATION_TIME_ZONE);
}

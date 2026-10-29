import { useSyncExternalStore } from 'react';
import { SERVER_RENDER_TIME_ZONE as PRE_HYDRATION_TIME_ZONE } from './serverRenderTimeZone';

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

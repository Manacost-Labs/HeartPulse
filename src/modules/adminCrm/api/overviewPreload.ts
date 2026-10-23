import { prefetchAdminResource } from '../../adminWorkspace/public';
import { adminCrmClient } from './adminCrmClient';

/** Cache key of the overview answer shared by the page and the early preload. */
export const OVERVIEW_KEY = '/api/admin/crm/overview';

/** Starts the overview request before the lazy page mounts (the admin landing section). */
export function preloadAdminOverview(): void {
  prefetchAdminResource(OVERVIEW_KEY, () => adminCrmClient.overview(false));
}

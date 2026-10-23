/**
 * Section code and data the admin page can start before the panel renders. The page entry loads
 * this small module beside the panel chunk; the panel's React.lazy sections use the same import
 * functions, so a prefetched chunk is the chunk the section later renders.
 */
import { loadAdminOverviewPage, preloadAdminOverview } from '../../modules/adminCrm/public';
import { prefetchAdminResource } from '../../modules/adminWorkspace/public';
import type { AdminWorkspaceSection } from '../adminWorkspaceState';
import { preloadAdminUsers } from '../useAdminUsersList';
import { adminSectionFromSearch } from './adminNavigation';
import { ADMIN_READS, type AdminRead } from './adminPanelRequests';

export const SECTION_CHUNKS = {
  dashboard: loadAdminOverviewPage,
  articles: () => import('../ContestAdminArticles'),
  gallery: () => import('../ContestAdminGallery'),
  translations: () => import('../ContestAdminTranslations'),
  mechanics: () => import('../ContestAdminMechanicTranslations'),
  operations: () => import('../ContestAdminStandardOperations'),
  apiKeys: () => import('../../modules/developerApi/public'),
} as const;

const SECTION_CODE: Partial<Record<AdminWorkspaceSection, () => Promise<unknown>>> = {
  dashboard: SECTION_CHUNKS.dashboard,
  articles: SECTION_CHUNKS.articles,
  gallery: SECTION_CHUNKS.gallery,
  translations: SECTION_CHUNKS.translations,
  mechanics: SECTION_CHUNKS.mechanics,
  'fun-decks': SECTION_CHUNKS.operations,
  'standard-data': SECTION_CHUNKS.operations,
  'api-keys': SECTION_CHUNKS.apiKeys,
};

/** Pointing at a menu item starts downloading that section's code, ahead of the click. */
export function prefetchSectionCode(section: AdminWorkspaceSection): void {
  void SECTION_CODE[section]?.().catch(() => { /* the section shows its own error when it is opened */ });
}

const prefetchRead = (read: AdminRead<unknown>) => prefetchAdminResource(read.key, read.load);

const SECTION_DATA: Partial<Record<AdminWorkspaceSection, () => void>> = {
  dashboard: preloadAdminOverview,
  users: preloadAdminUsers,
  contests: () => prefetchRead(ADMIN_READS.contests),
  referrals: () => prefetchRead(ADMIN_READS.referrals),
  boosty: () => { prefetchRead(ADMIN_READS.boostyStatus); prefetchRead(ADMIN_READS.boostySubscribers); },
  telegram: () => prefetchRead(ADMIN_READS.telegram),
};

/**
 * Starts the code and data of the section the address opens while the panel is still loading, so
 * its first screen does not wait for a second round of requests. Called only after the browser
 * confirmed the session; the API checks every request again.
 */
export function preloadAdminSection(search: string, fullAccess: boolean): void {
  const section = fullAccess ? adminSectionFromSearch(search, 'dashboard') : 'contests';
  prefetchSectionCode(section);
  SECTION_DATA[section]?.();
}

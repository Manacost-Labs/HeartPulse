export {
  ADMIN_RESOURCE_FRESH_MS,
  invalidateAdminResources,
  prefetchAdminResource,
  useAdminResource,
  type AdminResource,
  type AdminResourceOptions,
} from './ui/useAdminResource';

/** Loads the private Wild catalog only for the Next page that renders it. */
export function loadWildArchetypesPage() {
  return import('./ui/WildArchetypesPage');
}

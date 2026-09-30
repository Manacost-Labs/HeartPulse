export type { AdminClientCardProps } from './ui/AdminClientCard';
export { AdminSegmentBar } from './ui/AdminSegmentBar';
export { adminCrmClient } from './api/adminCrmClient';
export type { AdminCrmPerson, AdminCrmSegmentId, AdminCrmSegments } from './api/adminCrmClient';

/** The client card opens only on demand, so it stays out of the admin route chunk. */
export function loadAdminClientCard() {
  return import('./AdminClientCard.lazy');
}

/** The generic form sheet opens only on demand as well; admin editors lazy-load it. */
export function loadAdminSheet() {
  return import('./AdminSheet.lazy');
}
export type { AdminSheetProps } from './ui/AdminSheet';

/** The overview (alerts, KPIs, activity) is the admin landing page; it loads on demand like other sections. */
export function loadAdminOverviewPage() {
  return import('./AdminOverviewPage.lazy');
}
export { personAccess, personContacts, personInitial } from './ui/peopleListModel';
export { AdminFilterChips } from './ui/AdminFilterChips';

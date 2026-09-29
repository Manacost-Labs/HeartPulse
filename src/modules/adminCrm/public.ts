export type { AdminClientCardProps } from './ui/AdminClientCard';
export { AdminSegmentBar } from './ui/AdminSegmentBar';
export { adminCrmClient } from './api/adminCrmClient';
export type { AdminCrmPerson, AdminCrmSegmentId, AdminCrmSegments } from './api/adminCrmClient';

/** The client card opens only on demand, so it stays out of the admin route chunk. */
export function loadAdminClientCard() {
  return import('./AdminClientCard.lazy');
}

/** The money section loads its charts and styles only when an administrator opens it. */
export function loadAdminMoneyPage() {
  return import('./AdminMoneyPage.lazy');
}

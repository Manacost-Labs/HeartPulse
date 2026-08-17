import type { AuthUser } from './authUser';

/** UI policy only; server-side authorization remains authoritative for every mutation. */
export function canAccessAdminWorkspace(user: AuthUser | null | undefined): boolean {
  return user?.adminAllowed === true;
}

/** Contest administrators may have narrower access than full workspace administrators. */
export function canManageContests(user: AuthUser | null | undefined): boolean {
  return user?.contestAdminAllowed === true || canAccessAdminWorkspace(user);
}

export {
  fetchCurrentAuthSession,
  fetchCurrentAuthUser,
} from './api/authSessionApi';
export { hasAuthSessionHint, markAuthSessionHint, clearAuthSessionHint } from './model/authSessionHint';
export {
  canAccessAdminWorkspace,
  canManageContests,
} from './model/authAccess';
export type { AuthUser } from './model/authUser';
export { default as AuthAvatar } from './ui/AuthAvatar';
export type { AccountPlanSummary } from './model/accountPlan';
/** The composition supplies the priced plan card here; see the slot's note. */
export { AccountPlanCardSlot, type AccountPlanCardProps } from './ui/accountPlanCardSlot';
/** The composition supplies the game statistics section here; see the slot's note. */
export { AccountGameStatsSlot, type AccountGameStatsProps } from './ui/accountGameStatsSlot';
/** The sign-in card's loading state; its renderer imports `ui/LoginCardSkeleton.css` and `LoadingSurface.css`. */
export { LoginCardSkeleton } from './ui/LoginCardSkeleton';

/** Keeps the account UI out of the initial application bundle. */
export const loadLoginPanel = () => import('./ui/LoginPanel')
  .then(module => ({ default: module.LoginPanel }));

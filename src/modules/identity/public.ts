export type { AuthUser } from './model/authUser';
export { publicProfilePath } from './model/publicProfilePath';

/** Keeps the account UI out of the initial application bundle. */
export const loadLoginPanel = () => import('./ui/LoginPanel')
  .then(module => ({ default: module.LoginPanel }));

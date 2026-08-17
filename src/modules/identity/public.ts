export {
  fetchCurrentAuthUser,
} from './api/authSessionApi';
export type { AuthUser } from './model/authUser';
export {
  publicProfileIdFromPath,
  publicProfilePath,
} from './model/publicProfilePath';
export { default as AuthAvatar } from './ui/AuthAvatar';

/** Keeps the account UI out of the initial application bundle. */
export const loadLoginPanel = () => import('./ui/LoginPanel')
  .then(module => ({ default: module.LoginPanel }));

/** Keeps the public-profile route independent from login and the application shell. */
export const loadPublicProfilePage = () => import('./ui/PublicProfilePage')
  .then(module => ({ default: module.default }));

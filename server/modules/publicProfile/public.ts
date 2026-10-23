/**
 * The stable numeric account ID (`users.public_numeric_id`), the public
 * profile at `/id/<n>/` it addresses and the optional nickname behind
 * `/u/<nickname>/`. Connected applications and the Reader API identify an
 * account by the same numeric ID.
 */
export { isPublicProfileId } from './identity.js';
export {
  PUBLIC_PROFILE_FIELDS,
  serializePublicProfile,
  type PublicProfileCandidate,
  type PublicProfileRecord,
} from './model.js';
export {
  nicknameLookupKey,
  validateNickname,
  type NicknameContentCheck,
  type NicknameValidation,
} from './nickname.js';
export {
  ensurePublicProfileIds,
  ensurePublicProfileSchema,
  findPublicProfile,
  resolveUserPublicProfileId,
  type PublicProfileIdentityOptions,
} from './repository.js';
export {
  claimNickname,
  ensurePublicNicknameSchema,
  findPublicProfileIdByNickname,
  readOwnPublicIdentity,
  type NicknameClaimResult,
  type OwnPublicIdentity,
} from './nicknameRepository.js';
export {
  createPublicProfileRouter,
  type PublicProfileRouterDependencies,
} from './routes.js';

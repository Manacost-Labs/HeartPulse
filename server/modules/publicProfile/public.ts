/**
 * The stable numeric account ID (`users.public_numeric_id`). It used to back a
 * public profile page; that page is gone, but connected applications and the
 * Reader API still identify an account by it, so assignment stays.
 */
export { isPublicProfileId } from './identity.js';
export {
  ensurePublicProfileIds,
  resolveUserPublicProfileId,
  type PublicProfileIdentityOptions,
} from './repository.js';

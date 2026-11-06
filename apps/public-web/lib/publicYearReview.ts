import 'server-only';
import { cache } from 'react';
import { fetchPublicExpress } from './expressApi';
import { PROFILE_ID, readYearReview, type PublicYearReview } from './publicYearReviewData';

export { className, monthName, percent, readYearReview, type PublicYearReview } from './publicYearReviewData';

/** The review of a public profile, or null (hidden profile, closed year, no such profile). Throws when the API is down. */
export const loadPublicYearReview = cache(async (profileId: string, year: string): Promise<PublicYearReview | null> => {
  if (!PROFILE_ID.test(profileId) || !/^20\d\d$/.test(year)) return null;
  const response = await fetchPublicExpress(`/api/profiles/${encodeURIComponent(profileId)}/year/${year}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Year in review temporarily unavailable');
  return readYearReview(await response.json());
});

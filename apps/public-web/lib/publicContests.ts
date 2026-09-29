import 'server-only';
import { contestsFromResponse } from '@/src/modules/contests/public';
import { fetchPublicExpress } from './expressApi';

/** Fetches only the anonymous projection; viewer entries never enter shared SSR state. */
export async function loadPublicContests() {
  const response = await fetchPublicExpress('/api/contests');
  if (!response.ok) throw new Error('Public contests temporarily unavailable');
  return contestsFromResponse(await response.json());
}

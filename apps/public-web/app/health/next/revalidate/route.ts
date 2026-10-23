import 'server-only';
import { revalidatePath } from 'next/cache';
import { isLocalRevalidateRequest } from '@/apps/public-web/lib/localRevalidateRequest';

/** Prerendered pages whose build copy has no data (CI builds without the Express API). */
const DATA_PAGES = ['/standard/meta', '/articles'] as const;

/**
 * Marks the prerendered data pages stale right after a deploy, so the next
 * request regenerates them with data instead of serving the build copy for up
 * to five minutes (`scripts/warm-prerendered-pages.mjs`). Anything but a direct
 * call on the host answers 404; it takes no input and only schedules a
 * regeneration of these two pages.
 */
export function POST(request: Request) {
  if (!isLocalRevalidateRequest(request.headers)) {
    return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  for (const path of DATA_PAGES) revalidatePath(path, 'page');
  return Response.json({ revalidated: DATA_PAGES }, { headers: { 'Cache-Control': 'no-store' } });
}

import 'server-only';
import { revalidatePath } from 'next/cache';
import { DATA_PAGE_PROBES, dataSourceAvailable, type DataPageProbePath } from '@/apps/public-web/lib/dataPageProbes';
import { isLocalRevalidateRequest } from '@/apps/public-web/lib/localRevalidateRequest';

/** Prerendered pages whose build copy has no data (CI builds without the Express API). */
const DATA_PAGES = ['/standard/meta', '/standard/meta/wild', '/articles', '/tierlist', '/classes', '/legendaries', '/heroes', '/standard/matchups', '/standard/vicious-gold',
  '/library', '/library/minions', '/library/spells', '/library/anomalies', '/library/dark-gifts', '/library/quests', '/library/rewards', '/library/darkmoon-prizes', '/library/trinkets', '/library/timewarped', '/battlegrounds/tier-list',
  '/standard', '/arena', '/battlegrounds', '/wild', '/guides-archive'] as const satisfies readonly DataPageProbePath[];

/**
 * Marks the prerendered data pages stale right after a deploy, so the next
 * request regenerates them with data instead of serving the build copy for up
 * to five minutes (`scripts/warm-prerendered-pages.mjs`). Anything but a direct
 * call on the host answers 404. `?paths=/a,/b` narrows the call to those of
 * these pages (the warm-up asks again only for the pages still without data:
 * a revalidated page is expired, and the next visitor waits for its render);
 * it only schedules a regeneration of these pages.
 */
export async function POST(request: Request) {
  if (!isLocalRevalidateRequest(request.headers)) {
    return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  // A page whose source is down stays as it is: the earlier copy is better than a page regenerated without data
  // (or a failed regeneration). The warm-up repeats the call until the source answers.
  const asked = new URL(request.url).searchParams.get('paths')?.split(',').map(path => path.replace(/\/$/, '')) ?? null;
  const pages = asked ? DATA_PAGES.filter(path => asked.includes(path)) : DATA_PAGES;
  const available = await Promise.all(pages.map(path => dataSourceAvailable(DATA_PAGE_PROBES[path])));
  const revalidated: string[] = [];
  const skipped: { path: string; reason: 'source-unavailable' }[] = [];
  pages.forEach((path, index) => {
    if (available[index]) {
      revalidatePath(path, 'page');
      revalidated.push(path);
    } else skipped.push({ path, reason: 'source-unavailable' });
  });
  return Response.json({ revalidated, skipped }, { headers: { 'Cache-Control': 'no-store' } });
}

import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * `proxy.ts` answers every existing `/u/<nickname>/` with a 301 to the
 * canonical `/id/<n>/` before this page runs, so reaching it means the
 * nickname does not exist (or never did): the site's ordinary 404.
 */
export default function Page() {
  notFound();
}

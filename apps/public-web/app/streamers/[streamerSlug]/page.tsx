import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import '@/src/route-parchment.css';
import { resolvePublicUrlPolicy } from '@/src/shared/seo/publicUrlPolicy';
import { SHARE_IMAGE_HEIGHT, SHARE_IMAGE_WIDTH, shareImagePath } from '@/shared/shareImages';
import { loadPublicStreamer } from '@/apps/public-web/lib/publicStreamers';
import { StreamerPageClient } from '@/apps/public-web/ui/StreamerPageClient';

type Props = { params: Promise<{ streamerSlug: string }> };
export const dynamic = 'force-dynamic';

const SLUG = /^[a-z0-9_]{1,40}$/;

async function resolveStreamer(params: Props['params']) {
  const { streamerSlug } = await params;
  const slug = streamerSlug.toLowerCase();
  if (!SLUG.test(slug)) notFound();
  const streamer = await loadPublicStreamer(slug);
  if (streamer.missing) notFound();
  return { slug, streamer, pathname: `/streamers/${slug}/` };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, streamer, pathname } = await resolveStreamer(params);
  const policy = await resolvePublicUrlPolicy(pathname, '');
  const name = streamer.page?.streamer.name ?? slug;
  const title = `${name} — колоды стримера Hearthstone | HearthPulse`;
  const description = `Колоды, которые ${name} играет на стриме: коды, классы, архетипы и ранги Легенды, ссылки на Twitch и YouTube.`;
  const canonical = `https://hearthpulse.net${pathname}`;
  const avatar = streamer.page?.streamer.avatarUrl;
  return {
    title, description, alternates: { canonical }, robots: policy.robots,
    openGraph: { type: 'profile', url: canonical, siteName: 'HearthPulse', locale: 'ru_RU', title, description,
      images: avatar ? [avatar]
        : [{ url: shareImagePath(), alt: `HearthPulse — ${name}`, width: SHARE_IMAGE_WIDTH, height: SHARE_IMAGE_HEIGHT }] },
  };
}

export default async function Page({ params }: Props) {
  const { slug, streamer } = await resolveStreamer(params);
  return <StreamerPageClient slug={slug} initial={streamer.page} />;
}

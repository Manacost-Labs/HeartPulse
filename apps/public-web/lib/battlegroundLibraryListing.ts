import type { Metadata } from 'next';
import { seoPageForExactPath } from '../../../src/seo/registry';
import { resolvePublicUrlPolicy } from '../../../src/shared/seo/publicUrlPolicy';

const headings: Record<string, string> = {
  '/library': 'Библиотека Полей Сражений',
  '/library/minions': 'Существа Полей сражений',
  '/library/spells': 'Заклинания Полей сражений',
  '/library/anomalies': 'Аномалии Полей сражений',
  '/library/dark-gifts': 'Темные дары Полей сражений',
  '/library/quests': 'Квесты Полей сражений',
  '/library/rewards': 'Награды Полей сражений',
  '/library/darkmoon-prizes': 'Призы Ярмарки Новолуния',
  '/library/trinkets': 'Аксессуары Полей сражений',
  '/library/timewarped': 'Хрономальные карты Полей сражений',
  '/library/archive': 'Архив Полей сражений',
  '/library/archive/minions': 'Архив существ Полей сражений',
  '/library/archive/spells': 'Архив заклинаний Полей сражений',
  '/library/archive/anomalies': 'Архив аномалий Полей сражений',
  '/library/archive/quests': 'Архив квестов Полей сражений',
  '/library/archive/rewards': 'Архив наград Полей сражений',
  '/library/archive/darkmoon-prizes': 'Архив призов Ярмарки Новолуния',
  '/library/archive/trinkets': 'Архив аксессуаров Полей сражений',
};

export type LibrarySearch = Promise<Record<string, string | string[] | undefined>>;

export function battlegroundLibraryListing(path: string) {
  const normalized = path.replace(/\/+$/, '');
  const seo = seoPageForExactPath(normalized);
  const heading = headings[normalized];
  return seo && heading ? { pathname: `${normalized}/`, heading, description: seo.description, seo } : null;
}

export async function battlegroundLibraryMetadata(path: string, searchParams: LibrarySearch): Promise<Metadata> {
  const listing = battlegroundLibraryListing(path);
  if (!listing) throw new Error(`Missing Battleground library SEO contract: ${path}`);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) value.forEach(entry => params.append(key, entry));
    else if (value !== undefined) params.set(key, value);
  }
  const policy = await resolvePublicUrlPolicy(path, params.toString());
  const canonical = policy.canonicalUrl ?? `https://hearthpulse.net${listing.pathname}`;
  return {
    title: listing.seo.title, description: listing.seo.description,
    alternates: { canonical },
    robots: { index: policy.indexPolicy === 'index', follow: policy.indexPolicy !== 'noindex-nofollow' },
    openGraph: { type: 'website', url: canonical, siteName: 'HearthPulse', locale: 'ru_RU',
      title: listing.seo.title, description: listing.seo.description,
      images: [{ url: '/assets/og-preview.png', alt: listing.heading, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title: listing.seo.title, description: listing.seo.description,
      images: ['/assets/og-preview.png'] },
  };
}

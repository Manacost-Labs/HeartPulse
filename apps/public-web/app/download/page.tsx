import type { Metadata } from 'next';
import '@/src/route-parchment.css';
import './download.css';
import { APP_RELEASES_URL, loadAppDownloads, type AppDownload } from '@/apps/public-web/lib/appDownloads';

// The release links refresh hourly; the page itself needs no request input.
export const revalidate = 3600;

const TITLE = 'Hearthpulse — бесплатный трекер колоды и оверлей для Hearthstone';
const DESCRIPTION = 'Трекер колоды, оверлей Полей сражений, статистика и реплеи. Бесплатно, без рекламы и Overwolf. Windows, macOS, Linux.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: 'https://hearthpulse.net/download/' },
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website', siteName: 'Hearthpulse', url: 'https://hearthpulse.net/download/', title: TITLE, description: DESCRIPTION,
    images: [{ url: 'https://hearthpulse.net/main_assets/app/app-battlegrounds.webp', width: 960, height: 533 }],
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
};

type Copy = {
  lang: 'ru' | 'en';
  title: string;
  lead: string;
  points: string[];
  shots: [string, string, string];
  buttons: Record<AppDownload['platform'], string>;
  all: string;
  version: (version: string) => string;
};

const COPY: Copy[] = [
  {
    lang: 'ru',
    title: 'Hearthpulse',
    lead: 'Бесплатный трекер и оверлей для Hearthstone. Без рекламы и без Overwolf.',
    points: [
      'Оверлей колоды и соперника, счётчики и шансы на Полях сражений.',
      'Своя статистика: винрейт, ранг, MMR, лучшие колоды и герои.',
      'Реплеи на сайте одной кнопкой — без имён и BattleTag.',
    ],
    shots: ['Поля сражений: MMR и места', 'Стандартный: винрейт и ранг', 'Темы оформления'],
    buttons: { windows: 'Скачать для Windows', 'mac-arm': 'macOS (Apple Silicon)', 'mac-intel': 'macOS (Intel)', linux: 'Linux (AppImage)' },
    all: 'Все версии и файлы',
    version: version => `Версия ${version}`,
  },
  {
    lang: 'en',
    title: 'Hearthpulse',
    lead: 'A free Hearthstone deck tracker and overlay. No ads, no Overwolf.',
    points: [
      'Deck and opponent overlay, counters and Battlegrounds odds.',
      'Your own stats: win rate, rank, MMR, best decks and heroes.',
      'Share replays on the web in one click — no names or BattleTags.',
    ],
    shots: ['Battlegrounds: MMR and placements', 'Standard: win rate and rank', 'Themes'],
    buttons: { windows: 'Download for Windows', 'mac-arm': 'macOS (Apple Silicon)', 'mac-intel': 'macOS (Intel)', linux: 'Linux (AppImage)' },
    all: 'All versions and files',
    version: version => `Version ${version}`,
  },
];

const SHOTS = ['/main_assets/app/app-battlegrounds.webp', '/main_assets/app/app-standard.webp', '/main_assets/app/app-themes.webp'];
const PLATFORMS: AppDownload['platform'][] = ['windows', 'mac-arm', 'mac-intel', 'linux'];

/** «Сделано в Hearthpulse» landing: what the app is, three screenshots, downloads; Russian and English without JavaScript. */
export default async function Page() {
  const { version, downloads } = await loadAppDownloads();
  const link = (platform: AppDownload['platform']) => downloads.find(item => item.platform === platform)?.url ?? APP_RELEASES_URL;
  return (
    <main className="app-landing">
      <input className="app-landing__lang-input" type="radio" name="app-landing-lang" id="app-landing-ru" defaultChecked />
      <input className="app-landing__lang-input" type="radio" name="app-landing-lang" id="app-landing-en" />
      <nav className="app-landing__langs" aria-label="Язык / Language">
        <label htmlFor="app-landing-ru" lang="ru">Русский</label>
        <label htmlFor="app-landing-en" lang="en">English</label>
      </nav>
      {COPY.map(copy => (
        <section key={copy.lang} className={`app-landing__copy app-landing__copy--${copy.lang}`} lang={copy.lang}>
          <header className="app-landing__head">
            <img src="/hearthpulse-logo.webp" width={64} height={69} alt="" />
            <div>
              <h1>{copy.title}</h1>
              <p className="app-landing__lead">{copy.lead}</p>
            </div>
          </header>
          <ul className="app-landing__points">{copy.points.map(point => <li key={point}>{point}</li>)}</ul>
          <div className="app-landing__downloads">
            {PLATFORMS.map((platform, index) => (
              <a key={platform} className={index === 0 ? 'app-landing__button app-landing__button--primary' : 'app-landing__button'} href={link(platform)}>
                {copy.buttons[platform]}
              </a>
            ))}
          </div>
          <p className="app-landing__meta">
            {version ? `${copy.version(version)} · ` : ''}<a href={APP_RELEASES_URL}>{copy.all}</a>
          </p>
          <div className="app-landing__shots">
            {SHOTS.map((src, index) => (
              <figure key={src}>
                <img src={src} width={960} height={533} alt={copy.shots[index]} loading={index === 0 ? 'eager' : 'lazy'} />
                <figcaption>{copy.shots[index]}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}

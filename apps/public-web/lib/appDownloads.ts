/** The desktop app's public releases (the app's own update check reads the same feed). */
export const APP_RELEASES_URL = 'https://github.com/Zulut30/Hearthpulse_App/releases/latest';
const LATEST_RELEASE_API = 'https://api.github.com/repos/Zulut30/Hearthpulse_App/releases/latest';

export type AppDownload = { platform: 'windows' | 'mac-arm' | 'mac-intel' | 'linux'; url: string };
export type AppDownloads = { version: string | null; downloads: AppDownload[] };

/** Asset names of a release (`Hearthpulse-Setup-0.14.0-win-x64.exe` …) → the one button per platform. */
const PICK: Array<[AppDownload['platform'], RegExp]> = [
  ['windows', /^Hearthpulse-Setup-[\d.]+-win-x64\.exe$/],
  ['mac-arm', /^Hearthpulse-[\d.]+-macOS-arm64\.dmg$/],
  ['mac-intel', /^Hearthpulse-[\d.]+-macOS-x64\.dmg$/],
  ['linux', /^Hearthpulse-[\d.]+-linux-x64\.AppImage$/],
];

/** Picks the download buttons from a GitHub release; exported for tests. */
export function pickDownloads(release: unknown): AppDownloads {
  const value = release as { tag_name?: unknown; assets?: Array<{ name?: unknown; browser_download_url?: unknown }> } | null;
  const assets = Array.isArray(value?.assets) ? value.assets : [];
  const downloads: AppDownload[] = [];
  for (const [platform, pattern] of PICK) {
    const asset = assets.find(item => typeof item.name === 'string' && pattern.test(item.name));
    const url = typeof asset?.browser_download_url === 'string' ? asset.browser_download_url : '';
    if (url.startsWith('https://github.com/Zulut30/Hearthpulse_App/releases/download/')) downloads.push({ platform, url });
  }
  const tag = typeof value?.tag_name === 'string' && /^v\d+\.\d+\.\d+$/.test(value.tag_name) ? value.tag_name.slice(1) : null;
  return { version: tag, downloads };
}

/**
 * Direct links to the latest release, refreshed with the page (ISR). Without GitHub every button falls back to the
 * releases page, so the landing never breaks.
 */
export async function loadAppDownloads(): Promise<AppDownloads> {
  try {
    const response = await fetch(LATEST_RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'hearthpulse.net' },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(3_000),
    } as RequestInit);
    return response.ok ? pickDownloads(await response.json()) : { version: null, downloads: [] };
  } catch {
    return { version: null, downloads: [] };
  }
}

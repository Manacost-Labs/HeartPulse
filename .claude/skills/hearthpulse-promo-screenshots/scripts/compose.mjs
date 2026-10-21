// Social-media layouts: the raw shot on a branded HearthPulse background with
// a short caption and the hearthpulse.net mark. Everything is drawn in Chrome
// from the site's own assets (public/), so fonts and colours match the site.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

/** Target sizes in CSS px; files are written at `scale` (2 = @2x, the default). */
export const LAYOUTS = {
  x: { width: 1200, height: 675, label: 'X/Telegram' },
  vk: { width: 1080, height: 1350, label: 'VK/Instagram' },
  wide: { width: 1600, height: 900, label: '16:9' },
};

const ASSETS = {
  tavern: 'public/wallpaper/profile-hero-hth.webp',
  parchment: 'public/wallpaper/arena-parchment-v2.webp',
  logo: 'public/hearthpulse-logo.webp',
  display: 'public/fonts/hsdisplay-2026-10.woff2',
  inter: 'public/fonts/google/inter-cyrillic-400-700.woff2',
  interLatin: 'public/fonts/google/inter-latin-400-700.woff2',
};

function dataUri(root, path, type) {
  return `data:${type};base64,${readFileSync(join(root, path)).toString('base64')}`;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
}

function layoutHtml({ root, layout, theme, caption, subcaption, domain, shot }) {
  const portrait = layout.height > layout.width;
  const unit = Math.min(layout.width, layout.height) / 675;
  const font = (path, family, weight) => `@font-face { font-family: '${family}'; font-weight: ${weight};
    src: url(${dataUri(root, path, 'font/woff2')}) format('woff2'); }`;
  const dark = theme === 'tavern';
  const background = dark
    ? `linear-gradient(180deg, rgba(24, 12, 6, .78), rgba(24, 12, 6, .9)), url(${dataUri(root, ASSETS.tavern, 'image/webp')}) center / cover`
    : `url(${dataUri(root, ASSETS.parchment, 'image/webp')}) 0 0 / 520px auto repeat`;
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>
  ${font(ASSETS.display, 'HSDisplay', 400)} ${font(ASSETS.inter, 'Inter', '400 700')} ${font(ASSETS.interLatin, 'Inter', '400 700')}
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${layout.width}px; height: ${layout.height}px; overflow: hidden; }
  body { background: ${background}; color: ${dark ? '#f5e7c6' : '#30251c'}; font-family: Inter, sans-serif;
    display: grid; grid-template-rows: auto 1fr; gap: ${18 * unit}px; padding: ${(portrait ? 44 : 30) * unit}px ${(portrait ? 40 : 40) * unit}px ${(portrait ? 44 : 34) * unit}px;
    ${dark ? '' : 'box-shadow: inset 0 0 0 10px #2e160b, inset 0 0 0 12px #d9ab49, inset 0 0 120px rgba(84, 51, 22, .28);'} }
  header { display: flex; ${portrait ? 'flex-direction: column-reverse; gap: 22px;' : 'align-items: flex-start; justify-content: space-between; gap: 28px;'} }
  h1 { font-family: HSDisplay, serif; font-weight: 400; line-height: 1.08; letter-spacing: .005em;
    font-size: ${(portrait ? 40 : 34) * unit}px; ${dark ? 'text-shadow: 0 2px 8px rgba(0, 0, 0, .6);' : ''} }
  p { margin-top: ${8 * unit}px; font-size: ${(portrait ? 19 : 16) * unit}px; line-height: 1.3; opacity: .82; }
  .brand { display: flex; align-items: center; gap: ${10 * unit}px; flex: none; white-space: nowrap;
    font-family: HSDisplay, serif; font-size: ${20 * unit}px; color: ${dark ? '#f1d27e' : '#5a3418'}; }
  .brand img { width: ${34 * unit}px; height: auto; }
  figure { min-height: 0; display: flex; align-items: center; justify-content: center; }
  figure img { display: block; max-width: 100%; max-height: 100%; object-fit: contain; border-radius: ${10 * unit}px;
    border: ${2 * unit}px solid #d9ab49; box-shadow: 0 ${10 * unit}px ${34 * unit}px rgba(0, 0, 0, ${dark ? '.55' : '.32'}); }
  </style></head><body>
  <header><div><h1>${escapeHtml(caption)}</h1>${subcaption ? `<p>${escapeHtml(subcaption)}</p>` : ''}</div>
  <div class="brand"><img src="${dataUri(root, ASSETS.logo, 'image/webp')}" alt="">${escapeHtml(domain)}</div></header>
  <figure><img src="data:image/png;base64,${readFileSync(shot).toString('base64')}" alt=""></figure>
  </body></html>`;
}

/**
 * Writes `<id>-<layout>.png` and `.webp` for every layout of the shot and
 * returns their paths. A shot without `caption` or `layouts` gets no layouts.
 */
export async function composeLayouts(browser, root, out, shot, raw, brand) {
  if (!shot.caption || !shot.layouts?.length) return [];
  const sharp = createRequire(join(root, 'package.json'))('sharp');
  const scale = brand.scale ?? 2;
  const files = [];
  for (const name of shot.layouts) {
    const layout = LAYOUTS[name];
    if (!layout) throw new Error(`${shot.id}: unknown layout ${name}; use ${Object.keys(LAYOUTS).join(', ')}`);
    const context = await browser.newContext({ viewport: { width: layout.width, height: layout.height }, deviceScaleFactor: scale });
    try {
      const page = await context.newPage();
      await page.setContent(layoutHtml({ root, layout, theme: shot.background ?? brand.background ?? 'tavern',
        caption: shot.caption, subcaption: shot.subcaption, domain: brand.domain ?? 'hearthpulse.net', shot: raw }));
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
      });
      const png = join(out, `${shot.id}-${name}-${layout.width}x${layout.height}.png`);
      await page.screenshot({ path: png });
      const webp = png.replace(/\.png$/, '.webp');
      await sharp(png).webp({ quality: 90 }).toFile(webp);
      files.push(png, webp);
    } finally {
      await context.close();
    }
  }
  return files;
}

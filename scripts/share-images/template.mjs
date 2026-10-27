/*
 * One 1200×630 link-preview page in the site's current material: parchment
 * canvas inside the `main-page-rail-border` wooden frame, HSDisplay headings
 * and Inter body text from `public/fonts`. Asset URLs are site-relative and
 * resolve against the static server of `render-share-images.mjs`.
 */

export function shareImageHtml({ kicker, title, subtitle, art, palette }) {
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<style>
  @font-face { font-family: HSDisplay; src: url('/fonts/hsdisplay-2026-10.woff2') format('woff2'); }
  @font-face { font-family: Inter; font-weight: 400 700; src: url('/fonts/google/inter-cyrillic-400-700.woff2') format('woff2');
    unicode-range: U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }
  @font-face { font-family: Inter; font-weight: 400 700; src: url('/fonts/google/inter-latin-400-700.woff2') format('woff2'); }
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
  body {
    position: relative; color: #30251c; font-family: Inter, sans-serif;
    background:
      radial-gradient(ellipse 70% 80% at 76% 50%, rgba(247, 232, 191, 0.85), rgba(247, 232, 191, 0) 70%),
      url('/wallpaper/arena-parchment-v2.webp') center / 865px 878px repeat, #ead6a7;
  }
  .frame {
    position: absolute; inset: 0; pointer-events: none;
    border: 28px solid transparent;
    border-image: url('/wallpaper/main-page-rail-border.png') 18 / 28px stretch;
    box-shadow: inset 0 0 46px rgba(67, 35, 14, 0.28);
  }
  .layout {
    position: absolute; inset: 28px; display: grid;
    grid-template-columns: 1fr 340px; align-items: center; padding: 0 24px 64px 64px;
  }
  .copy { display: flex; flex-direction: column; gap: 22px; min-width: 0; }
  .brand { display: flex; align-items: center; gap: 16px; }
  .brand img { width: 70px; height: 76px; filter: drop-shadow(0 3px 4px rgba(46, 22, 11, 0.35)); }
  .brand b { font: 48px/1 HSDisplay, serif; color: #2e160b; letter-spacing: 0.01em; }
  .kicker {
    align-self: flex-start; padding: 8px 16px 7px; border-radius: 6px;
    font: 700 22px/1 Inter, sans-serif; letter-spacing: 0.08em; text-transform: uppercase;
    color: #fff0c8; background: ${palette.accent}; box-shadow: inset 0 -3px 0 ${palette.accentDark};
  }
  h1 {
    font: 76px/1 HSDisplay, serif; white-space: nowrap; color: ${palette.title};
    text-shadow: 0 2px 0 rgba(247, 232, 191, 0.75);
  }
  .subtitle { font: 600 32px/1.2 Inter, sans-serif; color: #30251c; }
  .domain {
    position: absolute; left: 92px; bottom: 58px;
    font: 700 28px/1 Inter, sans-serif; color: #5f371d; letter-spacing: 0.02em;
  }
  .domain::before {
    content: ''; display: inline-block; width: 34px; height: 4px; margin: 0 14px 7px 0;
    vertical-align: middle; background: ${palette.accent}; border-radius: 2px;
  }
  .art {
    position: relative; display: grid; place-items: center; height: 100%;
  }
  .art::before {
    content: ''; position: absolute; width: 360px; height: 360px; border-radius: 50%;
    background: radial-gradient(circle, ${palette.glow}, rgba(217, 171, 73, 0) 68%);
  }
  .art > * { position: relative; }
  .art img, .art svg { filter: drop-shadow(0 12px 14px rgba(46, 22, 11, 0.38)); }
  .art-grid { display: grid; grid-template-columns: repeat(2, 136px); gap: 22px 26px; }
  .art-fan { display: grid; place-items: center; width: 360px; height: 300px; }
  .art-fan > img { grid-area: 1 / 1; }
  .art-trophy svg { width: 100%; height: 100%; }
</style></head>
<body>
  <div class="layout">
    <div class="copy">
      <div class="brand"><img src="/hearthpulse-logo.webp" alt=""><b>HearthPulse</b></div>
      ${kicker ? `<span class="kicker">${kicker}</span>` : ''}
      <h1>${title}</h1>
      <p class="subtitle">${subtitle}</p>
    </div>
    <div class="art">${art}</div>
  </div>
  <p class="domain">hearthpulse.net</p>
  <div class="frame"></div>
</body></html>`;
}

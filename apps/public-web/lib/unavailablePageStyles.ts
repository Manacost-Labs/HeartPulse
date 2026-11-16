/**
 * Styles of the «data temporarily unavailable» document the proxy answers with
 * (`unavailablePage.ts`). The page must not need Express, the Next bundle or
 * any script, so it carries its own small stylesheet: the tokens of
 * `src/styles/tokens.css` and the rail/parchment surfaces of `design.md`,
 * restated here because a proxy response cannot import the route CSS.
 * Everything it loads is a static file of `public/`.
 */
const FONTS = `
@font-face{font-family:HSDisplay;src:url(/fonts/hsdisplay-2026-10.woff2) format('woff2');font-weight:400;font-display:swap}
@font-face{font-family:Inter;font-style:normal;font-weight:400 700;font-display:swap;src:url(/fonts/google/inter-cyrillic-400-700.woff2) format('woff2');unicode-range:U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116}
@font-face{font-family:Inter;font-style:normal;font-weight:400 700;font-display:swap;src:url(/fonts/google/inter-latin-400-700.woff2) format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}`;

const BASE = `
:root{--rail:#741a1a;--ink:#30251c;--ink-soft:#5a4636;--parchment:#ead6a7;--parchment-light:#f7e8bf;--red:#8d171d;--red-dark:#5d0d13;--gold:#efc96f;--wood:#2e160b;--frame:#6b4c2a;--on-rail:#f6e3b4;--display:HSDisplay,Georgia,serif;--body:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;color-scheme:light}
*{box-sizing:border-box}
html{background:var(--rail);-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;min-height:100vh;min-height:100dvh;color:var(--ink);font:400 1rem/1.55 var(--body);background:var(--parchment)}
a{color:inherit}
:focus-visible{outline:3px solid var(--red);outline-offset:2px}
.rail :focus-visible,.topbar :focus-visible,.footer :focus-visible{outline-color:var(--gold)}
.skip{position:absolute;left:8px;top:-100px;z-index:20;padding:10px 14px;border-radius:6px;color:#fff0c8;background:var(--red-dark);font-weight:600}
.skip:focus{top:8px}
.shell{min-height:100vh;min-height:100dvh}
.work{min-width:0;background:var(--parchment) url(/wallpaper/arena-parchment-v2.webp) center top/865px 878px repeat}`;

const RAIL = `
.red-surface{background:linear-gradient(90deg,rgba(70,6,10,.18),rgba(112,18,22,.08)),url(/wallpaper/arena-rail-red.jpg) center/375px 172px repeat var(--rail)}
.brand{display:flex;align-items:center;gap:10px;min-height:44px;color:#fff1c8;text-decoration:none;font:400 1.4rem/1 var(--display);text-shadow:0 2px 3px rgba(30,3,5,.6)}
.brand img{display:block;width:30px;height:32px;object-fit:contain}
.topbar{position:sticky;top:0;z-index:10;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:61px;padding:8px 14px;border-bottom:10px solid transparent;border-image:url(/wallpaper/main-page-rail-border.png) 18 stretch;border-image-width:0 0 10px 0;color:#fff1ca}
.drawer summary{display:grid;place-items:center;width:44px;height:44px;border:1px solid rgba(238,201,116,.55);border-radius:4px;color:#fff1ca;background:rgba(40,4,8,.35);cursor:pointer;list-style:none}
.drawer summary::-webkit-details-marker{display:none}
.drawer summary svg{display:block}
.drawer summary .close,.drawer[open] summary .open{display:none}
.drawer[open] summary .close{display:block}
.drawer-nav{position:absolute;left:0;right:0;top:100%;max-height:calc(100vh - 71px);max-height:calc(100dvh - 71px);overflow-y:auto;overscroll-behavior:contain;padding:8px 12px 16px;background:linear-gradient(0deg,rgba(40,4,8,.35),rgba(40,4,8,.35)),url(/wallpaper/arena-rail-red.jpg) center/375px 172px repeat var(--rail);box-shadow:0 14px 24px rgba(30,3,5,.45)}
.rail{display:none}
.nav-title{display:flex;align-items:center;gap:8px;margin:14px 8px 4px;padding-top:12px;border-top:1px solid rgba(246,227,180,.22);color:var(--gold);font:700 .75rem/1.3 var(--body);letter-spacing:.08em;text-transform:uppercase}
.nav-title:first-child{margin-top:4px;padding-top:0;border-top:0}
.nav-list{margin:0;padding:0;list-style:none}
.nav-link{display:flex;align-items:center;min-height:44px;padding:8px 12px;border-radius:4px;color:var(--on-rail);text-decoration:none;font:400 1rem/1.25 var(--display);text-shadow:0 1px 2px rgba(30,3,5,.55)}
.nav-link:hover{background:rgba(30,3,5,.28);color:#fff7dc}`;

const WORK = `
.utility{padding:10px 12px}
.search{display:flex;gap:8px;max-width:48rem}
.search label{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.search input{flex:1;min-width:0;height:46px;padding:0 14px;border:3px double #5f371d;border-radius:4px;color:var(--ink);background:var(--parchment-light);font:400 1rem/1 var(--body)}
.search input::placeholder{color:var(--ink-soft);opacity:1}
.search button{flex:none;min-width:46px;height:46px;padding:0 16px;border:2px solid var(--red-dark);border-radius:4px;color:#fff0c8;background:var(--red);font:700 .9375rem/1 var(--body);cursor:pointer}
.search button:hover{background:var(--red-dark)}
.search-note{margin:6px 2px 0;color:var(--ink);font-size:.875rem}
main{padding:8px 12px 16px;outline:0}
.panel{max-width:72rem;margin:0 auto;padding:20px 16px 24px;border:3px solid var(--frame);border-radius:12px;background:var(--parchment-light);box-shadow:inset 0 0 60px rgba(139,69,19,.15),0 0 0 2px #2c1e16,0 12px 24px rgba(0,0,0,.45)}
h1{margin:0 0 12px;color:var(--red);font:400 clamp(1.75rem,1.1rem + 2.6vw,2.75rem)/1.12 var(--display);text-wrap:balance}
.lead{max-width:40rem;margin:0 0 20px;font-size:1.0625rem}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 24px;border:2px solid var(--red-dark);border-radius:4px;color:#fff0c8;background:var(--red);font:700 1rem/1 var(--body);text-decoration:none;cursor:pointer}
.btn:hover{background:var(--red-dark)}
h2{margin:28px 0 12px;color:var(--ink);font:400 1.375rem/1.2 var(--display)}
.ways{display:grid;gap:12px;margin:0;padding:0;list-style:none;grid-template-columns:repeat(auto-fit,minmax(min(100%,14rem),1fr))}
.way{display:block;height:100%;padding:14px 16px;border:2px solid var(--frame);border-radius:6px;color:var(--ink);background:rgba(255,248,224,.6);text-decoration:none}
.way:hover{border-color:var(--red);background:#fff8e0}
.way strong{display:block;margin-bottom:4px;color:var(--red);font:400 1.1875rem/1.2 var(--display)}
.way span{font-size:.9375rem}
.code{margin:28px 0 0;padding-top:14px;border-top:1px solid rgba(107,76,42,.35);color:var(--ink-soft);font-size:.8125rem}
.footer{margin-top:24px;padding:24px 16px 28px;color:var(--on-rail);background:linear-gradient(180deg,rgba(30,3,5,.55),rgba(30,3,5,.7)),url(/wallpaper/arena-rail-red.jpg) center/375px 172px repeat var(--wood)}
.footer-in{display:grid;gap:20px;max-width:70rem;margin:0 auto}
.footer h2{margin:0 0 6px;color:var(--gold);font:700 .75rem/1.3 var(--body);letter-spacing:.08em;text-transform:uppercase}
.footer ul{margin:0;padding:0;list-style:none}
.footer a{display:inline-flex;align-items:center;min-height:32px;color:var(--on-rail)}
.legal{max-width:70rem;margin:20px auto 0;padding-top:14px;border-top:1px solid rgba(246,227,180,.22);font-size:.8125rem}
.legal p{margin:0 0 6px}
@media(min-width:640px){main{padding:12px 20px 20px}.panel{padding:32px 32px 36px;border-width:4px}.footer-in{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(min-width:1024px){
.topbar{display:none}
.shell{display:grid;grid-template-columns:258px minmax(0,1fr)}
.rail{position:sticky;top:0;display:block;height:100vh;height:100dvh;overflow-y:auto;padding:14px 12px 24px;border-right:14px solid transparent;border-image:url(/wallpaper/main-page-rail-border.png) 18 stretch;border-image-width:0 14px 0 0;color:var(--on-rail);box-shadow:inset -7px 0 18px rgba(45,5,8,.16)}
.rail .brand{padding:6px 8px 12px;font-size:1.5rem}
.rail .brand img{width:36px;height:39px}
.utility{padding:12px 28px}
main{padding:12px 28px 24px}
.panel{padding:40px 40px 44px}
}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important;animation:none!important}}`;

export const UNAVAILABLE_PAGE_CSS = `${FONTS}${BASE}${RAIL}${WORK}`;

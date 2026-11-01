import type { ClientPresentation } from './configuration.js';

const escape = (value: string) => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character] ?? character);

// The page CSP is `default-src 'none'`, which blocks every <img> (data: included), so the mark is inline SVG.
const HEARTHPULSE_MARK = `<svg class="mark" viewBox="0 0 64 64" width="40" height="40" role="img" aria-label="HearthPulse">
<defs><linearGradient id="hp-bg" x1="10" y1="6" x2="54" y2="58" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#12345a"/><stop offset=".58" stop-color="#07172b"/><stop offset="1" stop-color="#030815"/></linearGradient>
<linearGradient id="hp-stroke" x1="18" y1="12" x2="46" y2="52" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#f8fbff"/><stop offset=".48" stop-color="#93c5fd"/><stop offset="1" stop-color="#38bdf8"/></linearGradient></defs>
<rect x="3" y="3" width="58" height="58" rx="16" fill="url(#hp-bg)"/>
<rect x="5.5" y="5.5" width="53" height="53" rx="13.5" fill="none" stroke="#38bdf8" stroke-opacity=".62" stroke-width="3"/>
<path d="M18 48 31.8 15.5 46 48" fill="none" stroke="url(#hp-stroke)" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M24.5 37.5h15" fill="none" stroke="#7dd3fc" stroke-width="6.5" stroke-linecap="round"/></svg>`;

// Dark by default; parchment when the visitor prefers a light scheme. Text pairs are AA (>= 4.5:1).
const STYLE = `
:root{color-scheme:dark light;--bg:#2e160b;--panel:#3b1e10;--line:#7a5530;--text:#f7e8bf;--muted:#dcc99a;--brand:#efc96f;--focus:#efc96f;--go:#8d171d;--go-text:#fff0c8;--go-line:#efc96f;--stop-line:#d9ab49}
@media (prefers-color-scheme:light){:root{--bg:#ead6a7;--panel:#f7e8bf;--line:#a98a55;--text:#30251c;--muted:#5a4632;--brand:#5d0d13;--focus:#5d0d13;--go:#8d171d;--go-text:#fff0c8;--go-line:#5d0d13;--stop-line:#5f371d}}
*{box-sizing:border-box}
body{margin:0;padding:1rem;background:var(--bg);color:var(--text);font:1rem/1.6 system-ui,-apple-system,"Segoe UI",Arial,sans-serif}
main{max-width:34rem;margin:6vh auto 0;padding:1.5rem;background:var(--panel);border:1px solid var(--line);border-radius:8px}
.brand{display:flex;align-items:center;gap:.75rem;margin:0 0 1.25rem;color:var(--brand);font-weight:700;letter-spacing:.02em}
.mark{flex:none;border-radius:10px}
h1{margin:0;font-size:1.65rem;line-height:1.25}
p{margin:.75rem 0;overflow-wrap:anywhere}
.to{display:block;margin-top:.35rem;font-size:1.2rem;font-weight:600}
.host{display:inline-block;max-width:100%}
form{display:flex;gap:.75rem;flex-wrap:wrap;margin:1.5rem 0 0}
button{flex:1 1 9rem;font:inherit;font-weight:600;min-height:44px;padding:.75rem 1.5rem;border:2px solid var(--stop-line);border-radius:6px;background:transparent;color:var(--text);cursor:pointer}
button[value=continue]{background:var(--go);color:var(--go-text);border-color:var(--go-line)}
button:focus-visible{outline:3px solid var(--focus);outline-offset:3px}
small{color:var(--muted)}
`;

/** `client` is the destination site shown to the person; `csrf` binds the decision form to this session. */
export function interactionView(name: string, client: ClientPresentation, csrf: string, rememberLogin = false): string {
  // The parenthesis lives inside the inline-block, so it wraps together with the host.
  const destination = `${escape(client.displayName)} <span class="host">(${escape(client.host)})</span>`;
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Вход через hearthpulse.net в ${escape(client.displayName)}</title><style>${STYLE}</style>
<main><p class="brand">${HEARTHPULSE_MARK}<span>hearthpulse.net</span></p>
<h1>Вход через hearthpulse.net <span class="to">в ${destination}</span></h1>
<p>Вы вошли как <strong>${escape(name || 'Читатель')}</strong>.</p>
<p>Сайт <strong>${escape(client.displayName)}</strong> получит ваш идентификатор и имя профиля. Пароль, почта и платёжные данные не передаются.</p>
${rememberLogin ? '<p>Вы разрешаете этому кабинету обновлять вход до 30 дней с момента согласия. Выход или отзыв сессии HearthPulse закроет доступ раньше.</p>' : ''}
<form method="post"><input type="hidden" name="csrf" value="${escape(csrf)}">
<button name="decision" value="continue" type="submit">Продолжить</button>
<button name="decision" value="deny" type="submit">Отмена</button></form>
<p><small>Аккаунт остаётся в HearthPulse. Выход или отзыв этой сессии HearthPulse также закроет вход на этом сайте.</small></p></main></html>`;
}

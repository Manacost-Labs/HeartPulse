import type { ClientPresentation } from './configuration.js';

const escape = (value: string) => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character] ?? character);

// The page CSP is `default-src 'none'`, which blocks every <img> (data: included), so the marks are inline SVG.
const HEARTHPULSE_MARK = `<svg class="mark" viewBox="0 0 64 64" width="56" height="56" role="img" aria-label="HearthPulse">
<defs><linearGradient id="hp-flame" x1="0" y1="4" x2="0" y2="60" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffe066"/><stop offset=".45" stop-color="#ffb321"/><stop offset="1" stop-color="#f27d0c"/></linearGradient>
<linearGradient id="hp-bowl" x1="0" y1="40" x2="0" y2="58" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#2c4459"/><stop offset="1" stop-color="#16242f"/></linearGradient></defs>
<path d="M32 61C19.5 61 10 51.8 10 40.2c0-8.4 4.2-14.6 8.6-19.4-.4 4.6.6 8.2 3.4 10.4C21.6 21 26.6 11.2 34.6 3c.6 8.6 4 13.8 8 17.6.8-2.6 2-4.6 3.8-6.6C51 20.4 54 28.4 54 38.4 54 51.2 44.6 61 32 61Z" fill="url(#hp-flame)" stroke="#a8430b" stroke-width="2.2" stroke-linejoin="round"/>
<path d="M15 41h34c0 9.6-7.4 16.6-17 16.6S15 50.6 15 41Z" fill="url(#hp-bowl)"/>
<path d="M9 41h13l3.4-7.5 4.2 17 4.6-27 4.4 22.5 3-8.5 2.4 3.5H55" fill="none" stroke="#3a1606" stroke-width="6.4" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/>
<path d="M9 41h13l3.4-7.5 4.2 17 4.6-27 4.4 22.5 3-8.5 2.4 3.5H55" fill="none" stroke="#fffaf0" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// Decorative line icons; the adjacent text carries the meaning.
const icon = (path: string) => `<svg class="icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
const PERSON = icon('M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c.9-3.5 3.6-5.5 7-5.5s6.1 2 7 5.5');
const CHECK = icon('m5 12.5 4.5 4.5L19 7.5');
const LOCK = icon('M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z');
const CLOCK = icon('M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z');

// Dark tavern by default; parchment when the visitor prefers a light scheme. Text pairs are AA (>= 4.5:1).
const STYLE = `
:root{color-scheme:dark light;--bg:#331709;--bg-deep:#170a04;--panel:#3a1a0c;--panel-deep:#2b1208;--line:#b8893f;--soft:rgb(239 201 111 / 16%);--text:#f7e8bf;--muted:#dcc99a;--brand:#efc96f;--focus:#efc96f;--stop-line:#8f6c3a}
@media (prefers-color-scheme:light){:root{--bg:#f1e2bd;--bg-deep:#dcc189;--panel:#fbf2da;--panel-deep:#f3e4c0;--line:#a98a55;--soft:rgb(122 20 20 / 10%);--text:#30251c;--muted:#5a4632;--brand:#7a1414;--focus:#5d0d13;--stop-line:#8a6a3c}}
*{box-sizing:border-box}
body{min-height:100vh;margin:0;padding:1rem;background:radial-gradient(90% 70% at 50% 0%,var(--bg),var(--bg-deep)) fixed;color:var(--text);font:1rem/1.6 system-ui,-apple-system,"Segoe UI",Arial,sans-serif}
main{max-width:30rem;margin:7vh auto 0;padding:2rem 1.75rem 1.5rem;background:linear-gradient(var(--panel),var(--panel-deep));border:2px solid var(--line);border-radius:18px;box-shadow:inset 0 0 0 4px var(--soft),0 24px 60px rgb(0 0 0 / 35%)}
.brand{display:flex;flex-direction:column;align-items:center;gap:.4rem;margin:0 0 1rem;color:var(--brand);font:700 1.15rem/1.2 Georgia,"Times New Roman",serif;letter-spacing:.03em}
.mark{filter:drop-shadow(0 4px 10px rgb(242 125 12 / 35%))}
h1{margin:0;padding-bottom:1.1rem;border-bottom:1px solid var(--soft);font:700 1.6rem/1.25 Georgia,"Times New Roman",serif;text-align:center;text-wrap:balance}
.to{display:block;margin-top:.35rem;color:var(--brand);font-size:1.15rem}
.host{display:inline-block;max-width:100%;color:var(--muted);font-weight:400}
p,li{overflow-wrap:anywhere}
.who{display:flex;align-items:center;justify-content:center;gap:.5rem;margin:1rem 0}
.icon{flex:none;width:1.25rem;height:1.25rem;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.who .icon{color:var(--brand)}
ul{display:grid;gap:.6rem;margin:0;padding:1rem;list-style:none;background:var(--soft);border-radius:12px}
li{display:flex;gap:.65rem;align-items:flex-start}
li .icon{margin-top:.15rem;color:var(--muted)}
li.yes .icon{color:var(--brand)}
form{display:grid;gap:.6rem;margin:1.5rem 0 0}
button{min-height:44px;padding:.6rem 1.5rem;border:1px solid var(--stop-line);border-radius:999px;background:transparent;color:var(--muted);font:600 1rem/1.3 system-ui,-apple-system,"Segoe UI",Arial,sans-serif;cursor:pointer}
button:hover{border-color:var(--brand);color:var(--text)}
button[value=continue]{min-height:54px;border:2px solid #e0b25a;background:radial-gradient(120% 170% at 25% 0%,#a01f19,transparent 62%) #6b1010;box-shadow:inset 0 0 0 1px #3b0606,0 6px 16px rgb(40 4 4 / 40%);color:#fff3d6;font:700 1.2rem/1.2 Georgia,"Times New Roman",serif;letter-spacing:.01em;-webkit-text-stroke:.6px #fff3d6;text-shadow:0 0 1px #2b0505,0 2px 0 #2b0505}
button[value=continue]:hover{border-color:#f5cf7a;background-color:#7e1512}
button:focus-visible{outline:3px solid var(--focus);outline-offset:3px}
.note{margin:1.25rem 0 0;text-align:center}
small{color:var(--muted);font-size:.85rem;line-height:1.5}
@media (max-width:30rem){main{margin-top:2vh;padding:1.5rem 1.15rem 1.25rem}h1{font-size:1.4rem}}
`;

/** `client` is the destination site shown to the person; `csrf` binds the decision form to this session. */
export function interactionView(name: string, client: ClientPresentation, csrf: string, rememberLogin = false): string {
  // The parenthesis lives inside the inline-block, so it wraps together with the host.
  const destination = `${escape(client.displayName)} <span class="host">(${escape(client.host)})</span>`;
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Вход через hearthpulse.net в ${escape(client.displayName)}</title><style>${STYLE}</style>
<main><p class="brand">${HEARTHPULSE_MARK}<span>HearthPulse</span></p>
<h1>Вход через hearthpulse.net <span class="to">в ${destination}</span></h1>
<p class="who">${PERSON}<span>Вы вошли как <strong>${escape(name || 'Читатель')}</strong></span></p>
<ul><li class="yes">${CHECK}<span>Сайт <strong>${escape(client.displayName)}</strong> получит ваш идентификатор и имя профиля.</span></li>
<li>${LOCK}<span>Пароль, почта и платёжные данные не передаются.</span></li>
${rememberLogin ? `<li>${CLOCK}<span>Вы разрешаете этому кабинету обновлять вход до 30 дней с момента согласия. Выход или отзыв сессии HearthPulse закроет доступ раньше.</span></li>` : ''}</ul>
<form method="post"><input type="hidden" name="csrf" value="${escape(csrf)}">
<button name="decision" value="continue" type="submit">Продолжить</button>
<button name="decision" value="deny" type="submit">Отмена</button></form>
<p class="note"><small>Аккаунт остаётся в HearthPulse. Выход или отзыв этой сессии HearthPulse также закроет вход на этом сайте.</small></p></main></html>`;
}

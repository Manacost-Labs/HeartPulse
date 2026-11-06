import { createHash } from 'node:crypto';

/** Escapes text and attribute values for the hand-written embed documents. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, char => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string));
}

/** Iframe sizes the oEmbed answer and the snippets suggest; the documents also fit any other size. */
export const EMBED_SIZES = { replay: { width: 600, height: 360 }, deck: { width: 380, height: 760 } } as const;

const STYLE = `
:root{color-scheme:light;--ink:#30251c;--muted:#74624d;--paper:#f5e7c6;--line:rgba(84,51,22,.22);--red:#7b151b;--win:#2f7d32;--loss:#a43835}
*{box-sizing:border-box}html,body{margin:0;height:100%}
body{font:14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:var(--paper);display:flex;flex-direction:column}
a{color:var(--red)}main{flex:1;overflow:auto;padding:12px 14px}
.hp-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 12px;border-top:1px solid var(--line);font-size:12px}
.hp-foot a{display:flex;align-items:center;gap:6px;text-decoration:none;font-weight:700}
.hp-title{margin:0 0 4px;font-size:18px}.hp-meta{margin:0 0 10px;color:var(--muted)}
.hp-badge{display:inline-block;padding:1px 8px;border-radius:999px;color:#fff;background:var(--muted);font-weight:700}
.hp-badge.win{background:var(--win)}.hp-badge.loss{background:var(--loss)}
.hp-heroes{display:flex;align-items:center;gap:10px;margin:8px 0}
.hp-hero{flex:1;min-width:0;padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:rgba(255,255,255,.35)}
.hp-hero img{display:block;width:100%;height:34px;object-fit:cover;border-radius:4px}
.hp-hero span{display:block;margin-top:4px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hp-board{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0;padding:0;list-style:none}
.hp-board li{padding:3px 8px;border-radius:6px;background:rgba(0,0,0,.06)}
.hp-open{display:inline-block;margin-top:8px;padding:6px 12px;border-radius:8px;background:var(--red);color:#fff;text-decoration:none;font-weight:700}
.hp-curve{display:flex;align-items:flex-end;gap:4px;height:64px;margin:6px 0 10px}
.hp-curve div{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;font-size:11px;color:var(--muted)}
.hp-curve i{display:block;width:100%;min-height:2px;border-radius:3px 3px 0 0;background:var(--red)}
.hp-cards{margin:0;padding:0;list-style:none}
.hp-card{position:relative;display:flex;align-items:center;gap:8px;height:30px;margin:0 0 3px;padding:0 8px;border-radius:6px;overflow:hidden;background:#2e160b;color:#fff}
.hp-card img{position:absolute;right:0;top:0;height:100%;width:62%;object-fit:cover;opacity:.75;mask-image:linear-gradient(90deg,transparent,#000 45%)}
.hp-card b,.hp-card span,.hp-card em{position:relative}
.hp-card b{width:22px;text-align:center;border-radius:50%;background:#1f5fa8}
.hp-card span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-shadow:0 1px 2px #000}
.hp-card em{font-style:normal;font-weight:700;color:#f1d27e}
.hp-card.legendary em{color:#ff9d3a}
.hp-copy{width:100%;margin:0 0 10px;padding:8px;border:0;border-radius:8px;background:var(--red);color:#fff;font:inherit;font-weight:700;cursor:pointer}
`;

/** Copies the deck code from the button's data attribute; the fallback covers browsers without the async clipboard. */
const COPY_SCRIPT = `document.addEventListener('click',function(e){var b=e.target.closest('[data-copy]');if(!b)return;var t=b.getAttribute('data-copy'),l=b.textContent,d=function(){b.textContent='Код скопирован';setTimeout(function(){b.textContent=l},1600)};if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(d,f)}else f();function f(){var a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();try{document.execCommand('copy');d()}catch(x){}a.remove()}});`;
const COPY_SCRIPT_HASH = `'sha256-${createHash('sha256').update(COPY_SCRIPT).digest('base64')}'`;

/**
 * Embeds go into any site's iframe (Manacost and others): `frame-ancestors *` instead of the site-wide SAMEORIGIN.
 * Nothing else may load: no site scripts, no analytics, images only from this origin.
 */
const CSP = `default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src ${COPY_SCRIPT_HASH}; base-uri 'none'; form-action 'none'; frame-ancestors *`;

/** A complete embed document: no site chrome, one footer link back to Hearthpulse. */
export function embedDocument({ title, body, back, script = false }: { title: string; body: string; back: string; script?: boolean }): string {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<meta name="robots" content="noindex"><title>${escapeHtml(title)}</title><style>${STYLE}</style></head><body>`
    + `<main>${body}</main>`
    + `<footer class="hp-foot"><a href="https://hearthpulse.net/download/" target="_blank" rel="noopener"><img src="/hearthpulse-logo.webp" width="15" height="16" alt="">Сделано в Hearthpulse</a>`
    + `<a href="${escapeHtml(back)}" target="_blank" rel="noopener">Открыть на hearthpulse.net</a></footer>`
    + (script ? `<script>${COPY_SCRIPT}</script>` : '')
    + '</body></html>';
}

/** The embed answer: frameable anywhere, never indexed; `cache` is the Cache-Control of the subject. */
export function embedResponse(html: string, status: number, cache: string): Response {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': CSP,
      'Cache-Control': cache,
      'X-Robots-Tag': 'noindex',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** A short page for an absent or unavailable subject, still frameable so the host page shows text, not an error. */
export function embedMessage(text: string, status: number): Response {
  return embedResponse(embedDocument({ title: 'Hearthpulse', body: `<p class="hp-meta">${escapeHtml(text)}</p>`, back: 'https://hearthpulse.net/' }),
    status, 'no-store');
}

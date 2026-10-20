/**
 * Inline head script that starts the session check while the document is
 * still parsing, instead of after the scripts load and the page hydrates. The
 * identity module adopts this response once (`fetchCurrentAuthUser` on its
 * first attempt, within ten seconds); every later check fetches on its own.
 * A failed request resolves to `null` so that an unadopted one never surfaces
 * as an unhandled rejection; the adopter then treats it as a failed attempt.
 * The global name is the contract with src/modules/identity/api/authSessionApi.ts.
 *
 * It also marks `<html data-hp-viewer="remembered">` when this browser
 * remembers the session's viewer under the rule of ui/viewerHint.ts (same
 * session tag, not expired, same viewer as the last server answer). Until the
 * page hydrates and shows that viewer, the access placeholder then stays
 * silent instead of saying it is checking access (PaywallGate.css). The mark
 * is a presentation hint only: it reveals and grants nothing.
 */
export const AUTH_PREFETCH = 'try{window.__hpAuthMe={at:performance.now(),'
  + 'response:fetch("/api/auth/me",{credentials:"same-origin",cache:"no-store"})'
  + '.catch(function(){return null})}}catch(e){}'
  + 'try{var h=JSON.parse(localStorage.getItem("hs_arena_viewer_hint")),'
  + 't=/(?:^|;\\s*)hp_viewer=([A-Za-z0-9_-]{22})(?:;|$)/.exec(document.cookie),n=Date.now();'
  + 'if(h&&t&&h.v===1&&h.tag===t[1]&&h.exp>n&&h.exp<=n+2592e5'
  + '&&h.viewer===localStorage.getItem("hs_arena_verified_viewer"))'
  + 'document.documentElement.dataset.hpViewer="remembered"}catch(e){}';

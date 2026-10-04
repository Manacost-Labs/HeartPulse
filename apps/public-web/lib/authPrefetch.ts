/**
 * Inline head script that starts the session check while the document is
 * still parsing, instead of after the scripts load and the page hydrates. The
 * identity module adopts this response once (`fetchCurrentAuthUser` on its
 * first attempt, within ten seconds); every later check fetches on its own.
 * A failed request resolves to `null` so that an unadopted one never surfaces
 * as an unhandled rejection; the adopter then treats it as a failed attempt.
 * The global name is the contract with src/modules/identity/api/authSessionApi.ts.
 */
export const AUTH_PREFETCH = 'try{window.__hpAuthMe={at:performance.now(),'
  + 'response:fetch("/api/auth/me",{credentials:"same-origin",cache:"no-store"})'
  + '.catch(function(){return null})}}catch(e){}';

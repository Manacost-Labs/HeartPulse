import { CANONICAL_HOST } from '@/src/config/domain';

const host = JSON.stringify(CANONICAL_HOST);

/**
 * Inline script that adds Plausible. The tracker handles the initial pageview
 * and History API navigation; the persistent layout loads it only once. Only the canonical host loads it: tests,
 * local runs and staging stay out of the statistics, and an analytics outage
 * cannot delay them. A prerendered document waits until the visitor opens it,
 * so a page that was only hovered is never counted.
 */
export const ANALYTICS_LOADER = `(function(){if(location.hostname!==${host})return;`
  + 'function load(){var s=document.createElement("script");'
  + `s.dataset.domain=${host};`
  + 's.src="https://stats.hs-manacost.ru/js/script.js";document.head.appendChild(s)}'
  + 'if(document.prerendering)document.addEventListener("prerenderingchange",load,{once:true});else load()})()';

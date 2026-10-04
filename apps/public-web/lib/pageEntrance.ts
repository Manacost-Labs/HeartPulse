/**
 * Inline head script that lets a page play its entrance (page-transitions.css)
 * on a load that no view transition animates: a typed URL, a reload, an
 * outside link, or a browser without cross-document transitions. A navigation
 * between pages already brings the content in with the cross-fade, so playing
 * the entrance there too would animate it twice.
 *
 * `data-page-enter` lives on `<html>` only while the entrance plays. A section
 * that mounts in the first half second (its data arrived) rises in as well;
 * later, a section re-created by a re-keyed page would rise a second time, so
 * from then on the mark waits only for the running entrances, which removing
 * it would cut short. The last timer is a cap, so a frame WebKit misses
 * cannot leave content hidden.
 *
 * The same script keeps the outgoing page in place during a view transition.
 * The snapshot group sits where the new content box is, so a page left while
 * scrolled would show its top. On `pageswap` the old page stores where its
 * content box was on screen, with the URL it is leaving for; on `pagereveal`
 * the new page sets `--vt-old-shift` on `<html>` to the difference, for the
 * transition only (src/index.css applies it). A stored offset that belongs to
 * another URL, or storage that is blocked, leaves the snapshot unshifted.
 */
export const PAGE_ENTRANCE = '(function(){var r=document.documentElement,K="hp-vt-old";'
  + 'function end(){r.removeAttribute("data-page-enter")}'
  + 'function settle(){var running=document.getAnimations().filter(function(a){'
  + 'return /^page-/.test(a.animationName)&&a.playState==="running"});'
  + 'if(!running.length)end();else Promise.all(running.map(function(a){return a.finished})).then(settle,settle)}'
  + 'function play(){r.setAttribute("data-page-enter","");setTimeout(settle,500);setTimeout(end,4000)}'
  + 'function box(){return document.querySelector(".arena-content")}'
  + 'function shift(v){try{var o=JSON.parse(sessionStorage.getItem(K)||"null"),c=box();sessionStorage.removeItem(K);'
  + 'if(!o||o.u!==location.href||!c)return;var d=Math.round(o.t-c.getBoundingClientRect().top);if(!d)return;'
  + 'r.style.setProperty("--vt-old-shift",d+"px");'
  + 'v.finished.finally(function(){r.style.removeProperty("--vt-old-shift")})}catch(x){}}'
  + 'addEventListener("pageswap",function(e){var c=box();'
  + 'try{if(e.viewTransition&&e.activation&&c)sessionStorage.setItem(K,JSON.stringify({u:e.activation.entry.url,t:c.getBoundingClientRect().top}))}catch(x){}});'
  + 'if("onpagereveal" in window){addEventListener("pagereveal",function(e){if(!e.viewTransition)play()},{once:true});'
  + 'addEventListener("pagereveal",function(e){if(e.viewTransition)shift(e.viewTransition)})}'
  + 'else play()})()';

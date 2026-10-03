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
 */
export const PAGE_ENTRANCE = '(function(){var r=document.documentElement;'
  + 'function end(){r.removeAttribute("data-page-enter")}'
  + 'function settle(){var running=document.getAnimations().filter(function(a){'
  + 'return /^page-/.test(a.animationName)&&a.playState==="running"});'
  + 'if(!running.length)end();else Promise.all(running.map(function(a){return a.finished})).then(settle,settle)}'
  + 'function play(){r.setAttribute("data-page-enter","");setTimeout(settle,500);setTimeout(end,4000)}'
  + 'if("onpagereveal" in window)addEventListener("pagereveal",function(e){if(!e.viewTransition)play()},{once:true});'
  + 'else play()})()';

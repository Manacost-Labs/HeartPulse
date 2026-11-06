import './MadeWithHearthpulse.css';

/**
 * The compact «Сделано в Hearthpulse» band of shared pages (replays, year in review): a guest learns where the page
 * came from and gets the download landing. Server-rendered without JavaScript; a viewer this browser remembers as
 * signed in (`html[data-hp-viewer]`, lib/authPrefetch.ts) does not see it.
 */
export function MadeWithHearthpulse() {
  return (
    <aside className="made-with-hp" aria-label="О приложении Hearthpulse">
      <img className="made-with-hp__logo" src="/hearthpulse-logo.webp" width={26} height={28} alt="" />
      <p className="made-with-hp__text">
        <b>Сделано в Hearthpulse</b> — бесплатный трекер и оверлей для Hearthstone, без рекламы и Overwolf.
      </p>
      <a className="made-with-hp__action" href="/download/">Скачать</a>
    </aside>
  );
}

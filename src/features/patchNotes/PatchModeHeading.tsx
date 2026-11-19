import type { PatchSectionId } from '../../modules/patchNotes/public';
import { NavigationIcon } from '../../app/shell/NavigationIcon';

/*
 * The title of a game mode inside a patch: the mode's own emblem (the gold of
 * the site menu) on a strip of that mode's art. Standard, Arena and Battlegrounds
 * use the menu's emblems and strips; the others have a drawn emblem and a banner of their own.
 */

/** Strip art of a mode: the menu's wide strips, else the mode's old patch-page banner. */
const ART: Record<PatchSectionId, string> = {
  standard: '/menu/banners/standard-face.webp',
  constructed: '/menu/banners/standard-face.webp',
  wild: '/patch-notes/constructed-640.webp',
  arena: '/menu/banners/arena-face.webp',
  battlegrounds: '/menu/banners/battlegrounds-face.webp',
  other: '/patch-notes/other-640.webp',
};

const MENU_EMBLEM: Partial<Record<PatchSectionId, string>> = {
  standard: 'mode-standard', constructed: 'mode-standard', arena: 'mode-arena', battlegrounds: 'mode-battlegrounds',
};

/** Wild and the side modes have no emblem in the menu: the same soft gold with a thin brown outline, drawn. */
function DrawnEmblem({ id }: { id: PatchSectionId }) {
  const path = id === 'wild'
    ? 'M24 24C20 17 14 14 10.5 17.5 7 21 8.5 28 14 29.5 19 31 22.5 27.5 24 24 25.5 27.5 29 31 34 29.5 39.5 28 41 21 37.5 17.5 34 14 28 17 24 24Z'
    : 'M24 6l5.4 11.6 12.6 1.6-9.3 8.7 2.4 12.5L24 34.2 12.9 40.4l2.4-12.5L6 19.2l12.6-1.6z';
  return (
    <svg className="hp-mode__emblem hp-mode__emblem--drawn" viewBox="0 0 48 48" width="56" height="56" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`hp-emblem-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe9a3" />
          <stop offset="1" stopColor="#f2b52c" />
        </linearGradient>
      </defs>
      <path d={path} fill={`url(#hp-emblem-${id})`} stroke="#5a3315" strokeWidth="2.6" fillRule="evenodd" strokeLinejoin="round" />
    </svg>
  );
}

export function PatchModeHeading({ id, headingId, title }: { id: PatchSectionId; headingId: string; title: string }) {
  const emblem = MENU_EMBLEM[id];
  return (
    <header className="hp-mode__head" data-mode={id}>
      <img className="hp-mode__art" src={ART[id]} alt="" width={520} height={160} loading="lazy" decoding="async" />
      {emblem ? <NavigationIcon id={emblem} size={56} /> : <DrawnEmblem id={id} />}
      <h3 id={headingId} className="hp-mode__title">{title}</h3>
    </header>
  );
}

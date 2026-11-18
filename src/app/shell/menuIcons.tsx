import type { ComponentType, ReactNode, SVGProps } from 'react';

/**
 * The menu's own icons: a 24 px grid, a gold outline and a quiet translucent
 * fill (duotone), each with one idea from the game's world. They replace the
 * stock line icons so the menu reads as part of the parchment-and-gold site.
 * Colour comes from `currentColor`, so the menu CSS decides the tint.
 */
export type MenuIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number }>;

const FILL = { fill: 'currentColor', fillOpacity: 0.36 } as const;

/** Wraps shapes into one icon; every path with `{...FILL}` is the soft second tone. */
function icon(shapes: ReactNode): MenuIcon {
  return function Icon({ size = 22, strokeWidth = 1.7, ...rest }) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
        {shapes}
      </svg>
    );
  };
}

// Home: a house with the hearth's arch for a door.
export const HomeIcon = icon(<><path {...FILL} d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" /><path d="M10 20v-4.5a2 2 0 0 1 4 0V20" /></>);
// Articles: a page with a folded corner.
export const ArticlesIcon = icon(<><path {...FILL} d="M6 3h9l3 3v15H6z" /><path d="M15 3v3h3M9 11h6M9 14.5h6M9 8h3" /></>);
// Meta: rising bars, the tallest one the strongest deck.
export const MetaIcon = icon(<><path {...FILL} d="M4 14h3.5v6H4zM10.25 9h3.5v11h-3.5zM16.5 4H20v16h-3.5z" /><path d="M3 20.5h18" /></>);
// Matchups: two swords crossed.
export const MatchupsIcon = icon(<><path {...FILL} d="M4 4l3.2.7 9.1 9.1-2.5 2.5L4.7 7.2zM20 4l-3.2.7-9.1 9.1 2.5 2.5 9.1-9.1z" /><path d="M12 18.4 18.4 12M12 18.4 5.6 12M16.3 16.3l3.2 3.2M7.7 16.3l-3.2 3.2" /></>);
// Archetypes: a family tree of decks.
export const ArchetypesIcon = icon(<><circle {...FILL} cx="12" cy="5.2" r="2.6" /><circle {...FILL} cx="5.8" cy="18.8" r="2.6" /><circle {...FILL} cx="18.2" cy="18.8" r="2.6" /><path d="M12 7.8V11m0 0-6.2 5.2M12 11l6.2 5.2" /></>);
// Fun decks: a tilted joker card with a star.
export const FunDecksIcon = icon(<><g transform="rotate(-10 12 12)"><rect {...FILL} x="6" y="3" width="12" height="18" rx="2" /><path d="M12 8.4l1.2 2.5 2.7.4-2 1.9.5 2.7-2.4-1.3-2.4 1.3.5-2.7-2-1.9 2.7-.4z" /></g><path d="M3.5 6h.01M21 5h.01M21 19h.01" /></>);
// VS Gold: a crown with a gem.
export const ViciousGoldIcon = icon(<><path {...FILL} d="M4 8l4 4 4-6 4 6 4-4-1.5 10h-13z" /><path d="M6 20.5h12M12 14.6h.01" /></>);
// Cards: a card with a mana crystal in its corner, one behind it.
export const CardsIcon = icon(<><path d="M8 3h10a1 1 0 0 1 1 1v13" /><rect {...FILL} x="4" y="6" width="12" height="15" rx="1.5" /><path d="M7.5 9l1.4 1.4-1.4 1.4-1.4-1.4zM7.5 17h5" /></>);
// Deck builder: an anvil.
export const DeckBuilderIcon = icon(<><path {...FILL} d="M3 8h15c0 2-1.5 3.5-4 3.5H9.5C8 11.5 6.5 10.5 5.5 9.5z" /><path {...FILL} d="M7 20h11v-4.5H7z" /><path d="M10 11.5v4M15 11.5v4M3 8h15" /></>);
// Patch notes: a scroll.
export const PatchNotesIcon = icon(<><path {...FILL} d="M8 4h9a1 1 0 0 1 1 1v13a2 2 0 0 1-2 2H6a2 2 0 0 0 2-2z" /><path d="M8 4a2 2 0 0 0-2 2v1h2M11 9h4M11 12.5h4" /></>);
// Classes: a helm with a plume.
export const ClassesIcon = icon(<><path {...FILL} d="M5 14a7 7 0 0 1 14 0v5H5z" /><path d="M5 14h14M12 14v5M12 7V3.5" /></>);
// Arena tier list: a ranked ladder.
export const ArenaTierIcon = icon(<><rect {...FILL} x="4" y="4" width="16" height="4" rx="1" /><rect {...FILL} x="4" y="10" width="11" height="4" rx="1" /><rect {...FILL} x="4" y="16" width="6" height="4" rx="1" /></>);
// Legendaries: a faceted gem.
export const LegendariesIcon = icon(<><path {...FILL} d="M7 4h10l4 5-9 11L3 9z" /><path d="M3 9h18M9 4 7 9l5 11 5-11-2-5" /></>);
// Battlegrounds heroes: a horned bust.
export const HeroesIcon = icon(<><circle {...FILL} cx="12" cy="9" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0M8.5 7 7 3.5M15.5 7 17 3.5" /></>);
// Battlegrounds tier list: a podium with a star.
export const PodiumIcon = icon(<><path {...FILL} d="M3 20v-6h5.5v6zM9.25 20V9.5h5.5V20zM15.5 20v-9H21v9z" /><path d="M12 3.3l.7 1.5 1.6.2-1.2 1.1.3 1.6-1.4-.8-1.4.8.3-1.6-1.2-1.1 1.6-.2z" /></>);
// Library: a tome with a gem clasp.
export const LibraryIcon = icon(<><path {...FILL} d="M6 3h12a1 1 0 0 1 1 1v13H7a2 2 0 0 0-2 2V4a1 1 0 0 1 1-1z" /><path d="M5 19a2 2 0 0 1 2-2h12M12 7l1.5 1.5L12 10l-1.5-1.5z" /></>);
// Strategy builder: three hexes of the board, one taken.
export const StrategiesIcon = icon(<><path {...FILL} d="M12 4.3l3.2 1.85v3.7L12 11.7 8.8 9.85v-3.7z" /><path d="M8.8 9.85 12 11.7v3.7l-3.2 1.85-3.2-1.85v-3.7zM15.2 9.85l3.2 1.85v3.7l-3.2 1.85L12 15.4v-3.7z" /></>);
// Tier-list builder: ranked rows and a plus.
export const TierBuilderIcon = icon(<><rect {...FILL} x="3.5" y="4.5" width="10" height="3" rx="1" /><rect {...FILL} x="3.5" y="10.5" width="7" height="3" rx="1" /><path d="M3.5 18h5M17 13.5v7M13.5 17h7" /></>);
// Leaderboards: a trophy.
export const LeaderboardsIcon = icon(<><path {...FILL} d="M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4v1.5A3 3 0 0 0 7 10.5M17 6h3v1.5a3 3 0 0 1-3 3M12 14v4M8 20h8" /></>);
// Streamers: a screen with a play mark.
export const StreamersIcon = icon(<><rect {...FILL} x="3" y="5" width="18" height="12" rx="2" /><path d="M10.5 8.5l4 2.5-4 2.5zM8 20.5h8" /></>);
// Contests: a wrapped gift.
export const ContestsIcon = icon(<><path {...FILL} d="M4 11h16v9H4z" /><path d="M3 8h18v3H3zM12 8v12M12 8C10 4 6.5 5 8 7.4 9 8.2 12 8 12 8s3 .2 4-.6C17.5 5 14 4 12 8z" /></>);
// Gallery: a framed picture.
export const GalleryIcon = icon(<><rect {...FILL} x="4" y="5" width="16" height="14" rx="1.5" /><path d="M4 16l5-5 4 4 2.5-2.5L20 17M16.5 8.6h.01" /></>);
// Cosmetics: two sparkles.
export const CosmeticsIcon = icon(<><path {...FILL} d="M10 4l1.8 4.7 4.7 1.8-4.7 1.8L10 17l-1.8-4.7-4.7-1.8 4.7-1.8z" /><path d="M18 14l.9 2.1 2.1.9-2.1.9L18 20l-.9-2.1-2.1-.9 2.1-.9z" /></>);
// Guides archive: a treasure chest.
export const GuidesArchiveIcon = icon(<><path {...FILL} d="M4 11h16v9H4z" /><path d="M4 11V8a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v3M12 13.5V16" /></>);
// Admin panel: a shield with a check.
export const AdminIcon = icon(<><path {...FILL} d="M12 3l7 3v5.5c0 4.5-3 7.8-7 9.5-4-1.7-7-5-7-9.5V6z" /><path d="M9 12l2.2 2.2L15.5 10" /></>);
export const FaqIcon = icon(<><circle {...FILL} cx="12" cy="12" r="9" /><path d="M9.5 9.6a2.6 2.6 0 1 1 3.7 2.3c-.7.4-1.2.9-1.2 1.7M12 16.6h.01" /></>);
export const ApiIcon = icon(<><path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 6l-3 12" /></>);
export const PrivacyIcon = icon(<><rect {...FILL} x="5" y="11" width="14" height="9" rx="1.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3M12 14.5v2" /></>);
export const TermsIcon = icon(<><path {...FILL} d="M5 7l-2.5 6a3 3 0 0 0 5 0zM19 7l-2.5 6a3 3 0 0 0 5 0z" /><path d="M12 4v16M7 20h10M5 7h14" /></>);

/* Group emblems: one small coat of arms per mode, so the four groups differ at a glance. */
const SHIELD = 'M12 2.5l7.5 2.7v6.3c0 4.5-3.2 8.2-7.5 10-4.3-1.8-7.5-5.5-7.5-10V5.2z';
// Standard and Wild: a star on the shield.
export const StandardEmblem = icon(<><path {...FILL} d={SHIELD} /><path {...FILL} d="M12 7.5l1.5 3.1 3.4.5-2.5 2.4.6 3.4-3-1.6-3 1.6.6-3.4-2.5-2.4 3.4-.5z" /></>);
// Arena: the arena's gate.
export const ArenaEmblem = icon(<><path {...FILL} d={SHIELD} /><path d="M8.5 16.5V12a3.5 3.5 0 0 1 7 0v4.5M7 16.5h10M12 8.5v1" /></>);
// Battlegrounds: the tavern's tower.
export const BattlegroundsEmblem = icon(<><path {...FILL} d={SHIELD} /><path {...FILL} d="M8.5 8h1.8v1.6h1.2V8h1.2v1.6h1.2V8h1.8v3.2h-7.2z" /><path d="M9.2 11.2v5.5M14.8 11.2v5.5M8 16.7h8" /></>);
// Community: a raised banner.
export const CommunityEmblem = icon(<><path {...FILL} d={SHIELD} /><path {...FILL} d="M10 8h5.5l-1.4 2.2 1.4 2.2H10z" /><path d="M10 7.5v10M8.5 17.5h3" /></>);

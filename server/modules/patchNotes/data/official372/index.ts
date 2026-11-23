import { OFFICIAL_372_CONTENT_TEXT, OFFICIAL_372_SECTIONS } from './changes.js';
import { MINIONS_POOL_GROUP } from './poolsMinions.js';
import { SPELLS_POOL_GROUP, TRINKETS_POOL_GROUP } from './poolsSpellsTrinkets.js';
import { MINOR_TIMEWARP_POOL_GROUP } from './poolsMinorTw.js';
import { MAJOR_TIMEWARP_POOL_GROUP } from './poolsMajorTw.js';
import { BG_REWARDS_SECTION } from './rewards.js';
import { BG_SECTIONS } from './sectionsBg.js';
import { EVENTS_SECTIONS } from './sectionsEvents.js';
import { COSMETICS_AND_BUGS_SECTIONS } from './sectionsCosmeticsBugs.js';

/** Russian transcription of Blizzard article 24316976 (Patch 37.2 early look, published 23 November 2026). */
export const official372 = {
  version: '37.2.0',
  title: 'Обновление 37.2: 15-й сезон Полей сражений, потасовка 2 на 2 и события',
  match_state: 'matched',
  official_url: 'https://hearthstone.blizzard.com/en-gb/news/24316976/an-early-look-at-patch-372-battlegrounds-season-15-2v2-tavern-brawl-and-more',
  official_published_at: '2026-11-23T18:00:00+00:00',
  summary: 'Обновление 37.2 выходит 1 декабря: 15-й сезон Полей сражений «Искажённая Империя» с возвращением Хрономальной таверны, новыми свойствами «Устойчивость» и «Миссия», 2 новыми героями, масштабной ротацией карт, временной потасовкой 2 на 2, 5 бесплатными картами из событий и исправлениями ошибок.',
  sections: [...OFFICIAL_372_SECTIONS],
  content_text: OFFICIAL_372_CONTENT_TEXT,
  pool_changes: [
    MINIONS_POOL_GROUP,
    SPELLS_POOL_GROUP,
    MINOR_TIMEWARP_POOL_GROUP,
    MAJOR_TIMEWARP_POOL_GROUP,
    TRINKETS_POOL_GROUP,
  ],
  content_sections: [
    ...BG_SECTIONS,
    BG_REWARDS_SECTION,
    ...EVENTS_SECTIONS,
    ...COSMETICS_AND_BUGS_SECTIONS,
  ],
};

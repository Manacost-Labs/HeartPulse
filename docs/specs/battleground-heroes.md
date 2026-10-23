# Battleground heroes access

`/heroes/` publishes its title, description and canonical URL to every visitor.
The detailed tier list continues to use the existing `/api/bg/heroes` client
and requires the `battlegrounds` entitlement. An administrator may use the
same statistics without a separate subscription, matching the Express access
policy. The Next.js page waits for account verification before mounting the
statistics client, so no protected request or data appears in guest HTML.

The Next.js list route is staged while public Nginx traffic remains on the
legacy page. The `/heroes/:dbfId/` detail route is also staged in Next.js.
Express exposes `/api/bg/heroes/public/:dbfId` as a cacheable anonymous
projection of hero ID, name, image and hero power only. It uses the same solo
and duo catalog resolution as the existing SEO route; missing IDs return 404
and upstream failures return retryable 503. Next.js does not forward account
cookies to this endpoint and returns a real 404 for missing IDs. The full hero
statistics client mounts only after account verification. Public Nginx traffic
continues to use the legacy detail route until deployment checks are complete.

## Hero detail layout

The header holds everything a player checks first: the portrait, the name, a
row of fact chips (armor, the latest balance change or that there was none,
Hearthstone Wiki and HSReplay links), the four statistic plaques, and compact
hero power and buddy plates that open the media viewer. The profile panel
appears only when the library has a description, race or artist. The patch
history appears only when the hero has recorded balance changes; the header
chip links to it. The loading skeleton mirrors this header and the profile panel.

Every section below the header has one rail frame and a light parchment fill;
nothing inside a section is framed again. Charts and lists sit straight on the
section and are separated by space and `--arena-paper-line` rules.

### Statistics

The statistics section names the games behind the numbers in one line (mode,
rating bracket, period from `stats.mode` and `stats.filters`; data from
HSReplay) and switches four tabs. A tab without data says so; a chart without
points is not drawn. Panels live in `src/modules/battlegrounds/ui/HeroAnalytics.tsx`
on the shared `src/shared/ui/analytics` charts, with the site palette: winrate
red `#8d171d`, share blue `#2f6c9e`, tavern tiers on one warm scale.

- **Обзор**: places 1–8 as columns (top four in red, the top-4 share in the
  subtitle) and the combat winrate by round as a line against 50%
  (`stats.combat_winrate`).
- **Сила героя**: the share of games that use the hero power on each turn, and a
  turn × tavern tier table of that share (`stats.hero_power`); cells with fewer
  than 50 games are faded.
- **Таверна**: the usual upgrade pace — the first turn each higher tier becomes
  the most common one (`stats.tavern_up_by_turn`) — and the tier distribution by
  turn as 100% bars with a hover card (`stats.tavern_up`).
- **Составы**: the best composition's typical final board, every composition in
  one list ordered by games (share bar, average place ± interval, games;
  fewer than 100 games are dimmed with an ⓘ), and the key minions of the final
  board grouped by the tavern tier the game ended on. A tier group where every
  minion is on 100% of boards is a single game and is left out.

### Patch history

`battlegroundHeroPatchEntries` (`src/features/battlegroundHeroPatchChanges.ts`)
merges the wiki groups "Card changes" and "Bug fixes and other changes" by
patch and turns each line into a short Russian change with a direction: armor
(solo, Duos, lower ratings) and armor tier up is a buff, down a nerf; health,
hero power cost and text follow the card grammar; added to or removed from the
pool, a new hero power and lobby restrictions are named. Raw tag diffs, art
credits, rarity and class notes and unparsed English bug notes fold into the
quiet "Ещё" line. The version keeps the hotfix number (`Патч 36.4.2`). The
section uses the card page timeline (`CardPatchTimeline`) with hero badges
(«Добавлен», «Убран»), the Manacost article and wiki links, and shows the five
newest patches with a button for the rest. The header chip names the latest
patch with a gameplay change, not a cosmetic one.

The hero rating lays its portrait cards out with `auto-fill`, so a tier shows
as many heroes per row as fit (two on a phone) instead of four wide cards.

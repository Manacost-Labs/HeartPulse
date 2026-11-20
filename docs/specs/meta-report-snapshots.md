# Meta report snapshots

The weekly meta report (issue #542) shows what the open layer of the site
said on a Monday and how it changed since the previous report. The live pages
overwrite their data, so the server keeps its own weekly snapshots from the
first Monday on. A week that was not recorded cannot be reported later.

Module: `server/modules/metaReport` (`createMetaReportSnapshots`,
`createMetaReportRouter`). Wiring: `server/metaReportSnapshotSources.ts`
(`createMetaReportApi`), mounted once under `/api` in `server/index.ts`. The
report pages read the snapshots over HTTP (see «HTTP» and «Report pages»).

## Schedule

The job runs inside the Express process when `BACKGROUND_JOBS_ENABLED` is
not `0`: three minutes after start and then every hour. A run records a
snapshot only when all of these hold:

- it is Monday in UTC, 06:30 or later (after the Arena and Battlegrounds
  refreshes of about 06:00 UTC);
- the date has no snapshot yet;
- the Standard section is `fresh` and has at least 20 archetypes.

The date of a snapshot is the Monday it is taken. A Monday that ends without
a snapshot (process down, Standard stale all day) stays empty: nothing is
written for it on Tuesday or later. A run whose sources answer after
midnight writes nothing either: the date is checked again before the insert.
A run of a day that already has its snapshot changes nothing.

The store is opened on the first run, not at startup: an unwritable
`DATA_DIR` makes a run `failed` (logged), never the server's boot.

The Arena section reads what `/api/winrates/public-teaser` shows a guest:
the origin's class winrates, or the local `winrates.json` when it is fresher
or the origin fails.

## Format

One JSON document per date, `schemaVersion: 1`:

```json
{
  "schemaVersion": 1,
  "date": "2026-11-23",
  "recordedAt": "2026-11-23T06:33:00.000Z",
  "sections": {
    "standard": { "status": "fresh", "source": "hsguru", "...": "..." },
    "matchups": {},
    "arena": {},
    "battlegrounds": {},
    "patch": {}
  }
}
```

Every section has `status`, `source`, `updatedAt` (the source's own date),
`fetchedAt` (when the site read it) and `data`. `status` is `fresh` (read,
`updatedAt` within 48 hours), `stale` (read, older or undated; `data` kept)
or `missing` (the read failed; `data` is `null`). The patch list has no date
of its own and is never `stale`.

Sections, each from the projection a guest already gets:

- `standard` — `/api/standard-meta/public` (Diamond–Legend, the period the
  page opens with, 100+ games): format, rank, period, currentPatchPeriod,
  minGames, totalGames; per archetype slug, archetype, name, classKey,
  winrate, popularity, games.
- `matchups` — `/api/standard/matchups/public` (all ranks, 25+ games per
  pair): format, rank, HSGuru period, minGames, totalGames, columns and rows
  with their cells.
- `arena` — `/api/winrates/public-teaser` (HSReplay): sampleUnit; per class
  place, id, name, winrate (0.1), sample.
- `battlegrounds` — `/api/bg/heroes/public?mode=solo`: mode, mmr; per hero
  dbfId, cardId, name, tier, avgPlacement, top4Rate, pickRate.
- `patch` — hs-data-api `/api/patches?limit=20`, the newest by date:
  version, build, title, publishedAt.

The sources are called as functions, not over HTTP. The snapshot then copies
each field by name once more, so no paid figure (narrow ranks, turns,
duration, climb speed, offer rate, ArenaSmith, other Battlegrounds rating
ranges, single places) can reach it. Weeks are comparable only within one
HSGuru `period`.

## Storage and immutability

`<SERVER_DATA_DIR>/meta-report-snapshots-v1/snapshots.sqlite`, table
`weekly_snapshots (date PRIMARY KEY, recorded_at, payload)`. The table is
append-only: triggers abort every `UPDATE`, every `DELETE` and an insert over
an existing date (`INSERT OR REPLACE` included). A wrong figure is corrected
by a separate dated note on the report page, never in the snapshot.

The file is part of `SERVER_DATA_DIR` and its backups. Reverting the feature
leaves the file in place; nothing else reads it.

Check on production (`SERVER_DATA_DIR` is
`/var/www/koloda/data/www/hs-arena.ru/shared/server-data`):

```bash
sqlite3 meta-report-snapshots-v1/snapshots.sqlite \
  "SELECT date, recorded_at FROM weekly_snapshots ORDER BY date DESC;"
```

A Monday without a row after 23:59 UTC: look for
`[meta-report-snapshots]` in the `hs-arena` journal (Standard stale or a
failed write).

## HTTP

Both routes are anonymous: every field of a snapshot is already open to a
guest.

- `GET /api/meta-reports` — `{ "dates": ["2026-11-30", "2026-11-23"] }`,
  newest first, `Cache-Control: public, max-age=300`. An empty archive is
  `{ "dates": [] }`.
- `GET /api/meta-reports/:date` — the stored snapshot as recorded (the format
  above), `Cache-Control: public, max-age=3600`. A date that is not a real
  `YYYY-MM-DD` calendar date or has no snapshot answers `404`
  `{ "error": "Meta report not found" }` with `no-store`.
- A store that cannot be opened answers `503` with `no-store` (logged as
  `[meta-report-snapshots] read failed`), never an empty archive.

## Report pages

`/reports/meta/` (archive) and `/reports/meta/<date>/` (one report) are
server components rendered by Next.js on every request
(`apps/public-web/app/reports/meta/`); only the shared site shell hydrates.
The page copies the snapshot field by field once more
(`apps/public-web/lib/publicMetaReportData.ts`) and computes the report in
`lib/metaReportView.ts`:

- Standard, Diamond–Legend: top 10 by winrate among archetypes with at least
  0.5 % of games, top 10 by popularity; winrate, popularity, games.
- Change to the previous snapshot only when both Standard sections have the
  same HSGuru `period`: winrate and popularity in percentage points, games of
  the week (the difference of the accumulated games), «новый в топе» and the
  archetypes that left a top. The first report and a report after a period
  change print no difference and say why.
- Matchups: the 5 rows with most games, best and worst opponent among pairs
  of at least 25 games (the mirror left out).
- Arena: classes of at least 100 runs by winrate; the others are listed as
  «мало данных» without a place.
- Battlegrounds Solo: top 10 heroes by average place, linked to
  `/heroes/<dbfId>/`.
- Patch of the week: the newest patch of the snapshot, «вышел на этой
  неделе» when it is younger than 7 days at the snapshot.
- Every section prints its own «Данные на …» and source and links its live
  page. A section without data says so, with no figures.
- Archetype names link to `/standard/archetypes/standard/<slug>/` only when
  the open catalog of now says the page is indexable
  (`isIndexableArchetype`).

Indexing: both routes are `noindex-follow` and out of the sitemap in
`src/shared/seo/publicRouteInventory.json`; SEO-A turns them to `index` and
adds the sitemap segment in its own change. A report sets `canonical` to
itself; the archive has none while it is noindex. Both build their title and
description themselves rather than from `config/public-seo-pages.json`: a
registry page must answer 200 without data, and an empty archive is a 404. Once a report is
indexable, a patch younger than 72 hours at the snapshot still keeps it
`noindex, follow` (early data), and its JSON-LD (`WebPage`, `BreadcrumbList`,
`Dataset` with `temporalCoverage` = the report date and `dateModified` = the
time of the snapshot) appears; while noindex the page has no JSON-LD. The
archive gets a `CollectionPage` with an `ItemList` of the reports.

An unknown or impossible date, and the archive without any report, answer
`404` with `noindex`. Express failing answers the generic error page.

Routing: `deploy/nginx/arena-html-routing.conf` sends
`/reports/meta/` and `/reports/meta/<YYYY-MM-DD>/` to Next and adds the slash
with one `301`; anything else under `/reports/` is the site 404. Removing the
feature: revert the change and install the Nginx snippet of the revert
commit (`docs/runbooks/nextjs-production-cutover.md`); the snapshot file
stays.

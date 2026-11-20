# Meta report snapshots

The weekly meta report (issue #542) shows what the open layer of the site
said on a Monday and how it changed since the previous report. The live pages
overwrite their data, so the server keeps its own weekly snapshots from the
first Monday on. A week that was not recorded cannot be reported later.

Module: `server/modules/metaReport` (`createMetaReportSnapshots`). Wiring:
`server/metaReportSnapshotSources.ts`, called once from `server/index.ts`.
There is no HTTP route or page yet; the future report page reads
`list()` (dates, newest first) and `get(date)`.

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

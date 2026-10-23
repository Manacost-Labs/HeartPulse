# Tracker events schema version 2 for account statistics

## Status

Accepted for the site, 2026-10-23. The desktop producer is not built yet; the
account statistics stay behind `PLAYER_STATS_ENABLED` until it is.

## Context

The account page gets personal statistics in the style of HSReplay
«My Stats» for Battlegrounds, Standard, Wild and Arena
([player game statistics](../specs/player-game-stats.md)). Games reach the
site only through the existing tracker ingestion
([tracker ingestion](../specs/tracker-ingestion.md)): device flow of client
`manacost-tracker`, scope `tracker.write`, `POST
/api/v1/tracker/events/batch`, stored in `tracker_profile_events`.

Version 1 of those events never defined its payloads beyond bounded lists
(`finalBoard.minions`, `playerMulligan.*`, `opponentDeck.observedCards`,
`offeredCardIds`, `finalDeckCardIds`). No client sends the fields the
statistics need: final board stats, rating before and after, combats by turn,
rank before and after, opponent class, Arena runs. A second upload API for the
same data was built and withdrawn: one ingestion path stays the only one.

## Decision

- The existing event types gain `schemaVersion: 2`, which keeps every v1
  field and adds the statistics fields defined in the specification. Version
  1 stays accepted and unchanged.
- The statistics module owns the version 2 payload check; composition
  injects it into the tracker ingestion, which stays independent of the
  statistics domain.
- A version 2 game or run payload is stored normalized: the documented fields
  plus the v1 lists, nothing else, so no name or log line is stored by
  accident. Its size limit is 32 KiB instead of 512 KiB.
- An invalid statistics field never drops the event. The event is stored
  with its v1 lists and a `statisticsError`; the response names it in
  `warnings`, and the statistics skip it. Size, envelope and quota violations
  are still rejected.
- An account stores at most 100 000 tracker events; replays never count.
- The statistics read the events through the ingestion module's
  `listEvents` and `countEvents` and cache each answer per account and query
  for five minutes; a stored upload drops that account's cache.
- `PLAYER_STATS_ENABLED=1` switches the account statistics on. Without it the
  routes answer 404. With it, the section appears only for an account that
  has version 2 events, so no one is asked to install an application that
  does not send games yet.

## Consequences

- The desktop tracker must map its local history to the version 2 fields
  (result and format values, board field names, rank as star level) and must
  not send player names; the specification is the contract it checks
  against.
- An event is immutable once stored: a rating learned after the game needs a
  new contract (for example a correction event), not a resend.
- Standard and Wild share `constructed_match` and are split by `format` after
  reading; the 5 000-event read limit covers both, and Solo and Duos alike.
- Switching the statistics off needs no data migration: the events stay in
  `tracker_profile_events`.

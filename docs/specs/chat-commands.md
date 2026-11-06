# Chat commands for streamers (`!deck !winrate !rank !mmr`)

## Objective

A streamer who linked Twitch on hearthpulse.net adds four chat bot commands
with one line each (Nightbot, StreamElements). The site answers plain text
from what the Hearthpulse app already sends, never ahead of the stream.
Setup guide: [runbook](../runbooks/chat-commands.md).

## Endpoint

`GET /api/v1/chat/<twitch-login>/<command>[?lang=en]`
(`server/modules/chatCommands`), `command` ∈ `deck`, `winrate`, `rank`, `mmr`.

- `text/plain; charset=utf-8`, one line, at most 400 characters (the bots'
  limit), no line breaks or control characters. Russian by default,
  `lang=en` English.
- The login is case-insensitive (`^[a-z0-9_]{1,25}$`). An unknown command, a
  bad login or a channel not linked to a site account → **404 with an empty
  body**: an unlinked channel learns nothing.
- 200 answers are cached per channel, command and language for 15 s in the
  process and sent with `Cache-Control: public, max-age=15`; a chat full of
  `!deck` reads the data once. Limits: 30 requests a minute per channel and
  command, 600 a minute per address (the bots fetch from shared servers).
- `Access-Control-Allow-Origin: *`, `X-Robots-Tag: noindex`.

## Sources and consent

| Command | Source | Shown when |
| --- | --- | --- |
| `!deck` | The channel's latest Twitch extension snapshot ([spec](twitch-extension.md)): the deck name and a deckstring built from the cards' dbf ids, copies and the hero | The app is sending its deck to the extension now (the snapshot is younger than its 30-minute TTL) |
| `!winrate` | The account's tracker games of the last 12 hours: Constructed and Arena wins–losses, Battlegrounds games and average place | The profile shows its statistics publicly (`/id/<n>/`, off by default) |
| `!rank` | The ladder rank after the newest ranked Constructed game | as `!winrate` |
| `!mmr` | The Battlegrounds rating after the newest game, with the change over the session's games of that queue | as `!winrate` |

- **Stream delay.** The app holds each extension state for the streamer's
  delay (`TwitchDelaySeconds`, 0–600 s) before it sends it, so `!deck` is
  already delayed. For the other commands only games that ended (start +
  duration) before *now − delay* count. The delay is the snapshot's
  `delaySeconds` (sent by the app with `twitch/state`); without a snapshot or
  that field the longest delay, 600 s, is assumed.
- Nothing names a player: no BattleTag, no opponent, no account id.

## Answers (Russian)

- `!deck`: `<deck name>: <code>` (`Колода: <code>` without a name);
  `Hearthpulse: стример сейчас не показывает колоду.` without a snapshot;
  `… — код колоды пока недоступен.` when the hero is unknown.
- `!winrate`: `Сегодня: 5–3 (63%) · Поля сражений: 4 игр, среднее место 3.5`;
  `Hearthpulse: сегодня ещё нет игр.`
- `!rank`: `Ранг: Алмаз 5 (Стандарт)`, `Ранг: Легенда 1234 (Вольный)`.
- `!mmr`: `MMR Полей сражений: 6560 (+60 сегодня)`.
- Statistics not public: `Hearthpulse: стример не показывает статистику.`

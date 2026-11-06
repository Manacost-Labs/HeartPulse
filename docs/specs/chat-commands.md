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
  bad login, a channel not linked to a site account or a linked channel whose
  streamer has not switched chat commands on → **404 with an empty body**: the
  answer does not reveal who linked Twitch.
- 200 answers are cached per channel, command and language for 15 s in the
  process and sent with `Cache-Control: public, max-age=15`; a chat full of
  `!deck` reads the data once. Limits: 30 requests a minute per channel and
  command, 600 a minute per address (the bots fetch from shared servers).
- `Access-Control-Allow-Origin: *`, `X-Robots-Tag: noindex`.

## Sources and consent

Consent, in order (each one off by default):

1. **Chat commands** switched on in the Twitch section of the profile
   (`twitch_links.chat_commands`). Off → the empty 404 above.
2. **Live with Hearthpulse**: the app is sending its deck to the Twitch
   extension now (the channel's snapshot is younger than its 30-minute TTL).
   Otherwise every command answers «стример сейчас не в эфире с Hearthpulse»,
   so an offline streamer cannot be polled.
3. **Public statistics** of the profile (`/id/<n>/`) for `!winrate`, `!rank`,
   `!mmr`; otherwise «стример не показывает статистику».

<!-- markdownlint-disable MD013 -->
| Command | Source |
| --- | --- |
| `!deck` | The extension snapshot ([spec](twitch-extension.md)): the deck name and a deckstring built from the cards' dbf ids, copies and the hero |
| `!winrate` | The account's tracker games that started in the last 12 hours: Constructed and Arena wins–losses, Battlegrounds games and average place |
| `!rank` | The ladder rank after the newest ranked Constructed game |
| `!mmr` | The Battlegrounds rating after the newest game, with the change over the 12 hours' games of that queue |
<!-- markdownlint-enable MD013 -->

- **Stream delay.** The app holds each extension state for the streamer's
  delay (`TwitchDelaySeconds`, 0–600 s) before it sends it, so `!deck` is
  delayed exactly as the extension. The app does not send its delay, so the
  other commands count a game only ten minutes (the longest delay) after it
  ended (start + duration).
- Nothing names a player: no BattleTag, no opponent, no account id.

## Answers (Russian)

- Not live: `Hearthpulse: стример сейчас не в эфире с Hearthpulse.`
- `!deck`: `<deck name>: <code>` (`Колода: <code>` without a name);
  `… — код колоды пока недоступен.` when the hero is unknown.
- `!winrate`: `За 12 ч: 5–3 (63%) · Поля сражений: 4 игр, среднее место 3.5`;
  `Hearthpulse: за 12 часов игр нет.`
- `!rank`: `Ранг: Алмаз 5 (Стандарт)`, `Ранг: Легенда 1234 (Вольный)`.
- `!mmr`: `MMR Полей сражений: 6560 (+60 за 12 ч)`.
- Statistics not public: `Hearthpulse: стример не показывает статистику.`

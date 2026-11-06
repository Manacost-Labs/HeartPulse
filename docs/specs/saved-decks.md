<!-- markdownlint-disable MD013 -->

# Saved decks («Мои колоды»)

## Objective

A signed-in reader keeps their own decks in the account: they paste a deck
code (or the whole text the game copies) with an optional comment, the site
stores it, renders its image with deckview, and the tab shows the decks as a
gallery with «Скопировать код». The list, the codes and the comments are
private to their owner; an image is a render-cache file of the shared deckview
cache, reachable only by its unguessable URL, like the meta pages' images.

## API

All routes need the site's cookie session, answer
`Cache-Control: private, no-store`, and changes need the same-origin CSRF
proof plus `X-CSRF-Request: 1` (`server/csrf.ts`). Another account's deck is
always `404 { "error": "Колода не найдена" }`.

| Route | Result |
| --- | --- |
| `GET /api/account/decks` | `{ decks, limit }`, newest first. |
| `POST /api/account/decks` `{ deckCode, comment }` | `201 { deck }` with `status: "pending"`; `400` for an unreadable code, a code the card catalog rejects or a comment over 500 characters; `409` for a deck already saved or the 100-deck limit; `503` when the catalog check itself failed. |
| `PATCH /api/account/decks/:id` `{ comment }` | `{ deck }`; `comment` must be a string (an empty one clears it). |
| `POST /api/account/decks/:id/render` | Starts the image again for a `failed` deck; `{ deck }`. |
| `DELETE /api/account/decks/:id` | `{ success: true }`. |

A deck is `{ id, deckCode, name, format, comment, status, imageUrl,
previewImageUrl, createdAt }`; the account id is never in it. `deckCode` may
be the game's export: the code is the first line that is not a `#` comment
and decodes locally (at most 600 characters), and a `### Name` line names the
deck on its card. Otherwise the archetype found by the deck builder's
resolver names it, or «Колода». Only a locally decodable code reaches that
resolver. The code is normalized by it, so the same deck is saved once per
account.

The image is rendered after the answer through the shared deckview render
(`createStandardMetaPreview`, the cache of the meta pages), titled by the
archetype or «Колода», never by the owner's name, so personal names cannot
multiply shared renders: `pending`, then
`ready` with both image URLs through the site's resource proxy
(`/api/public-resource/deckview/…`), or `failed`. A `pending` deck older than
five minutes (a restart lost the render) reads as `failed`; editing the
comment does not reset that time. Adding a deck and retrying an image share a
budget of 30 requests per 10 minutes per client, applied inside the router so
no spelling of the path escapes it; refused cross-site requests do not spend
it.

## Page

The «Мои колоды» tab (`AccountDecks`, `SavedDeckCard`, `useSavedDecks`):
without decks the form «Добавить колоду» is open (code, optional comment
with a counter, links to the deck builder and the meta); with decks the
section head offers «Добавить колоду». Each card shows the square deck image
in the compact gold frame of `assets.md` (it opens the full image), the name,
«Стандарт» or «Вольный», the comment as plain text, «Скопировать код», then
«Комментарий» (edit inline) and «Удалить» (inline confirmation). While a deck
is `pending` the card says «Собираем картинку…» and the list reloads every
three seconds for up to five minutes (a failed reload counts); a `failed`
image offers «Повторить»; a ready image that does not load (network, proxy)
shows «Картинка не загрузилась» with «Загрузить снова» instead of a broken
picture.
The page accepts only image URLs of the site's own proxy.

## Data

`saved_decks(id, user_id, deck_code, deck_name, format, comment, status,
image_url, preview_image_url, created_at, updated_at)`, unique on
`(user_id, deck_code)`, `ON DELETE CASCADE` from `users`, created at start
by `createSavedDeckRepository`.

## Tests

`npm run test:saved-decks` (`tests/saved-decks-routes.test.ts`): export
parsing, session and CSRF, validation (an undecodable code skips the lookup,
a failed lookup is `503`), background render and retry, the image title, the
proxy URLs, duplicates and the limit, isolation between accounts, comment
editing, deletion, the stale render, the render budget behind `//` and the
cascade. Stories:
`Identity/Account Decks`.

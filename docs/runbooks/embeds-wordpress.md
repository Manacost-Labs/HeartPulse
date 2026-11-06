# Hearthpulse embeds on WordPress (hs-manacost.ru)

Contract: [embeds and oEmbed](../specs/embeds-and-oembed.md).

**Не ставьте встраивания Hearthpulse в материалы только для подписчиков
(Boosty и т. п.):** арт и данные Hearthstone остаются бесплатными (ADR 0009).

## 1. Paste a link (no plugin)

Replay pages announce their oEmbed endpoint, so in the block editor a
pasted `https://hearthpulse.net/replay/<id>/` on its own line becomes the
embed after step 2 (WordPress embeds only registered providers in posts by
default).

## 2. Register the provider and the deck shortcode

Copy this file into `wp-content/mu-plugins/` (a must-use plugin needs no
activation) or its body into the theme's `functions.php`:

[`wordpress/hearthpulse-embeds.php`](wordpress/hearthpulse-embeds.php): it
registers the oEmbed provider for replay pages and deck embeds and adds the
shortcodes `[hearthpulse_deck code="…" height="760"]` and
`[hearthpulse_replay id="…"]`.

After it is installed:

- a replay: paste `https://hearthpulse.net/replay/<id>/` on its own line, or
  write `[hearthpulse_replay id="<id>"]`;
- a deck: `[hearthpulse_deck code="<deck code>"]`, or paste
  `https://hearthpulse.net/embed/deck/<code>/`.

## 3. Without WordPress

Any site can use the iframe directly:

```html
<iframe src="https://hearthpulse.net/embed/deck/AAECAZ8F.../"
  width="380" height="760" loading="lazy" title="Колода Hearthstone"
  style="border:0;border-radius:10px;max-width:100%"></iframe>
```

## Check

<!-- markdownlint-disable MD013 -->
```bash
curl -s 'https://hearthpulse.net/embed/oembed/?url=https%3A%2F%2Fhearthpulse.net%2Freplay%2F<id>%2F' | jq .html
curl -sI 'https://hearthpulse.net/embed/deck/<code>/' | grep -i -E 'content-security-policy|x-frame-options'
```
<!-- markdownlint-enable MD013 -->

The second must show `frame-ancestors *` and no `X-Frame-Options`.

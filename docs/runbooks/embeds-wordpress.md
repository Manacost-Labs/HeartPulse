# Hearthpulse embeds on WordPress (hs-manacost.ru)

Contract: [embeds and oEmbed](../specs/embeds-and-oembed.md).

## 1. Paste a link (no plugin)

Replay pages announce their oEmbed endpoint, so in the block editor a
pasted `https://hearthpulse.net/replay/<id>/` on its own line becomes the
embed after step 2 (WordPress embeds only registered providers in posts by
default).

## 2. Register the provider and the deck shortcode

Put this file into `wp-content/mu-plugins/hearthpulse-embeds.php` (a
must-use plugin needs no activation) or into the theme's `functions.php`:

```php
<?php
/**
 * Plugin Name: Hearthpulse embeds
 * Description: oEmbed for hearthpulse.net replays and decks; [hearthpulse_deck code="…"] and [hearthpulse_replay id="…"].
 * Version:     1.0.0
 */

defined( 'ABSPATH' ) || exit;

add_action( 'init', function () {
	// Pasted links become iframes through https://hearthpulse.net/embed/oembed/.
	wp_oembed_add_provider( '#https://(www\.)?hearthpulse\.net/(embed/)?replay/[0-9A-Za-z]{10}/?#i', 'https://hearthpulse.net/embed/oembed/', true );
	wp_oembed_add_provider( '#https://(www\.)?hearthpulse\.net/embed/deck/.+#i', 'https://hearthpulse.net/embed/oembed/', true );

	// [hearthpulse_deck code="AAECAZ8F…" height="760"]
	add_shortcode( 'hearthpulse_deck', function ( $atts ) {
		$atts = shortcode_atts( array( 'code' => '', 'height' => 760 ), $atts, 'hearthpulse_deck' );
		$code = preg_replace( '#[^A-Za-z0-9+/=]#', '', (string) $atts['code'] );
		if ( '' === $code ) {
			return '';
		}
		return sprintf(
			'<iframe src="%s" title="%s" width="380" height="%d" loading="lazy" style="border:0;border-radius:10px;max-width:100%%"></iframe>',
			esc_url( 'https://hearthpulse.net/embed/deck/' . rawurlencode( $code ) . '/' ),
			esc_attr__( 'Колода Hearthstone — Hearthpulse' ),
			max( 240, min( 1200, absint( $atts['height'] ) ) )
		);
	} );

	// [hearthpulse_replay id="abcDEF1234"]
	add_shortcode( 'hearthpulse_replay', function ( $atts ) {
		$atts = shortcode_atts( array( 'id' => '' ), $atts, 'hearthpulse_replay' );
		$id   = preg_match( '#^[0-9A-Za-z]{10}$#', (string) $atts['id'] ) ? $atts['id'] : '';
		if ( '' === $id ) {
			return '';
		}
		return sprintf(
			'<iframe src="%s" title="%s" width="600" height="360" loading="lazy" style="border:0;border-radius:10px;max-width:100%%"></iframe>',
			esc_url( 'https://hearthpulse.net/embed/replay/' . $id . '/' ),
			esc_attr__( 'Реплей Hearthstone — Hearthpulse' )
		);
	} );
} );
```

After it is installed:

- a replay: paste `https://hearthpulse.net/replay/<id>/` on its own line, or
  write `[hearthpulse_replay id="<id>"]`;
- a deck: `[hearthpulse_deck code="<deck code>"]`, or paste
  `https://hearthpulse.net/embed/deck/<code>/`.

## 3. Without WordPress

Any site can use the iframe directly:

```html
<iframe src="https://hearthpulse.net/embed/deck/AAECAZ8F.../" width="380" height="760"
  loading="lazy" style="border:0;border-radius:10px;max-width:100%" title="Колода Hearthstone"></iframe>
```

## Check

```bash
curl -s 'https://hearthpulse.net/embed/oembed/?url=https%3A%2F%2Fhearthpulse.net%2Freplay%2F<id>%2F' | jq .html
curl -sI 'https://hearthpulse.net/embed/deck/<code>/' | grep -i -E 'content-security-policy|x-frame-options'
```

The second must show `frame-ancestors *` and no `X-Frame-Options`.

# Page header consistency

## Scope and acceptance

Traditional mode (matchups, meta, fun decks, archetypes, Vicious Gold and
cards) and Arena (classes, tier list and legendaries) use the same page-header
geometry and crimson/gold surface. Titles, descriptions and summary data remain
owned by their routes. Header styling is owned by `TraditionalModeBanner.css`;
`tokens.css` owns responsive dimensions and `route-parchment.css` owns the
canvas.

At a given viewport, headers share their horizontal bounds, minimum height,
padding and H1 scale. The first content block starts 16px below the banner;
the banner owns this gap. Meta has no extra related-links row below its banner,
since those destinations remain in the main navigation. Current titles and
summaries fit without cropping at
320, 390, 768 and 1440 pixels. Extra content or enlarged text may grow a header;
fixed heights and line clamps must not hide content. The route keeps one H1.
The shared artwork is right-aligned and scaled by banner height, rather than
stretched to cover a wide canvas, so the character’s face is not cropped.
The existing route transitions stay intact, and decorative opacity motion is
disabled with `prefers-reduced-motion: reduce`.

The artwork is `/wallpaper/profile-hero-hth-1430.avif` (46 KB) in browsers
that read `image-set()` with `type()`, and `profile-hero-hth.webp` (65 KB) in
the rest. The AVIF sits in an `@supports` rule: the CSS build merges a fallback
declaration in the same rule away. On phones the banner is the largest paint
of `/standard/matchups/`, `/standard/archetypes/` and
`/standard/vicious-gold/`, so those pages preload the AVIF with
`PageBannerPreload` and skip the shell's parchment preload; on the other
banner pages the parchment or text paints first and the banner is not
preloaded.

## Implementation and verification

1. Reproduce geometry differences in a browser fixture using the production
   styles and the actual Arena banner component.
2. Consolidate banner presentation and responsive tokens, then remove the
   conflicting per-route geometry. Preserve data controls and permissions.
3. Preview normal and long-copy stories; verify the four viewport widths,
   enlarged text, reduced motion, overflow, console and network health.

Run `node --test tests/page-headers-browser.test.mjs`, `npm run lint`,
`npm run test:storybook`, `npm run build-storybook`, and
`npm run security:semgrep`. Launch the component workshop with
`npm run storybook -- --host 127.0.0.1`.

See [the verification runbook](../runbooks/page-header-verification.md) for
Jev measurements and guest-access limitations. This task adds no dependencies,
changes no access policy. Publication follows the standard validated `main`
release workflow.

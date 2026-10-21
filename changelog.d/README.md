# Changelog fragments

One file per user- or maintainer-visible change:
`changelog.d/<YYYY-MM-DD>-<slug>.md`, lowercase slug, for example
`2026-10-21-meta-periods.md`.

Write the entry as plain Russian text, the way it should read in
`CHANGELOG.md`: no heading, no leading list marker. Line breaks are kept; the
assembler turns the file into one list item.

Check: `npm run changelog:assemble -- --check`. Release owner:
`npm run changelog:assemble -- --release v1.2.3` moves every fragment and the
`## Unreleased` entries into a new version section and deletes the fragments.
After deployment the same file is the Telegram post:
`npm run changelog:post -- --fragment changelog.d/<file>.md`.

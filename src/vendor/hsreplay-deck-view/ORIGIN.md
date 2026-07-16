# HSReplay Deck View snapshot

- Source: https://github.com/Zulut30/hsreplay-deck-view
- Commit: `a2860ee286e4f85adbbaf007003bfcab23800318`
- Vendored files: `src/hsreplay-deck-view.js`, `src/hsreplay-deck-view.css`, `src/hsreplay-deck-view.d.ts`
- Integration patch: the CommonJS branch also assigns the documented global API so Vite code-split chunks can consume it reliably.

The snapshot is kept in the application bundle so production builds do not
depend on GitHub availability or SSH credentials. Update all three files and
the commit above together.

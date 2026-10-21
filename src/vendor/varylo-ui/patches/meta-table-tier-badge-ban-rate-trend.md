# MetaTable: tier badge, optional ban rate, trend column

- Files: `gaming/MetaTable.tsx`, `gaming/MetaTable.css`
- Change: `renderTier` (draws the site's `TierBadge`, see `assets.md`),
  `showBanRate` (false drops the ban-rate column) and `trendColumn` (an
  extra cell such as a sparkline); the change under a rate is drawn with
  `TrendValue`.
- Why: tier badges have one site-wide style, and Hearthstone has no bans.
- Upstream: not submitted; carry it over when the file is re-copied from the registry.

# navigation/internal: newer registry copy with a vertical orientation

- Files: `navigation/internal.tsx`
- Change: replaced by the newer copy of the free release registry that came
  with `tabs`; `rovingTarget` also accepts `'vertical'` (Up/Down only, Left
  and Right stay with the page). `horizontal` and `both` behave as before, so
  the admin console's `Menu`, `Sidebar` and `DropdownMenu` are unaffected.
- Why: `navigation/Tabs` and `navigation/useTabs` of the account game
  statistics pass the orientation through to this helper.
- Upstream: this is the registry file itself; nothing to carry over when it is
  re-copied from a release that already has the vertical orientation.

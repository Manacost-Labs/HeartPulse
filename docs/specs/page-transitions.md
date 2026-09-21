# Page transition motion

## Objective

Client-side navigation should feel continuous without making HearthPulse slower
or obscuring the destination. The persistent navigation, utility header and
page background stay still while the route content changes.

## Interaction contract

- Route content uses one short cross-fade. The outgoing page does not slide in
  the opposite direction to the incoming page.
- The outgoing snapshot clears quickly while the destination settles over
  300 milliseconds. The destination is partially visible from the first frame,
  so parchment does not flash through between pages.
- The route snapshot group uses the same duration and easing as the destination
  frame, including when the old and new pages have different dimensions.
- The application shell stays mounted and lazy route fallbacks do not add a
  second animation.
- `prefers-reduced-motion: reduce` bypasses the View Transition API and keeps
  navigation immediate.

## Verification

Run `npx tsx tests/route-loading-surface.test.tsx`, the normal release checks,
and review forward and back navigation in a real browser at mobile and desktop
widths. Confirm the shell remains stable, content is not clipped, rapid route
changes do not leave a stale snapshot, and the console and network remain clean.

## Documentation impact

This specification and `CHANGELOG.md` describe the user-visible motion change.
Architecture documentation is unchanged because navigation ownership and module
boundaries do not change.

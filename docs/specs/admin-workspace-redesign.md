# HearthPulse admin workspace redesign

## Objective

Turn the existing authenticated admin workspace into a fast operational console
that is recognisably HearthPulse, remains useful with real production data, and
keeps every existing permission, CSRF, revision, audit and parser contract.

The approved visual references are committed with this specification:

- [`../assets/admin-redesign/overview-reference.png`](../assets/admin-redesign/overview-reference.png)
- [`../assets/admin-redesign/parser-operations-reference.png`](../assets/admin-redesign/parser-operations-reference.png)

The direct user-approved ImageGen references above, the current Storybook
states and verified application behaviour are the design authority for this release.

## Product principles

1. Use the real HearthPulse mark and an editorial tavern-console character:
   walnut navigation, warm neutral surfaces, restrained gold emphasis and
   readable operational status colours.
2. Keep the interface dense enough for operators without turning it into a
   generic template dashboard. Brand display type is limited to identity and
   major page headings; controls and data use the existing UI font.
3. Render only values and actions already supplied by the application. The
   reference metrics, dates and stage timelines are illustrative and must not
   become production fixtures.
4. Preserve the existing navigation model, mobile drawer, loading and error
   states, parser polling, run de-duplication, revision conflict handling and
   audit visibility.
5. Meet WCAG AA intent: visible keyboard focus, semantic landmarks, labelled
   controls, minimum 44 px primary touch targets, reduced-motion support and
   no status communicated by colour alone.

## Information architecture

### Shared shell

- Fixed desktop sidebar grouped by the existing admin sections.
- Compact top command bar with HearthPulse identity, verified access state,
  public-site link and current operator identity.
- Section search filters existing navigation items only; it never pretends to
  search data that the server does not expose.
- Below 1024 px the sidebar becomes the existing focus-managed modal drawer.

### Overview

- Four real KPI cards: content, paid audience access, contests and campaigns.
- A prominent action strip for the existing create and navigation actions.
- Recent referral activity remains real and retains its empty state.
- No chart is introduced until the backend exposes a trustworthy time series.

### Data and parsers

- Preserve health, publication policy, sections, schedules, manual runs and
  audit as one page with clearer visual hierarchy.
- Run history becomes a responsive operations table. Selecting a run opens a
  non-destructive detail surface based only on its existing metadata, source
  results and error messages.
- Running and queued progress remains live through the current polling loop.
- There is no delete, scoped retry or fabricated log stream in this release.

## Implementation boundaries

- Client presentation only. Do not change `server/`, auth guards, data stores,
  deploy configuration or parser API payloads.
- Keep composition in `src/features` and reusable shell chrome in
  `src/modules/adminWorkspace`, following `app -> modules -> shared`.
- Add no runtime dependency and no new application-wide abstraction.
- Preserve all existing admin routes and deep links.

## Verification

The release is complete only when:

- focused shell and parser contract tests pass;
- lint, type checking, architecture lint and changed-file security scanning pass;
- Storybook interaction tests and static build pass;
- changed desktop, tablet and mobile states are inspected in a real browser for
  overflow, focus order, semantics, console errors and failed requests;
- the project release gate passes against the exact commit;
- production health, release SHA and the authenticated admin entry boundary are
  verified, with the previous immutable release still available for rollback.

## Rollback

This is a client-only release with no migration. Roll back by restoring the
previous immutable application release or reverting the redesign commit and
redeploying. No parser data or user state needs conversion.

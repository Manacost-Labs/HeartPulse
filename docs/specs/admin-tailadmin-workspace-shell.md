# TailAdmin-inspired admin workspace shell

## Status

Approved for implementation on 2026-08-14 from the owner's request to adopt
the free TailAdmin dashboard approach for the Arena administration workspace.

## Goal

Give administrators a calm, consistent operations workspace inspired by the
free TailAdmin React dashboard while preserving every existing Manacost admin
workflow and access boundary.

## Source and licensing

- Design reference: `TailAdmin/free-react-tailwind-admin-dashboard`.
- Reference license: MIT.
- The implementation is original Manacost React and CSS. It adapts layout and
  interaction patterns; it does not copy TailAdmin source, assets or paid
  components and adds no runtime dependency.

## Scope

- Extract the presentational application shell from the legacy contest feature
  into a focused `adminWorkspace` module.
- Restyle the command header, grouped primary navigation, page heading, status
  badge, canvas and shared admin surfaces with a TailAdmin-like hierarchy.
- Add a colocated Storybook story for the reusable shell.
- Keep the current data views visually compatible with the new shell.
- Load the shell and its CSS only for the authenticated admin workspace so the
  public contests route does not pay for administrator presentation.

## Non-goals

- No changes to authentication, authorization or administrator roles.
- No changes to API calls, persistence, URL parameters or section identifiers.
- No changes to the business behaviour inside articles, gallery, translations,
  parsers, decks, users, mailing, Boosty, analytics, Telegram, contests or
  referrals.
- No TailAdmin package, paid component or copied third-party asset.

## Information architecture

The existing navigation inventory remains complete and ordered:

1. Рабочий стол: Обзор.
2. Контент: Статьи, Галерея, Переводы, Механики и теги.
3. Система: Данные и парсеры, Фановые колоды, Public API, Сочетания в Арене.
4. Аудитория: Пользователи, Рассылка, Boosty, Аналитика, Telegram.
5. Рост: Конкурсы, Реферальные ссылки.

Contest-only administrators continue to see only the contest section.

## Visual contract

- Neutral application canvas and white content surfaces with restrained borders
  and shadows; no decorative texture in the admin workspace.
- Dark navy navigation provides the stable spatial anchor. Manacost blue is the
  primary interactive and brand color; existing feature-level highlights keep
  their established semantics.
- Four-point spacing rhythm, compact 14–16 px body text and a page title no
  larger than 32 px.
- Desktop uses a fixed 280 px navigation rail and a 72 px command header.
- Content remains readable up to 1480 px and shared cards use consistent 12 px
  radii.
- Active navigation is identified by color, a leading marker and
  `aria-current="page"`; color is never the only cue.
- The mana crystal and access state form the distinctive Manacost signature.

## Interaction and responsive contract

- Selecting a navigation item keeps the current `section` query parameter and
  current conditional-mount behaviour.
- At narrow widths the navigation becomes a modal drawer with a labelled toggle,
  backdrop dismissal, Escape dismissal, focus containment, body scroll lock and
  focus restoration.
- Interactive targets in the shell are at least 44 px on touch layouts.
- At 200% zoom content remains available without page-level horizontal overflow.
- Reduced-motion preferences remove drawer transitions.
- The existing page skip link continues to target `#main-content`.

## Component contract

`AdminWorkspaceShell` receives already-authorized navigation items, the active
section, user/access labels, refs and callbacks from `ContestAdminPanel`. It
owns its markup and self-contained presentation in a lazy admin-only chunk. The
feature continues to own authorization, the reducer, URL state,
focus-management effects, API data and section content.

The shell exposes stable landmarks and identifiers:

- a command header;
- `#admin-primary-navigation` inside an aside labelled `Разделы админ панели`;
- a mobile `dialog` state only while the drawer is open;
- one active item with `aria-current="page"`;
- a content region labelled by `#admin-section-title`;
- a polite status or alert toast with a labelled close action.

## Acceptance criteria

- All authorized navigation entries and their groups render in the existing
  order, and changing a section still updates browser history.
- Desktop, mobile and 200% zoom checks show no clipped navigation or page-level
  horizontal overflow.
- Keyboard users can open, traverse and close the mobile drawer and retain a
  visible focus indicator.
- The shell story covers full-access desktop, mobile-open and contest-only
  states and passes Storybook accessibility checks.
- Render-contract tests, admin reducer tests, Storybook build, changed React
  checks, security checks and real-browser console/network checks pass.
- The public contests route remains within its production bundle budget.
- No existing admin data or mutation path changes.

## Documentation impact

This specification and `CHANGELOG.md` are the only required documentation
changes. The change is reversible UI composition and does not require an ADR,
API documentation or operations runbook update.

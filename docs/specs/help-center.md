# Account and help center refresh

## Objective

Make the account at `/?login` easier to navigate and `/faq/` useful for
account, subscription and game-section questions. Preserve verified access,
provider linking, newsletter consent and private data boundaries.

## Acceptance criteria

- The account names its owner and offers visible section navigation. Contacts
  have room for labelled fields, and help links lead to relevant FAQ answers.
- FAQ supports local search across questions and answers, topic selection,
  empty-result recovery and stable links to individual questions.
- Every answer describes a current feature. Payments and membership promises
  are qualified by the current provider and the account's actual access state.
- All answers are in initial server HTML, with usable native disclosures and
  links before JavaScript. Search is a small client component.
- Both pages work at 320, 390, 768 and 1440 px with visible keyboard focus,
  no horizontal overflow and controls at least 44 px high.
- Mobile topic selection uses a compact labelled select so search results
  stay near the search field. Desktop retains the full topic list.
  Clearing the search returns keyboard focus to the search input.

## Structure and style

The identity module owns account presentation. `src/modules/helpCenter`
owns help content, search matching and presentation through `public.ts`.
Next composition supplies the public shell. Auth requests remain in their
existing owners. Legacy FAQ exports remain compatible for existing callers.

Use the site's game heading and body fonts, parchment surfaces, bronze rules,
burgundy actions and green access indicators. Keep decoration concentrated in
the existing shared banner. Use semantic buttons, labels and native `details`.
The shared banner's public sizing tokens reduce it to 210 px on desktop and
180 px on mobile, keeping account actions and FAQ search near the first screen.

## Implementation plan

1. Account: owner identity, section links, wide contact form, contextual help.
   Verify existing account tests and desktop/mobile account stories.
2. FAQ: source-backed topic content, search and stable question anchors.
   Verify matching tests and search/topic/empty/direct-link browser flows.
3. Review: type checks, architecture, Storybook, Next build, security scan and
   real-browser review. Prepare files and evidence for the integration owner.

## Commands and tests

```sh
npm run agent:session:preflight
npx tsx --test tests/account-dashboard-model.test.ts tests/account-dashboard-ui.test.tsx
node --test tests/next-account-surface-browser.test.mjs
node --test tests/next-support-prompt-browser.test.mjs
npm run lint
npm run lint:next
npm run lint:architecture
npm run test:registry
npm run test:storybook
npm run build-storybook
npm run build:next
npm run security:semgrep
```

Tests live under `tests/` and are registered once. Browser review uses the
project Chrome DevTools MCP wrapper and synthetic accounts, never real users.

## Boundaries and documentation impact

No new authentication flow, transport contract, dependency or stored personal
data. No push to main or deployment from this task. Integration belongs to
the chat «Проверить сессии Codex», after the previous Production SHA is verified.

Documentation impact: this specification, `profile-workspace-design.md`,
`../architecture/help-center.md` and `../../CHANGELOG.md`.
Reviewed `../architecture/module-boundaries.md`: the dependency direction,
public-entry rule and shared UI contracts remain accurate. Help ownership is
recorded in its separate architecture document to avoid concurrent edits of
the common boundary guide.
Reviewed `../../apps/public-web/README.md`: its server-rendered content and
small client shell recipe remains accurate. The help module follows that
recipe: answer JSX and search text reach a small client explorer, while all
answers remain in initial HTML. The README has no changes in this task.

Selected skills: agent-resource-index; using-agent-skills; context-engineering;
codegraph; context7; spec-driven-development; planning-and-task-breakdown;
incremental-implementation; test-driven-development; debugging-and-error-recovery;
frontend-design; TypeUI
fundamentals; browser-testing-with-devtools; react-best-practices;
frontend-testing-debugging; security-and-hardening; documentation-and-adrs;
git-workflow-and-versioning; react-doctor; code-review-and-quality;
code-simplification; performance-optimization; web-quality-audit;
performance; core-web-vitals; accessibility.

## Integration note

The proposed unreleased changelog entry is:

> Обновлены навигация и оформление личного кабинета: компактная шапка,
> разделы аккаунта, удобные контакты и ссылки на помощь. FAQ расширена
> до 52 вопросов с поиском, темами и прямыми ссылками; ответы и SEO
> приведены к текущим возможностям HearthPulse. Выбор темы на телефоне
> компактный; очистка поиска сохраняет фокус в поле.

`CHANGELOG.md` is concurrently owned by other sessions. Append this entry
only after coordinating the shared file. Include the current `origin/main`,
repeat validation and the clean integration preflight before release.
The integration owner must verify the previous Production SHA first.

# HS-Arena Agent Instructions

This repository powers https://arena.hs-manacost.ru.

## Required Notion Task Tracking

Every Codex, Claude, or other AI-agent task that concerns
https://arena.hs-manacost.ru or any parser, scraper, ingestion pipeline, source
normalizer, cache, scheduled parser job, or parser administration in this
repository must be recorded in the shared Notion task database:

- Database: https://app.notion.com/p/ae96648273a24b50b687e3af7cefb623
- Database ID: `ae96648273a24b50b687e3af7cefb623`
- Data source ID: `90448a2c-5f1c-4742-928c-c8b5e1b23815`

The task database is the shared source of truth for both Codex and Claude.

1. Before implementation, search the database for the same task and create it
   only when no matching task exists.
2. Set an appropriate `Статус`, `Приоритет`, `Очередь`, `Тип`,
   `Направление`, `Размер`, `Риск`, and `Критерий готовности`. Do not add or
   recreate an assignee/responsible-person property.
3. Keep the Notion status current while working. Record blockers in `Блокер`.
4. Before finishing, add `Git commit` when a commit exists and `Production SHA`
   when the change has been deployed. Mark the task `Готово` only after the
   relevant checks pass and, when requested, production is verified.
5. Never store credentials, tokens, private user data, or other secrets in
   Notion.

Do not silently skip tracking. If the Notion connector is unavailable, report
that as a blocker and record the task as soon as access is restored.

## Required Changelog Post

Every AI agent that changes this project must post a short public update to https://t.me/changelogarena before finishing the task.

Use the local helper from the project root:

```bash
npm run changelog:post -- --version v1.0.0 --text "Коротко: что изменено, что проверено."
```

The helper reads the Telegram bot token from `/etc/hs-arena/hs-arena.env` and posts as `@kolodahearthstoneauthbot` to `@changelogarena`. Do not commit Telegram tokens, copied env files, or secret values.

When the work changes behavior, also update `CHANGELOG.md` under the current version or add a new version section.

## Release Version

Current public version: `v1.0.0`.

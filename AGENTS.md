# HS-Arena Agent Instructions

This repository powers https://arena.hs-manacost.ru.

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

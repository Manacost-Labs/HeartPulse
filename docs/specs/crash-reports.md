# Crash reports

## Objective

When the Hearthpulse desktop app hits an unexpected error, the player may send
a report: from the error window's «Отправить отчёт», or automatically with
Settings → Data → «Отправлять отчёты о сбоях автоматически» (off by default).
Nothing is sent otherwise (plan 0.5). A report tells what failed and where in
the code, never who the player is.

## API

`POST /api/v1/crash-reports`, JSON, no sign-in and no token (a report is
never tied to an account), 10 requests an hour per address
(`registerCrashReportsRateLimit`). 201 `{ ok: true }`; a report already
stored by its id is taken again without a second row; 400 `INVALID_REPORT`
when it is not the app's shape; 413 above 32 KB.

The shape (`server/modules/crashReports/report.ts`): `v: 1`, `id` (UUID),
`app: "hearthpulse"`, `version`, `ui` (`wpf` | `avalonia`), `os`, `runtime`,
`language`, `where` (`UI error`, `Fatal error`, `Unhandled error`,
`Background error`), `count`, `uptimeSeconds`, `at` (UTC, seconds), `errors`
(1–5: `type`, `message` ≤ 300, `stack` ≤ 40 lines of ≤ 300). Unknown fields
are dropped. Every text is scrubbed again: e-mails, BattleTags, absolute
paths, IP addresses and numbers of 7 digits and more are replaced by
placeholders.

## Data

Table `crash_reports`: `id`, `received_at`, `version`, `ui`, `error_type` (the
first exception's type, for grouping), `report_json`. No IP address, no
account, no device id. Kept 90 days (`CRASH_REPORT_KEEP_DAYS`), pruned a
minute after start and once a day where background jobs run. Reading is for
the owner, from the database; there is no admin page yet.

## Privacy

`src/modules/legalPages/content.json`, section 6: only on the player's
action or switch, what a report holds and what is cut out, not tied to an
account, no IP, 90 days.

## App

Hearthpulse `docs/crash-reports.md`: the consent, what the app sends, the
queue for crashes that end the process, the installer notice.

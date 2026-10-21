# Architecture decision records

`docs/decisions/` is the only ADR directory (`docs/README.md`). An ADR records
an expensive or hard-to-reverse decision: context, decision, consequences and
the decision that later replaced it.

## Naming

A new ADR is `YYYY-MM-DD-<slug>.md`: the date the decision was taken and a
lowercase slug, for example `2026-10-21-pull-requests-and-merge-queue.md`.
Refer to it as `ADR <date>` and link the file. Nobody picks a sequence number,
so parallel branches never take the same one.
`tests/documentation-truth.test.mjs` enforces the pattern; the files listed
there from before the rule keep their names.

## Old numbers

Three branches took `010` and two took `011`. Those files were renamed; old
references mean:

| Old name | File |
| --- | --- |
| `010-read-only-game-data-audit.md` (ADR 010) | [2026-08-07-read-only-game-data-audit.md](2026-08-07-read-only-game-data-audit.md) |
| `010-application-route-manifest-and-navigation-layer.md` (ADR-010) | [2026-08-17-application-route-manifest-and-navigation-layer.md](2026-08-17-application-route-manifest-and-navigation-layer.md) |
| `010-hearthpulse-domain-migration.md` (ADR-010) | [2026-08-20-hearthpulse-domain-migration.md](2026-08-20-hearthpulse-domain-migration.md) |
| `011-native-typecheck-and-oxlint.md` (ADR 011) | [2026-10-20-native-typecheck-and-oxlint.md](2026-10-20-native-typecheck-and-oxlint.md) |
| `011-pull-requests-and-merge-queue.md` (ADR-011) | [2026-10-21-pull-requests-and-merge-queue.md](2026-10-21-pull-requests-and-merge-queue.md) |

The unique numbered ADRs (`0001`, `0002`, `001`–`009`) and the undated ones
keep their names and links.

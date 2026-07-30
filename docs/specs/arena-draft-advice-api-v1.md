# Spec: Arena draft advice API v1

## Objective

Expose the existing Arena draft advisor as a stable, admin-only HTTP API and
improve its ranking on the data already available from successful 12-win runs.
The first consumer is the Manacost admin application; other trusted
applications can integrate through the same server boundary later.

Success means an authenticated administrator can submit a class, the current
deck and exactly three offered cards and receive a deterministic, explainable
ranking tied to one Arena cohort and model version.

## Stack

- Node.js 22 and TypeScript 5.8.
- Express 4.21 `Router`, mounted below `/api`.
- Existing cookie-backed administrator guard and route-aware JSON parser.
- Existing 15-minute Arena analysis cache and last-known-good snapshots.
- No new runtime dependencies, secrets, database tables or authentication
  mechanisms.

## Commands

- Focused tests: `npm run test:arena-synergies`
- Typecheck: `npm run lint`
- Security scan: `npm run security:semgrep:strict`
- Production build: `npm run build`
- Release gate: `npm run verify:release`

## HTTP contract

### Request

`POST /api/admin/arena-draft-advice`

```json
{
  "class": "DEMONHUNTER",
  "deckCardIds": ["CARD_1", "CARD_1", "CARD_2"],
  "candidateCardIds": ["OFFER_1", "OFFER_2", "OFFER_3"]
}
```

Rules:

- `class` is one concrete Arena class; `ALL` is rejected.
- `deckCardIds` contains at most 30 known card IDs; duplicates are allowed.
- `candidateCardIds` contains exactly three distinct known card IDs.
- Card IDs are non-empty strings no longer than 80 characters.
- The request must pass the existing admin guard and same-origin CSRF check.

### Success

Status `200`, `Cache-Control: no-store`.

```json
{
  "schemaVersion": 1,
  "model": {
    "id": "arena-draft-advisor-v2",
    "stage": "early",
    "weights": {
      "base": 0.65,
      "synergy": 0.2,
      "curve": 0.15
    }
  },
  "generatedAt": "2026-07-30T00:00:00.000Z",
  "selectedClass": "DEMONHUNTER",
  "cohort": {
    "id": "36.0:fingerprint",
    "patchVersion": "36.0",
    "patchPublishedAt": "2026-07-20T00:00:00.000Z",
    "poolFingerprint": "fingerprint",
    "from": "2026-07-25T00:00:00.000Z",
    "to": "2026-07-30T00:00:00.000Z"
  },
  "sample": {
    "runsAnalyzed": 328,
    "dataQualityStatus": "healthy",
    "sampleMode": "stable",
    "servedFrom": "live"
  },
  "advice": {
    "choices": [],
    "isCloseDecision": false,
    "limitations": []
  }
}
```

Choice scores contain base strength, proven synergy, curve fit and a
data-derived duplicate redundancy penalty. The response never claims a
predicted number of wins.

### Errors

Every expected error has `{ "code": string, "error": string }`.

- `400 INVALID_REQUEST_BODY`: body is not an object.
- `400 INVALID_ARENA_CLASS`: missing, `ALL` or unknown class.
- `400 <advisor input code>`: invalid counts, IDs, duplicates or unknown cards.
- `403 CSRF_REJECTED`: same-origin mutation header is missing.
- `409 ARENA_DRAFT_ADVISOR_NOT_READY`: the class has insufficient current data.
- `502 ARENA_DRAFT_ADVICE_UNAVAILABLE`: upstream analysis is unavailable;
  internal errors and source details are not exposed.

Authentication failures remain owned by the existing admin guard.

## Ranking model v2

The model keeps the independently measured signals separate:

1. Base strength is the reliability-shrunk percentile of card deck win rate.
2. Synergy includes at most three confirmed or promising matched-control pairs;
   merely popular pairs add no bonus.
3. Curve fit is blended toward neutral during the first ten picks so an
   incomplete deck is not treated as a malformed final deck.
4. Redundancy is a penalty only when the next copy exceeds the typical
   successful-deck copy count observed for that card.
5. Stage weights are:
   - picks 1–10: base 65%, synergy 20%, curve 15%;
   - picks 11–20: base 50%, synergy 30%, curve 20%;
   - picks 21–30: base 35%, synergy 40%, curve 25%.

No card roles are inferred in v1 because the source does not provide a
reviewed role taxonomy. Redraft remains descriptive and is excluded because
the source lacks the complete offered-card denominator.

## Project structure

- `shared/arenaDraftAdvisor.ts`: pure deterministic ranking model.
- `shared/arenaSynergyContract.ts`: shared input/output types.
- `server/arenaSynergyAnalysis.ts`: cohort-derived curve and copy profiles.
- `server/adminArenaSynergyRoutes.ts`: validation and HTTP serialization.
- `server/adminArenaSynergyService.ts`: cached dataset loading.
- `tests/arena-draft-advisor.test.ts`: small model tests.
- `tests/admin-arena-draft-advice-routes.test.ts`: medium API contract tests.
- `docs/admin-arena-synergies.md`: operator and integration documentation.

## Testing strategy

- RED first: stage weights, early-curve neutralisation, typical-copy behaviour
  and excess-copy penalties.
- Route tests: auth, CSRF, no-store headers, body bounds, success metadata,
  insufficient data and redacted failures.
- Existing Arena analysis tests: copy profiles are bounded and derived from the
  selected class/cohort only.
- Full release gate before integration.

## Threat model

Trust boundaries are the HTTP body and the upstream HS data API. Assets at risk
are administrator-only analytics, server availability and internal source
details.

- Spoofing/elevation: existing admin guard on both Arena routes.
- Tampering: strict allowlisted class and bounded card arrays/IDs.
- Repudiation: endpoint is read-only and creates no persistent user state.
- Information disclosure: minimal response projection, no raw runs/player IDs,
  private no-store response, generic upstream errors.
- Denial of service: 1 MiB global JSON limit, maximum 33 submitted IDs, global
  API rate limit and cached source analysis.
- CSRF: same-origin mutation header is required for the cookie-authenticated
  POST.

## Boundaries

- Always: preserve patch/class cohort isolation, validate HTTP input, return
  deterministic ordering, keep the response no-store and run tests before
  commits.
- Ask first: public API-key access, new authentication flows, new dependencies,
  database schema changes or collection of player-identifying data.
- Never: expose raw run/player identifiers, include redraft in scoring without
  offer denominators, claim causality or a win forecast, commit secrets.

## Acceptance criteria

- The documented request returns a three-choice ranking and cohort metadata.
- Existing UI ranking and API ranking call the same pure model.
- The stage and weights are explicit in every successful response.
- A card is not penalised until its next copy exceeds the cohort-derived
  typical successful count.
- Invalid and unauthorised inputs do not load upstream data.
- No full analysis payload, raw run or player identifier is returned.
- Focused tests, typecheck, security checks, production build and release gate
  pass.

# ADR 002: Domain modules and documentation contract

- Status: Accepted
- Date: 2026-07-29
- Owners: HS-Arena maintainers

## Context

Several production entry points combine routing, state, data access, business
policy and presentation in files between roughly 1,500 and 10,000 lines. The
existing size ratchet prevents further growth, but a size limit alone does not
tell a developer where extracted behavior belongs or which dependencies are
allowed.

The repository also contains architecture, specification and runbook
documentation, but changes do not have one explicit rule for selecting and
updating the owning document. More inline comments would not solve that
problem: comments are useful for local intent, while system contracts and
operational knowledge need durable, searchable documents.

## Decision

HS-Arena will migrate incrementally to domain-owned modules.

- Application composition depends on domain modules.
- Domain modules depend on small shared platform primitives.
- Shared code never depends on a product domain.
- Each module exposes a narrow public contract and keeps its implementation
  private.
- Client routes separate route composition, UI orchestration, pure model,
  external data and views.
- Server routes separate HTTP boundaries, services, repositories, models and
  validation schemas.
- Existing monoliths are replaced one independently deployable vertical slice
  at a time, preserving public compatibility by default.

The concrete boundaries and migration workflow are defined in
[`docs/architecture/module-boundaries.md`](../architecture/module-boundaries.md).

Every implementation task must also declare `Documentation impact`. Code and
its owning architecture, decision, specification, runbook or changelog update
ship together. Inline comments and JSDoc explain non-obvious intent, invariants,
side effects and constraints; they do not repeat code.

## Alternatives considered

### Rewrite the application by layer

Rejected. A large rewrite delays value, mixes unrelated behavior and creates a
high-risk cutover. Technical-layer folders also keep ownership ambiguous across
domains.

### Keep the current structure and rely only on line budgets

Rejected. Budgets stop growth but cannot prevent arbitrary helper extraction,
cross-feature imports or a new collection of smaller spaghetti files.

### Create a broad shared framework before extracting domains

Rejected. The correct common abstraction is not known until multiple domain
slices expose the same stable need. Premature shared code couples migrations
and obscures ownership.

### Require comments on every function

Rejected. Comment volume is not documentation quality. Comments that restate
code become stale and make the important invariants harder to find.

## Consequences

### Positive

- A maintainer can start from one domain entry point and follow one-way
  dependencies.
- Pure policy and boundary validation become directly testable.
- Route chunks and server startup composition can be optimized independently.
- Architecture, public contracts and operational procedures have explicit
  owners.
- Agents and humans use the same completion criteria.

### Costs

- The old and new structures coexist during migration.
- Narrow public contracts require deliberate naming and may expose missing
  domain models.
- A structural slice includes tests and documentation, so moving code has a
  higher immediate bar.
- Cross-domain reuse may remain duplicated until a stable shared contract is
  proven.

## Compliance

- `npm run lint:architecture` keeps known hotspots from growing.
- `npm run test:agent-tooling` verifies the repository documentation contract.
- Each extraction lowers the relevant line or bundle ratchet.
- Reviews reject new domain behavior in composition roots, internal
  cross-module imports, catch-all helper folders and stale documentation.

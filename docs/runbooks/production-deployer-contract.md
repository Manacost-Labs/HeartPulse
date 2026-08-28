# Production deploy-helper contract

## Purpose

The self-hosted runner executes a root-owned gate and deployer that the
workflow checkout cannot replace. This runbook verifies that the installed
pair is byte-for-byte identical to reviewed source before an immutable release
artifact is downloaded or passed to privileged code.

## Read-only diagnosis

From the exact reviewed checkout that is intended for `main`, run:

```bash
deploy/install-hs-arena-deployer.sh --check
```

The check requires these source contracts:

- `deploy/hs-arena-ci-deploy` reports `hs-arena-ci-deploy 1.2.0` and
  `require-deployer-capability-v1`;
- `scripts/deploy-release.sh` reports `hs-arena-deploy-release 1.1.0` and
  `scraper-runtime-probe-v1`;
- `/usr/local/libexec/hs-arena/deploy-release.capabilities` binds the installed
  deployer path, version, SHA-256 checksum and capabilities.

On 2026-08-28 the production runner still had the legacy gate and deployer:
neither implemented the required introspection interface and the capability
manifest was absent. Source and installed checksums differed. The failure was
installation drift, not a missing source capability; removing the capability
requirement would have hidden the unsafe mixed-version state.

The check is intentionally read-only and must not use `sudo`. It prints an
`expected=... installed=...` diagnostic and exits before release artifact
handling. Do not inspect environment files, credentials or production data to
diagnose this contract.

## Controlled installation

Only after the exact source commit has been reviewed and approved for
integration, install from its clean checkout:

```bash
sudo deploy/install-hs-arena-deployer.sh --install
deploy/install-hs-arena-deployer.sh --check
```

The installer stages all three files in their destination directories, checks
their versions, checksums and capabilities, then atomically replaces the
root-owned copies. It does not deploy an application release, reload services
or change runtime data.

Do not install from a workflow artifact, a dirty checkout or an unreviewed
feature branch. Never add a broad `NOPASSWD` rule: the runner remains limited
to `/usr/local/sbin/hs-arena-ci-deploy *`.

## CI behavior

`.github/workflows/ci.yml` performs the same `--check` after its pinned
checkout and before `actions/download-artifact`. A failed preflight means the
host must be updated through the controlled installation above; retry the
workflow only after the read-only check passes from the exact reviewed source.

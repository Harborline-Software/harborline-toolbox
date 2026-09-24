# Harborline Toolbox

> **Status: pre-release.** Harborline is under active development and is not ready for production use. APIs, schemas, storage formats and package names change without notice, and there are no supported installs yet. Source is licensed under [Apache-2.0](LICENSE); see [NOTICE](NOTICE) and the [trademark policy](TRADEMARKS.md).

Harborline Toolbox is an optional operator interface for installing, observing and managing Harborline applications and their supporting environment. It brings service health, diagnostics, logs and management actions into a desktop experience: a quick tray view for checking status and a larger window for investigation.

Essential operations must remain available through supported interfaces independently of Toolbox. Toolbox must own no exclusive operational authority or state required to run Harborline. It may be bundled for desktop convenience without becoming a required dependency.

For the shared product model and repository roles, read the [Harborline solution overview](https://github.com/Harborline-Software/harborline-app/blob/docs/solution-purpose/docs/solution-overview.md).

## Scope and implementation

The [module catalog](catalog/modules.yaml) records Toolbox's modules; the [projection catalog](catalog/projections.yaml) records their implementation locations and status. [Specifications](specs/) define behavior and [conformance fixtures](conformance/) define shared checks. Use these sources to assess current coverage instead of treating the product purpose as a list of delivered features.

Shared behavior belongs behind module interfaces; operating-system integrations belong in explicit host projections. A registered target or extracted module does not establish a runnable desktop application. Inspect implementation and verification evidence for the target you intend to use.

## Verify

From the repository root, run:

```sh
node tooling/validate-repository.mjs
cargo test --locked
node tooling/run-projects-gate.mjs
```

The [repository validator](tooling/validate-repository.mjs) checks metadata and boundaries. [Cargo.toml](Cargo.toml) declares the Rust workspace, and the [projects gate](tooling/run-projects-gate.mjs) defines extraction and consumer checks. Consult these files for current requirements and budgets; recorded or generated totals belong with their evidence rather than in this introduction.

## Contribute

[CONTRIBUTING.md](CONTRIBUTING.md) explains module and host boundaries and preservation of installed-user identities. [Repository metadata](repository.yaml) records source and package authority. Review those constraints before changing compatibility or distributing an artifact.

For usage questions and bug reports, see [SUPPORT.md](SUPPORT.md). Report sensitive vulnerabilities through [SECURITY.md](SECURITY.md).

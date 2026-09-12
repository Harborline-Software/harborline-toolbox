# Harborline Toolbox

This repository begins with a fresh public history as of September 2026. The earlier private history is kept, unchanged, in the private archive repository, and every design decision it records is carried forward in the Harborline control tickets. Nothing was rewritten; the history simply starts here.


> **Status: pre-release.** Harborline is under active development and is not ready for production use. APIs, schemas, storage formats and package names change without notice, and there are no supported installs yet. Source is licensed under [Apache-2.0](LICENSE); see [NOTICE](NOTICE) and the [trademark policy](TRADEMARKS.md).

Harborline Toolbox is an optional operator interface for installing, observing and managing
Harborline applications and their supporting environment. It provides convenient access to service
health, diagnostics, logs and management actions, helping an operator determine whether the
environment is working and investigate when it is not.

Essential installation, administration and diagnostic operations must remain available through
supported interfaces independently of Toolbox. Toolbox must own no exclusive operational authority
or state required to run Harborline. It may be bundled for desktop convenience without becoming a
required dependency.

This purpose carries forward from the earlier product and is independent of migration progress.
The intended desktop design combines a quick tray view with a larger window for investigation.
Current extraction status follows.

Harborline Toolbox is the independent Apache-2.0 desktop tool extracted from an earlier product. It
will own a shared desktop implementation plus explicit macOS, Windows, and—only when
verified—Linux host projections.

The first extracted candidate is `htbx.projects`, a bounded Rust project-listing module preserving
the compatibility package and library identities, `ProjectEntry` wire shape, and macOS installed-user
data path. Eight neutral cases exercise curated precedence/fallback, depth-one/two Git discovery,
exclusions, deterministic ordering, HOME shortening, and fail-soft behavior against native
filesystem fixtures. Package and source authority remain with the earlier product until a separate
cutover.

Windows remains preview with no extracted implementation, and Linux remains planned with no source
or placeholder directory. No Tauri host source, sibling application source, Fleet source,
ordinance source, or accelerator source is part of this slice.

Run the envelope gate with:

```bash
node tooling/validate-repository.mjs
cargo test --locked
node tooling/run-projects-gate.mjs
```

The gate checks formatting, all eight filesystem cases, the exact nine-entry crate payload, a
100,000-byte package budget, and a disposable consumer compiled only from the extracted crate.

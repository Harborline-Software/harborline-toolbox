# HTBX-0001: Shared desktop behavior and OS projections

Status: accepted

Toolbox is one product with shared project, diagnostics, update, and desktop-experience module
interfaces. macOS, Windows, and Linux are host projections, not separately authoritative products.
An OS projection exists only when real source and native packaging evidence exist; planned status is
represented in the catalog without an empty implementation directory.

Existing bundle/application identities and installed-user data paths remain compatible unless a
separate decision includes migration, backup, rollback, and clean-install evidence.

The first extraction applies this pattern to `htbx.projects`. `src/projects.rs` owns neutral
curated-list parsing, bounded Git discovery, ordering, path presentation, and fail-soft behavior.
`src/macos.rs` owns the HOME-based default project root and preserved installed-user data path. The
preserved `projects::get_projects()` entry point delegates to that adapter. Windows remains preview with no
extracted source, and Linux remains planned with no source directory. A host projection cannot be
promoted until it passes the same eight neutral filesystem cases.

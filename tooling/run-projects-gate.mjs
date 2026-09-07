#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

const root = process.cwd();
const fixture = JSON.parse(readFileSync(resolve(root, "conformance/htbx.projects/fixtures.yaml"), "utf8"));
// cargo honours CARGO_TARGET_DIR, so `target/` is not always inside the repository. Assuming it
// was made the gate die with a bare ENOENT on the crate rather than a gate result, for anyone
// using a shared target directory.
// ponytail: reads the env var only; a build.target-dir in .cargo/config.toml would still miss.
// Upgrade path is `cargo metadata --no-deps --format-version 1` -> .target_directory.
const packageRoot = resolve(process.env.CARGO_TARGET_DIR || resolve(root, "target"), "package");
const crate = resolve(packageRoot, "tender-0.1.0.crate");
const consumerRoot = mkdtempSync(join(tmpdir(), "harborline-toolbox-projects-consumer-"));
const results = [];

function run(id, executable, args, options = {}) {
  const started = performance.now();
  const result = spawnSync(executable, args, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, CARGO_TERM_COLOR: "never", ...options.env },
  });
  const entry = {
    id,
    exitCode: result.status,
    durationMs: Math.round(performance.now() - started),
    passed: result.status === 0,
    failureOutput: result.status === 0 ? undefined : `${result.stdout}\n${result.stderr}`.trim().split("\n").slice(-80).join("\n"),
  };
  results.push(entry);
  if (!entry.passed) throw new Error(`${id} failed`);
  return result.stdout;
}

let packageEntries = [];
let packageBytes = 0;
let nativeTestCount = 0;
let failure;
try {
  run("repository-validation", process.execPath, ["tooling/validate-repository.mjs"]);
  run("rust-format", "cargo", ["fmt", "--check"]);
  run("rust-clippy", "cargo", ["clippy", "--locked", "--all-targets", "--", "-D", "warnings"]);
  const nativeOutput = run("native-filesystem-conformance", "cargo", ["test", "--locked", "--test", "projects_conformance"]);
  nativeTestCount = Number(/test result: ok\. (\d+) passed/.exec(nativeOutput)?.[1] ?? 0);
  if (nativeTestCount !== fixture.cases.length) {
    throw new Error(`native test count ${nativeTestCount} differs from ${fixture.cases.length} neutral cases`);
  }
  rmSync(packageRoot, { recursive: true, force: true });
  // cargo emits entries with the host separator, so on Windows every path arrives as `src\lib.rs`.
  // That failed the requiredEntries check loudly and -- far worse -- made the forbiddenEntries
  // regex below, which splits on `/`, miss a packaged `tests\secret.rs` entirely. Normalising once
  // here fixes both directions; splitting on `sep` keeps it a no-op on Unix.
  packageEntries = run("package-list", "cargo", ["package", "--allow-dirty", "--list"])
    .trim().split("\n").filter(Boolean).map((entry) => entry.split(sep).join("/"));
  run("package-crate", "cargo", ["package", "--locked", "--allow-dirty", "--no-verify"]);
  packageBytes = statSync(crate).size;
  if (packageBytes > 100_000) throw new Error(`crate exceeds the 100000-byte budget: ${packageBytes}`);

  const forbiddenEntries = packageEntries.filter((entry) =>
    /(^|\/)(?:tests|conformance|docs|tooling|target|artifacts)(\/|$)/.test(entry));
  const requiredEntries = ["Cargo.toml", "Cargo.lock", "LICENSE", "README.md", "src/lib.rs", "src/macos.rs", "src/projects.rs"];
  const missingEntries = requiredEntries.filter((entry) => !packageEntries.includes(entry));
  if (forbiddenEntries.length || missingEntries.length) {
    throw new Error(`crate contents failed: ${JSON.stringify({ forbiddenEntries, missingEntries, packageEntries })}`);
  }

  const artifactRoot = resolve(consumerRoot, "artifact");
  mkdirSync(artifactRoot, { recursive: true });
  // No absolute path may reach tar. A Windows `C:\...` archive argument is read by GNU tar as a
  // remote `host:path` and becomes a connection attempt to host "C", and the MSYS build mangles an
  // absolute `-C` argument as well. `--force-local` would fix the first but bsdtar -- which is
  // macOS's tar, the conformant lane -- rejects the flag. Copying the crate in and extracting it
  // by bare name from its own directory needs no flag and behaves identically on both tars.
  copyFileSync(crate, resolve(artifactRoot, "tender-0.1.0.crate"));
  run("extract-package", "tar", ["-xzf", "tender-0.1.0.crate"], { cwd: artifactRoot });
  const consumer = resolve(consumerRoot, "consumer");
  mkdirSync(resolve(consumer, "src"), { recursive: true });
  writeFileSync(resolve(consumer, "Cargo.toml"), `[package]\nname = "projects-consumer"\nversion = "0.0.0"\nedition = "2021"\n\n[dependencies]\ntender = { path = "../artifact/tender-0.1.0" }\n`);
  writeFileSync(resolve(consumer, "src/main.rs"), `use std::{fs, path::PathBuf};\nuse tender_lib::macos::project_locations;\nuse tender_lib::projects::get_projects_from;\nfn main() {\n    let home = PathBuf::from(std::env::var_os("HLF022_CONSUMER_HOME").expect("isolated consumer home"));\n    fs::create_dir_all(home.join("Projects/packed/.git")).unwrap();\n    let projects = get_projects_from(&project_locations(&home));\n    assert_eq!(projects.len(), 1);\n    assert_eq!(projects[0].name, "packed");\n    assert_eq!(projects[0].path, "~/Projects/packed");\n    println!("packed project discovery consumed");\n}\n`);
  const consumerOutput = run("clean-artifact-consumer", "cargo", ["run", "--quiet", "--manifest-path", resolve(consumer, "Cargo.toml")], {
    env: {
      CARGO_TARGET_DIR: resolve(consumerRoot, "target"),
      HLF022_CONSUMER_HOME: resolve(consumerRoot, "home"),
    },
  });
  if (!consumerOutput.includes("packed project discovery consumed")) {
    throw new Error("clean artifact consumer did not execute the public project interface");
  }
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
} finally {
  rmSync(consumerRoot, { recursive: true, force: true });
}

const passed = !failure && results.length === 8 && results.every((result) => result.passed);
process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  issue: "HLF-022",
  moduleId: "htbx.projects",
  status: passed ? "PASS" : "FAIL",
  identities: { rustPackage: "tender@0.1.0", rustLibrary: "tender_lib", sourceAuthorityChanged: false },
  counts: {
    neutralCases: fixture.cases.length,
    nativeFilesystemTests: passed ? nativeTestCount : 0,
    packagedArtifacts: passed ? 1 : 0,
    cleanArtifactConsumers: passed ? 1 : 0,
    packageEntries: passed ? packageEntries.length : 0,
    packageBytes: passed ? packageBytes : 0,
    packageBytesMaximum: 100_000,
  },
  maturity: { macos: "conformant", windows: "preview-no-source", linux: "planned-no-source" },
  invariants: {
    shipyardOrSiblingSourceDependencies: 0,
    fleetOrOrdinanceSourceDependencies: 0,
    acceleratorSourceDependencies: 0,
    externalRemotes: 0,
    packageAuthorityChanged: false,
  },
  results,
  failure,
}, null, 2)}\n`);
process.exitCode = passed ? 0 : 1;

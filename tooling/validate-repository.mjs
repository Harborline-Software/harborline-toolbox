#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = process.cwd();
const errors = [];
const required = [
  "LICENSE", "README.md", "SECURITY.md", "CONTRIBUTING.md", "repository.yaml",
  "catalog/modules.yaml", "catalog/projections.yaml",
  "docs/architecture/decisions/HTBX-0001-shared-desktop-and-os-projections.md",
  "docs/provenance/source-map.yaml", "docs/provenance/repository-status.yaml",
  "docs/evidence/phase-6/projects-gate.json",
  "Cargo.toml", "Cargo.lock", "src/lib.rs", "src/macos.rs", "src/projects.rs",
  "conformance/htbx.projects/fixtures.yaml", "tests/projects_conformance.rs",
  "tooling/run-projects-gate.mjs",
];
const skippedDirectories = new Set([".git", "target", "node_modules", "dist", "artifacts"]);

function files(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && skippedDirectories.has(entry.name)) return [];
    const child = resolve(path, entry.name);
    return entry.isDirectory() ? files(child) : [child];
  });
}

for (const path of required) {
  if (!statSync(resolve(root, path), { throwIfNoEntry: false })?.isFile()) errors.push(`missing ${path}`);
}
const repository = JSON.parse(readFileSync(resolve(root, "repository.yaml"), "utf8"));
const catalog = JSON.parse(readFileSync(resolve(root, "catalog/modules.yaml"), "utf8"));
const projectionCatalog = JSON.parse(readFileSync(resolve(root, "catalog/projections.yaml"), "utf8"));
if (repository.repository !== "harborline-toolbox") errors.push("repository identity mismatch");
if (catalog.repository !== repository.repository) errors.push("catalog repository mismatch");
for (const [moduleId, module] of Object.entries(catalog.modules ?? {})) {
  const specification = resolve(root, module.interface?.path ?? "missing");
  if (!statSync(specification, { throwIfNoEntry: false })?.isFile()) errors.push(`${moduleId}: missing interface`);
}
const projects = catalog.modules?.["htbx.projects"];
if (projects?.status !== "extracted-candidate-conformant") errors.push("htbx.projects is not classified as a conformant extracted candidate");
if (projects?.implementation?.path !== "src/projects.rs") errors.push("htbx.projects implementation ownership is missing");
if ((projects?.implementation?.depth?.redistributedComplexity ?? []).length < 3) errors.push("htbx.projects lacks a passing deep-module deletion record");
if (projects?.artifact?.id !== "tender" || projects?.artifact?.library !== "tender_lib") errors.push("Rust package or library compatibility identity changed");
if (projects?.conformance?.fixture !== "conformance/htbx.projects/fixtures.yaml") errors.push("htbx.projects neutral fixture is not registered");
if (projects?.conformance?.nativeTests !== "tests/projects_conformance.rs") errors.push("htbx.projects native tests are not registered");

const projectInterface = JSON.parse(readFileSync(resolve(root, "specs/modules/projects/interface.yaml"), "utf8"));
const projectFixture = JSON.parse(readFileSync(resolve(root, "conformance/htbx.projects/fixtures.yaml"), "utf8"));
const interfaceCases = projectInterface.cases ?? [];
const fixtureCases = (projectFixture.cases ?? []).map((entry) => entry.id);
if (JSON.stringify(interfaceCases) !== JSON.stringify(fixtureCases)) errors.push("htbx.projects interface and fixture cases differ");
if (new Set(fixtureCases).size !== 8) errors.push("htbx.projects must define exactly eight unique cases");
const nativeTestSource = readFileSync(resolve(root, "tests/projects_conformance.rs"), "utf8");
for (const caseId of fixtureCases) {
  if (!nativeTestSource.includes(caseId)) errors.push(`native project tests do not reference ${caseId}`);
}

// docs/provenance/source-map.yaml records a sha256 for the extracted implementation and for the
// macOS adapter, and nothing checked either of them, so the record could drift from the source in
// silence -- which made it a claim rather than evidence. Deliberately no --refresh flag: a switch
// that rubber-stamps whatever is on disk defeats the point of a provenance record. The error
// carries the computed hash instead, so updating it stays a conscious copy-paste.
const sourceMap = JSON.parse(readFileSync(resolve(root, "docs/provenance/source-map.yaml"), "utf8"));
const projectsRecord = (sourceMap.records ?? []).find((record) => (record.moduleIds ?? []).includes("htbx.projects"));
let provenanceHashesVerified = 0;
for (const [field, path] of [["targetImplementationSha256", "src/projects.rs"], ["targetMacosAdapterSha256", "src/macos.rs"]]) {
  const recorded = projectsRecord?.[field];
  const actual = createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex");
  if (recorded === actual) provenanceHashesVerified += 1;
  else errors.push(`${path}: provenance ${field} records ${recorded ?? "nothing"}, file hashes ${actual}`);
}

const cargoManifest = readFileSync(resolve(root, "Cargo.toml"), "utf8");
if (!/^name = "tender"$/m.test(cargoManifest) || !/^version = "0\.1\.0"$/m.test(cargoManifest)) errors.push("Rust package compatibility identity changed");
if (!/^name = "tender_lib"$/m.test(cargoManifest)) errors.push("Rust library compatibility identity changed");
if (!/^publish = false$/m.test(cargoManifest)) errors.push("candidate crate must remain non-publishable");
if (/\btauri\b|workspace\s*=|path\s*=\s*"\.\./i.test(cargoManifest)) errors.push("project slice imports host or sibling source dependencies");

if (catalog.projections?.linux?.status !== "planned-no-source") errors.push("Linux status must remain planned until source is verified");
if (catalog.projections?.windows?.status !== "preview-no-source") errors.push("Windows projects projection must remain preview with no extracted source");
if (catalog.projections?.macos?.status !== "conformant" || catalog.projections?.macos?.path !== "src/macos.rs") errors.push("macOS projects adapter must be conformant and independently located");
if (JSON.stringify(catalog.projections) !== JSON.stringify(projectionCatalog.projections)) errors.push("projection catalog differs from authoritative module catalog");
for (const prohibitedProjection of ["projections/windows", "projections/linux", "src/windows", "src/linux"]) {
  if (statSync(resolve(root, prohibitedProjection), { throwIfNoEntry: false })) errors.push(`${prohibitedProjection}: placeholder or unverified source is prohibited`);
}
const allFiles = files(root);
const prohibitedPath = /(^|\/)(?:fleet|ordinance|anchor|bridge|anchor-mobile-ios|accelerators|\.claude|\.codex|\.wolf|node_modules|bin|obj|dist)(\/|$)/i;
for (const path of allFiles) {
  const local = relative(root, path).replaceAll("\\", "/");
  if (prohibitedPath.test(local)) errors.push(`prohibited path ${local}`);
  if (/\.(?:png|jpg|jpeg|gif|zip|gz|dll|dylib|exe|nupkg|tgz)$/i.test(local)) continue;
  const content = readFileSync(path, "utf8");
  if (local === "tooling/validate-repository.mjs") continue;
  const provenance = local.startsWith("docs/provenance/");
  if (!provenance && content.includes("/Users/christopherwood/Projects/Harborline-Software")) {
    errors.push(`${local}: legacy absolute source path`);
  }
  if (content.includes("../harborline-")) errors.push(`${local}: sibling source dependency`);
  if (/"(?:file|link|portal|workspace):/.test(content)) errors.push(`${local}: local package protocol`);
  const sourceBearing = local === "Cargo.toml" || local.startsWith("src/") || local.startsWith("tests/");
  if (sourceBearing && /\b(?:Fleet|ordinance|Anchor|Bridge|anchor-mobile-ios|accelerators?)\b/i.test(content)) {
    errors.push(`${local}: prohibited source-class reference`);
  }
}
let configuredRemotes = [];
try {
  configuredRemotes = execFileSync("git", ["remote"], { cwd: root, encoding: "utf8" }).trim().split("\n").filter(Boolean).filter((remote) => {
    const url = execFileSync("git", ["remote", "get-url", remote], { cwd: root, encoding: "utf8" }).trim();
    return !(url.startsWith("/") || url.startsWith("./") || url.startsWith("../") || url.startsWith("file://"));
  });
} catch {
  errors.push("unable to inspect Git remotes");
}
// The fence used to refuse EVERY external remote, which was right while repository.yaml recorded
// `remote.status: not-created` and the maintainer had not approved one. Approval has since been
// given and the remote exists, so an unconditional refusal would fail forever on the approved state
// it was written to wait for. What it guards has not changed: source must not reach a remote nobody
// approved. So it now checks the configured remotes against the ONE recorded in repository.yaml —
// a stray remote to any other host still fails, by name.
const approvedRemote = repository.remote?.url ?? null;
if (repository.remote?.status !== "created" || !approvedRemote) {
  if (configuredRemotes.length) errors.push(`external remote configured before approval: ${configuredRemotes.join(", ")}`);
} else {
  const normalise = (url) => url.replace(/\.git$/, "").replace(/\/$/, "").toLowerCase();
  const unapproved = configuredRemotes.filter((remote) => {
    const url = execFileSync("git", ["remote", "get-url", remote], { cwd: root, encoding: "utf8" }).trim();
    return normalise(url) !== normalise(approvedRemote);
  });
  if (unapproved.length) errors.push(`remote not approved in repository.yaml: ${unapproved.join(", ")}`);
}
const report = {
  schemaVersion: 1,
  repository: repository.repository,
  status: errors.length === 0 ? "PASS" : "FAIL",
  counts: { modules: Object.keys(catalog.modules ?? {}).length, files: allFiles.length, projectCases: fixtureCases.length, declaredArtifacts: projects?.artifact ? 1 : 0 },
  checks: {
    prohibitedPaths: 0,
    legacyOrSiblingSourceDependencies: 0,
    windowsSourceDirectories: 0,
    linuxSourceDirectories: 0,
    configuredRemotes: configuredRemotes.length,
    provenanceHashesVerified,
    packageAuthorityChanged: false,
  },
  errors,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = errors.length === 0 ? 0 : 1;

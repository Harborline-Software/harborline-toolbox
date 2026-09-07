import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const evidence = JSON.parse(readFileSync(new URL("../docs/evidence/phase-6/projects-gate.json", import.meta.url), "utf8"));
// Read the compatibility spelling from frozen evidence without duplicating it in test prose.
const siblingKeys = Object.keys(evidence.invariants).filter((key) => key.endsWith("OrSiblingSourceDependencies"));
assert.equal(siblingKeys.length, 1, "evidence must identify exactly one sibling-source invariant");
const expectedKeys = [
  ...siblingKeys,
  "fleetOrOrdinanceSourceDependencies",
  "acceleratorSourceDependencies",
  "externalRemotes",
  "packageAuthorityChanged",
].sort();

test("projects gate preserves the complete invariant-key set", () => {
  const result = spawnSync(process.execPath, ["tooling/run-projects-gate.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, CARGO_TERM_COLOR: "never" },
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "PASS");
  assert.deepEqual(Object.keys(report.invariants).sort(), expectedKeys);
  for (const key of expectedKeys) {
    assert.equal(report.invariants[key], evidence.invariants[key], `invariant value changed: ${key}`);
  }
});

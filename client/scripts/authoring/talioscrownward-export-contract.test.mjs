import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = path.resolve(clientRoot, "..");
const scripts = [
  "assets/pipeline/audit_repair_talioscrownward_geometry_gaps.py",
  "assets/pipeline/repair_talioscrownward_architectural_uvs.py",
  "assets/pipeline/apply_talioscrownward_surface_materials.py",
  "assets/pipeline/repair_talioscrownward_runtime_contracts.py",
  "assets/pipeline/dress_talioscrownward_castle_portals.py",
  "assets/pipeline/refit_talioscrownward_gate_approach.py",
  "assets/pipeline/repair_talioscrownward_arrival_sanity.py",
  "assets/pipeline/repair_talioscrownward_arrival_composition.py",
  "assets/pipeline/repair_talioscrownward_retired_gate_visibility.py",
  "assets/pipeline/repair_talioscrownward_remaining_arrival_artifacts.py",
];

test("Talios full-zone exporters cannot reintroduce hidden source geometry", () => {
  for (const relative of scripts) {
    const source = fs.readFileSync(path.join(repoRoot, relative), "utf8");
    assert.match(source, /use_visible\s*=\s*True/, `${relative} must export visible objects`);
    assert.doesNotMatch(source, /use_selection\s*=\s*True/, `${relative} selects retired geometry`);
  }
});

test("failed Crownward arrival houses cannot be regenerated", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "assets/pipeline/author_talios_crownward_identity.py"),
    "utf8",
  );
  assert.doesNotMatch(source, /house\("SaltwrightHouse"/);
  assert.doesNotMatch(source, /house\("LanternHouse"/);
  assert.doesNotMatch(source, /house\("CrownwardArchive"/);
  assert.doesNotMatch(source, /house\("TideglassLodge"/);
  assert.doesNotMatch(source, /box\("Archive\.EntryStoop"/);
  assert.doesNotMatch(source, /box\("Archive\.CivicPlaque"/);
});

test("detached mirrored service facade cannot be regenerated", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "assets/pipeline/mutate_qeynos2_to_talios_layout.py"),
    "utf8",
  );
  assert.doesNotMatch(source, /mirror_work_copy\([^\n]*MirroredServiceFacade/);
  assert.match(source, /len\(work\)\s*==\s*2/);
});

test("large Crownward architecture carries an explicit far-vista policy", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "assets/pipeline/repair_talioscrownward_arrival_composition.py"),
    "utf8",
  );
  assert.match(source, /persistent-large-space-vista/);
  assert.match(source, /required-large-space-vistas-persistent/);
  assert.match(source, /requiem_pvs_priority/);
  assert.doesNotMatch(source, /"GATEBAN_MDF"/);
  assert.doesNotMatch(source, /"CREST1_MDF"/);
  assert.doesNotMatch(source, /"CREST2_MDF"/);
});

test("retired legacy gate geometry is excluded by viewport visibility", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "assets/pipeline/author_talios_crownward_pass02_gate.py"),
    "utf8",
  );
  for (const name of [
    "CROWSIGN_MDF",
    "SNEDSIGN_MDF",
    "16SIGN_MDF",
    "11SIGN2_MDF",
    "CREST1_MDF",
    "CREST2_MDF",
    "GATEBAN_MDF",
  ]) {
    assert.match(source, new RegExp(`\\b${name}\\b`));
  }
  assert.match(source, /hide_viewport\s*=\s*True/);
  assert.match(source, /hide_set\(True\)/);
});

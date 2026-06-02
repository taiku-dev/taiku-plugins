// Validates community-plugins.json on every PR and flags plugins that declare
// `integrations` (third-party API brokering) for mandatory manual review.
//
// Usage: node scripts/validate.mjs <currentFile> [baseFile]
//   currentFile  the community-plugins.json in the PR head
//   baseFile     (optional) the same file from the PR base; when given, only
//                NEWLY ADDED plugin entries are integration-scanned
//
// Exit code is always 0 (schema errors fail loudly via process.exitCode=1).
// It writes `needs_review=true|false` and `schema_ok=true|false` to
// $GITHUB_OUTPUT so the workflow can label the PR.

import { readFileSync, appendFileSync } from "node:fs";

const [, , currentPath, basePath] = process.argv;

function out(key, val) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${val}\n`);
  }
}

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
}

let current;
try {
  current = JSON.parse(readFileSync(currentPath, "utf8"));
} catch (e) {
  fail(`community-plugins.json is not valid JSON: ${e.message}`);
  out("schema_ok", "false");
  out("needs_review", "false");
  process.exit();
}

// ---- schema ----
const REQUIRED = ["id", "name", "author", "description", "source"];
const plugins = Array.isArray(current.plugins) ? current.plugins : null;
if (!plugins) fail("top-level `plugins` must be an array");

const seen = new Set();
for (const [i, p] of (plugins ?? []).entries()) {
  const where = `plugins[${i}]${p?.id ? ` (${p.id})` : ""}`;
  for (const f of REQUIRED) {
    if (p?.[f] == null || p[f] === "") fail(`${where}: missing required field \`${f}\``);
  }
  if (typeof p?.id === "string") {
    if (seen.has(p.id)) fail(`${where}: duplicate id \`${p.id}\``);
    seen.add(p.id);
  }
  const src = p?.source;
  if (src?.type === "github") {
    if (!/^[^/\s]+\/[^/\s]+$/.test(src.repo ?? "")) {
      fail(`${where}: source.repo must be "owner/name", got ${JSON.stringify(src.repo)}`);
    }
  } else if (src?.type === "hosted") {
    if (!src.manifestUrl) fail(`${where}: hosted source needs a manifestUrl`);
  } else {
    fail(`${where}: source.type must be "github" or "hosted"`);
  }
}
out("schema_ok", process.exitCode ? "false" : "true");

// ---- which entries are new (only scan those for integrations) ----
let baseIds = null;
if (basePath) {
  try {
    const base = JSON.parse(readFileSync(basePath, "utf8"));
    baseIds = new Set((base.plugins ?? []).map((p) => p.id));
  } catch {
    baseIds = null; // base unreadable (e.g. new file) → scan everything
  }
}
const toScan = (plugins ?? []).filter(
  (p) => p?.source?.type === "github" && (!baseIds || !baseIds.has(p.id)),
);

// ---- fetch each new plugin's manifest, check for `integrations` ----
async function fetchManifest(repo) {
  for (const branch of ["main", "master"]) {
    const url = `https://raw.githubusercontent.com/${repo}/${branch}/manifest.json`;
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
    } catch {
      /* try next branch */
    }
  }
  return null;
}

const flagged = [];
for (const p of toScan) {
  const manifest = await fetchManifest(p.source.repo);
  if (manifest == null) {
    console.log(`• ${p.id}: manifest.json not reachable yet (${p.source.repo}) — reviewer should verify manually`);
    continue;
  }
  const ints = manifest.integrations;
  if (Array.isArray(ints) && ints.length > 0) {
    const toolkits = ints.map((e) => (typeof e === "string" ? e : e?.toolkit)).filter(Boolean);
    flagged.push(`${p.id} → integrations: ${toolkits.join(", ")}`);
  }
}

if (flagged.length) {
  console.log("\n⚠ Plugins declaring integrations (require manual review):");
  for (const f of flagged) console.log(`  - ${f}`);
}
out("needs_review", flagged.length ? "true" : "false");

if (process.exitCode) console.error("\nSchema validation failed — fix the errors above.");
else console.log("\n✓ Schema valid.");

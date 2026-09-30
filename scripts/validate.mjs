// Registry entries bind the complete reviewed release at an immutable commit.
// Usage: node scripts/validate.mjs <currentFile> [baseFile]
import { readFileSync, appendFileSync } from "node:fs";
import { createHash } from "node:crypto";

const [, , currentPath, basePath] = process.argv;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const digest = /^[0-9a-f]{64}$/;
const maxReleaseBytes = 24 * 1024 * 1024;
function out(key, value) {
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}
function fail(message) {
  console.error(`✗ ${message}`);
  process.exitCode = 1;
}
function read(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

async function bytes(url, maximum) {
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok || !response.body) throw new Error(`Could not fetch ${url}`);
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) throw new Error("Release exceeds the size limit");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
function filePath(path) {
  return (
    path.length <= 512 &&
    path
      .split("/")
      .every(
        (part) => /^[a-zA-Z0-9_.-]+$/.test(part) && ![".", ".."].includes(part),
      )
  );
}
async function review(entry) {
  const root = `https://raw.githubusercontent.com/${entry.source.repo}/${entry.source.revision}/`;
  const descriptor = await bytes(root + "release.json", 1024 * 1024);
  if (hash(descriptor) !== entry.release.sha256)
    throw new Error("Release descriptor changed since review");
  const release = JSON.parse(descriptor.toString("utf8"));
  if (
    release?.format !== 1 ||
    release.manifest?.id !== entry.id ||
    !release.files ||
    typeof release.files !== "object" ||
    Array.isArray(release.files) ||
    Object.keys(release.files).length > 256
  )
    throw new Error("Invalid release descriptor or manifest id");
  let size = descriptor.byteLength;
  for (const [path, file] of Object.entries(release.files)) {
    if (
      !filePath(path) ||
      !file ||
      !digest.test(file.sha256) ||
      !/^[a-z]+\/[a-zA-Z0-9.+-]+$/.test(file.type)
    )
      throw new Error(`Invalid release file: ${path}`);
    const content = await bytes(root + path, maxReleaseBytes - size);
    size += content.byteLength;
    if (hash(content) !== file.sha256)
      throw new Error(`Release file changed since review: ${path}`);
  }
  for (const panel of release.manifest.panels ?? []) {
    if (
      panel.url ||
      (panel.htmlUrl && !Object.hasOwn(release.files, panel.htmlUrl))
    )
      throw new Error("Panel HTML must be included in the reviewed release");
  }
  const integrations = release.manifest.integrations;
  if (Array.isArray(integrations) && integrations.length) {
    const toolkits = integrations
      .map((i) => (typeof i === "string" ? i : i?.toolkit))
      .filter(Boolean);
    console.log(
      `• ${entry.id} → integrations: ${toolkits.join(", ")} (extra permission review required)`,
    );
  }
  console.log(
    `✓ ${entry.id}: reviewed digest and ${Object.keys(release.files).length} files verified at ${entry.source.revision}`,
  );
}

let current;
try {
  current = read(currentPath);
} catch (error) {
  fail(`community-plugins.json is not valid JSON: ${error.message}`);
}
const plugins = Array.isArray(current?.plugins) ? current.plugins : null;
if (!plugins) fail("top-level plugins must be an array");
const seen = new Set();
for (const [index, entry] of (plugins ?? []).entries()) {
  const where = `plugins[${index}]`;
  for (const field of ["id", "name", "author", "description"]) {
    if (typeof entry?.[field] !== "string" || !entry[field].trim())
      fail(`${where}: missing ${field}`);
  }
  if (seen.has(entry?.id)) fail(`${where}: duplicate id`);
  seen.add(entry?.id);
  // Community sources are public GitHub repositories, as CONTRIBUTING defines.
  // No arbitrary hosted URL can make the CI runner request internal services.
  if (
    entry?.source?.type !== "github" ||
    !/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(entry.source.repo ?? "")
  )
    fail(`${where}: source must be a GitHub owner/repo`);
  if (!/^[0-9a-f]{40}$/.test(entry?.source?.revision ?? ""))
    fail(`${where}: source.revision must be a full commit SHA`);
  if (!digest.test(entry?.release?.sha256 ?? ""))
    fail(`${where}: release.sha256 must bind the reviewed release.json`);
}
let base = new Map();
if (basePath) {
  try {
    base = new Map(
      read(basePath).plugins.map((entry) => [entry.id, JSON.stringify(entry)]),
    );
  } catch {
    /* Fail closed: scan all entries when the base cannot be read. */
  }
}
const changed = (plugins ?? []).filter(
  (entry) => base.get(entry?.id) !== JSON.stringify(entry),
);
out("needs_review", changed.length ? "true" : "false");
if (!process.exitCode) {
  for (const entry of changed) {
    try {
      await review(entry);
    } catch (error) {
      fail(`${entry.id}: ${error.message}`);
    }
  }
}
out("schema_ok", process.exitCode ? "false" : "true");
if (!process.exitCode)
  console.log(
    "✓ Registry valid; maintainers must review the pinned code and files before merging.",
  );

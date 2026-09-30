import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
const hash = (s) => createHash("sha256").update(s).digest("hex");
function fixture() {
  const file = "<script>reviewed()</script>";
  const descriptor = JSON.stringify({
    format: 1,
    manifest: { id: "test.reviewed", integrations: ["github"] },
    files: { "panel.html": { sha256: hash(file), type: "text/html" } },
  });
  const entry = {
    id: "test.reviewed",
    name: "Reviewed",
    author: "test",
    description: "Test",
    source: { type: "github", repo: "test/plugin", revision: "a".repeat(40) },
    release: { sha256: hash(descriptor) },
  };
  const base = `https://raw.githubusercontent.com/test/plugin/${entry.source.revision}/`;
  return {
    entry,
    resources: {
      [base + "release.json"]: descriptor,
      [base + "panel.html"]: file,
    },
    base,
  };
}
function run(entry, resources = {}, base = []) {
  const dir = mkdtempSync(join(tmpdir(), "registry-review-"));
  dirs.push(dir);
  writeFileSync(
    join(dir, "current.json"),
    JSON.stringify({ plugins: [entry] }),
  );
  writeFileSync(join(dir, "base.json"), JSON.stringify({ plugins: base }));
  writeFileSync(
    join(dir, "fetch.mjs"),
    `import { appendFileSync } from 'node:fs'; const resources = ${JSON.stringify(resources)}; globalThis.fetch = async (url) => { appendFileSync(${JSON.stringify(join(dir, "trace"))}, String(url)+'\\n'); return Object.hasOwn(resources, String(url)) ? new Response(resources[url]) : new Response('', {status:404}); };`,
  );
  writeFileSync(join(dir, "trace"), "");
  writeFileSync(join(dir, "outputs"), "");
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      join(dir, "fetch.mjs"),
      resolve("scripts/validate.mjs"),
      join(dir, "current.json"),
      join(dir, "base.json"),
    ],
    {
      encoding: "utf8",
      env: { ...process.env, GITHUB_OUTPUT: join(dir, "outputs") },
    },
  );
  return {
    ...result,
    outputs: readFileSync(join(dir, "outputs"), "utf8"),
    trace: readFileSync(join(dir, "trace"), "utf8"),
  };
}

test("requires full reviewed commit and descriptor digest", () => {
  for (const revision of [undefined, "main", "v1.0", "a".repeat(7)]) {
    const f = fixture();
    f.entry.source.revision = revision;
    assert.equal(run(f.entry).status, 1, String(revision));
  }
  const f = fixture();
  delete f.entry.release;
  assert.equal(run(f.entry).status, 1);
});
test("scans changed existing releases at the pinned commit and requires manual review", () => {
  const f = fixture();
  const previous = structuredClone(f.entry);
  previous.source.revision = "b".repeat(40);
  const result = run(f.entry, f.resources, [previous]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.trace,
    new RegExp(`${f.entry.source.revision}/release.json`),
  );
  assert.doesNotMatch(result.trace, /\/(main|master)\//);
  assert.match(result.outputs, /needs_review=true/);
  assert.match(result.stdout, /integrations: github/);
});
test("refuses descriptor bytes changed after review", () => {
  const f = fixture();
  f.resources[f.base + "release.json"] += " ";
  assert.equal(run(f.entry, f.resources).status, 1);
});
test("refuses changed or missing interface files", () => {
  const f = fixture();
  f.resources[f.base + "panel.html"] = "changed";
  assert.equal(run(f.entry, f.resources).status, 1);
  delete f.resources[f.base + "panel.html"];
  assert.equal(run(f.entry, f.resources).status, 1);
});
test("refuses hosted community releases and traversal paths", () => {
  const f = fixture();
  f.entry.source = {
    type: "hosted",
    manifestUrl: "https://example.test/manifest.json",
  };
  assert.equal(run(f.entry).status, 1);
  const t = fixture();
  const descriptor = JSON.parse(t.resources[t.base + "release.json"]);
  descriptor.files["../escape.js"] = descriptor.files["panel.html"];
  t.resources[t.base + "release.json"] = JSON.stringify(descriptor);
  t.entry.release.sha256 = hash(t.resources[t.base + "release.json"]);
  assert.equal(run(t.entry, t.resources).status, 1);
});

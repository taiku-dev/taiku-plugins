# Contributing a plugin

taiku's community registry is curated like Obsidian's: **anyone can open a PR,
and a maintainer reviews and merges it.** Merging is the approval step — only
maintainers can merge, so nothing ships unreviewed.

## 1. Build and host your plugin

Your plugin lives in **your own** public GitHub repo with a `manifest.json` at
its root. If you're starting fresh, copy a folder from
[`taiku-dev/taiku-plugin-examples`](https://github.com/taiku-dev/taiku-plugin-examples)
(or the `blank-static` template) and add `@taiku/plugin-sdk` for typed helpers.

## 2. Add one entry to `community-plugins.json`

Open a PR that appends a single object to the `plugins` array:

```jsonc
{
  "id": "yourname.cool-plugin", // globally unique, reverse-DNS-ish
  "name": "Cool Plugin",
  "author": "yourname",
  "description": "One sentence on what it does.",
  "tagline": "Short hook (optional)",
  "categories": ["devtools"], // from the top-level categories list
  "source": {
    "type": "github",
    "repo": "yourname/cool-plugin",
    "revision": "<full 40-character commit SHA>",
  },
  "release": { "sha256": "<SHA-256 of release.json>" },
  "license": "MIT",
  "keywords": ["taiku", "..."],
  // vetStatus is set by maintainers during review — do not set it yourself.
}
```

- `source.type` is **`github`** with `repo: "owner/name"` and a full commit SHA.
  Commit the deployable files and `release.json` at that revision. Branches,
  tags, and abbreviated SHAs are refused.
- Generate `release.json` with the [release packaging tool](https://github.com/taiku-dev/taiku/blob/main/packages/plugin-sdk/README.md#marketplace-releases).
  It contains the manifest and hashes of every included interface and asset file.
  Copy the printed descriptor digest into `release.sha256`.
- Keep `id` stable forever — it's how installs and updates are keyed.
- Don't set `vetStatus`; reviewers assign it.

## 3. Review

A maintainer reviews the manifest, all code and files at the pinned commit,
and the declared permissions, then merges. CI verifies the descriptor and file
hashes for new **and changed** entries and labels every release change
`needs-manual-review`. Download failures and digest mismatches fail the check.
CI verifies bytes; it does not decide whether code is safe.

### Plugins that use integrations

If your plugin's `manifest.json` declares **`integrations`** (it brokers
third-party API access — GitHub, Slack, SerpAPI, … — through taiku's Composio
bridge), CI labels the PR **`needs-manual-review`** and a maintainer must
manually approve it, regardless of anything else. This is intentional: an
integration plugin can act on a user's connected accounts, so it gets extra
scrutiny.

## Removing or updating a plugin

Open a PR editing or deleting your entry. Every code or asset update needs a
new reviewed commit and descriptor digest in this registry. Installed releases
stay fixed; users explicitly reinstall to choose a newer release.

Custom-URL installs in taiku remain a separate development workflow and can
change on reload. They are not marketplace-reviewed releases.

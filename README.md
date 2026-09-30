# taiku-plugins

The community plugin registry for [taiku](https://taiku.live). This repo holds
**`community-plugins.json`** — the list of community-submitted plugins that
appear in taiku's in-app plugin marketplace (**Browse** tab).

## How it works

- Each plugin lives in **its own GitHub repository** (with a `manifest.json`, `release.json`, and deployable files).
  This repo does **not** host plugin code — only the registry entry that points
  at a full reviewed commit and a digest covering the release descriptor and files.
- taiku's server fetches `community-plugins.json` from this repo, merges it with
  the built-in plugins, caches it, and serves it to the app. A merge to `main`
  publishes your plugin to everyone, typically within a few minutes.
- Want to build a plugin first? Start from
  [`taiku-dev/taiku-plugin-examples`](https://github.com/taiku-dev/taiku-plugin-examples)
  (example plugins + a `blank-static` template + the `@taiku/plugin-sdk`).

## Submitting a plugin

See [CONTRIBUTING.md](./CONTRIBUTING.md). In short: open a PR that adds one entry
to the `plugins` array in `community-plugins.json`. A maintainer reviews and
merges it.

> Every new or changed release requires maintainer review at its pinned commit.
> Plugins that request **integrations** receive extra permission review. CI
> verifies descriptor and file hashes and flags changed releases automatically.

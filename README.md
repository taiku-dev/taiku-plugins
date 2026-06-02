# taiku-plugins

The community plugin registry for [taiku](https://taiku.live). This repo holds
**`community-plugins.json`** — the list of community-submitted plugins that
appear in taiku's in-app plugin marketplace (**Browse** tab).

## How it works

- Each plugin lives in **its own GitHub repository** (with a `manifest.json`).
  This repo does **not** host plugin code — only the registry entry that points
  at your repo.
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

> Plugins that request **integrations** (broker third-party API access via
> Composio) always require manual review — CI flags them automatically.

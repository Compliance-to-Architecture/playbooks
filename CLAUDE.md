# Compliance-to-Architecture Playbooks — Repository Notes

This repository contains **documentation only** — operator playbooks,
agent prompt definitions, and worked-example scenarios. There is no
runtime code in this repo.

The engine source that used to live here was moved out to keep this
repo focused on documentation and to preserve a clean intellectual-
property separation between the Apache-2.0 framework spec (this
organisation) and the closed-source reference implementation (in the
private monorepo (not public)).

## Layout

- `agents/<slug>.md` — agent prompts (markdown, no code)
- `skills/<name>.md` — reusable skill descriptions (markdown, no code)
- `examples/<scenario>/` — worked-example READMEs + per-example
  `controls.json` mappings + sample `constitution.yaml` configs
- `docs/` — architectural notes, reference guides, decision records

## How to contribute

PRs welcome. Documentation only — no source code, no test runners,
no build pipelines. The `package.json` carries no dependencies and no
build/typecheck scripts.

Apache-2.0. The trademarks (Code Constitution™, Compliance-to-
Architecture Framework™, ReguNav™) are NOT licensed by the open
licence; see `TRADEMARKS.md` in the org `.github` repo.

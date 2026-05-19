<div align="center">

# Compliance-to-Architecture / playbooks

**Skill files + worked examples for building compliance-engine integrations against the Compliance-to-Architecture Framework™.**

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0) [![Status](https://img.shields.io/badge/status-public%20OSS-brightgreen.svg)](#) [![Spec](https://img.shields.io/badge/spec-v0.1-orange.svg)](#) [![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#) [![Examples](https://img.shields.io/badge/examples-marketplace--saas%20·%20deal--registry%20·%20payments-1F6FEB.svg)](examples/)

</div>

---

## What this repo contains

- `skills/` — reusable skill definitions for compliance-engine actions
- `examples/` — full worked examples (marketplace-saas, deal-registry, payments-sca) demonstrating how to wire your service into the framework

## Worked examples

| Example | Demonstrates |
| --- | --- |
| `examples/marketplace-saas/` | A multi-tenant SaaS marketplace mapping its controls to SOC 2 + ISO 27001 + GDPR |
| `examples/deal-registry/` | Channel-partner deal registration with audit-trail + WORM evidence |
| `examples/payments-sca/` | PSD2 Strong Customer Authentication enforced via policy-as-code |

## Skills

Each `skills/<name>.md` documents one reusable engine skill: input contract, side effects, evidence emitted, audit-trail row.

## How to add a playbook

Open a PR with a new directory under `examples/<your-example>/` containing a `README.md`, a `controls.json` (which framework controls the example demonstrates), and the worked code. Maintainers will review for Apache-2.0 license cleanliness + framework alignment.

---

## Sibling repos

| Repo | What |
| --- | --- |
| [`framework`](https://github.com/Compliance-to-Architecture/framework) | 25 framework dictionaries + crosswalks + policy-as-code compile targets |
| [`ontology`](https://github.com/Compliance-to-Architecture/ontology) | JSON-LD ontology + schemas + IaC examples |
| [`sector-packs`](https://github.com/Compliance-to-Architecture/sector-packs) | Maritime / legal / oil-and-gas vertical bundles |
| [`dictionaries`](https://github.com/Compliance-to-Architecture/dictionaries) | Canonical taxonomies (8 JSON dictionaries) |
| [`playbooks`](https://github.com/Compliance-to-Architecture/playbooks) | Skill files + worked examples |

## Provenance

Mirrored from the upstream [ReguNav/app](https://github.com/ReguNav/app) monorepo. Apache-2.0 contributions welcome — by contributing you agree your contribution is Apache-2.0.

[![Site](https://img.shields.io/badge/compliancetoarchitecture.com-→-1F6FEB.svg)](https://compliancetoarchitecture.com)

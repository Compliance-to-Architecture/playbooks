# Engine Principles

The IOF Code Engine is governed by **32 mandatory principles** that apply to every line of code, every deployment, every decision. These are not suggestions — they are engineering law.

## Foundational Principles

### 1. Codemap + mgrep First

Every session starts by rebuilding indexes and reviewing failure context. No blind coding.

### 2. RALPH Method (Read → Analyze → List → Plan → Hardcode-nothing)

The autonomous development loop. Never hardcode mock data. Always connect to real APIs.

### 3. TigerStyle Coding

- Functions ≤ 70 lines
- ≥ 2 assertions per function
- All loops have explicit bounds
- No recursion
- Variables at smallest scope
- Units in variable names
- Explicit error handling

### 4. Direct Action First

Fix problems directly. Don't create scripts/workflows for things you can do now.

## Zero Policies (Hard Guardrails)

### 5. Zero Mock Data

No hardcoded arrays, no mock data in production code. All data from real APIs.

### 6. Zero Duplication

No duplicate code, components, or functionality across the ecosystem.

### 7. Zero Redundancies

No redundant files, imports, or configurations.

### 8. Zero Competing Codes

One canonical implementation per feature. Never two implementations of the same thing.

### 9. Zero Orphan Code

No dead code, unused exports, unreferenced files. If not imported, delete it.

### 10. Zero Orphan Files

When creating new files, delete old ones they replace. File creation and deletion are atomic.

### 11. Zero Single Points of Failure (Zero-SPOF)

No single component failure may block the system. Every layer has redundancy.

### 12. Zero Cascade

No workflow chain reactions. Maximum chain depth is 2. One failure = one notification.

### 13. Zero Waste / Anti-Bloat

All cloud resources actively managed. ECR lifecycle policies, task definition hygiene, right-sizing.

### 14. Zero Technical Debt

Do it right the first time. No "we'll fix it later".

## Architecture Principles

### 15. Separation of Concerns (SoC)

Each module has one responsibility. One rail = one domain. One package = one capability.

### 16. Separation of Responsibilities (SoR)

Frontend does UI. Backend does logic. Database does storage. Infrastructure does deployment.

### 17. Single Source of Truth (SSOT)

One definition per type. One implementation per utility. One import path per consumer.

### 18. Rail Independence

Each rail is a self-contained module. No cross-rail dependencies.

### 19. Event-Driven

Use event envelopes for cross-rail communication. Never direct coupling.

### 20. Multi-Tenant

All data is tenant-scoped. RLS, key prefixes, scoped accounts.

## Compliance Principles

### 21. Compliance by Design

SOC2, GDPR, PSD2, ISO 27001, ISO 20022, AAOIFI, IFSB are engineering requirements.

### 22. Shariah Compliance

Every Islamic contract schema includes shariahGovernance, boardApproval, fatwahReference.

### 23. Audit Trail

Every API endpoint logs who/what/when/why in structured JSON.

### 24. Encryption Everywhere

TLS 1.3 in transit, AES-256 at rest. No plaintext secrets.

## Operational Principles

### 25. Production-Reporting Alignment

Reports must reflect actual production state. Verify before reporting success.

### 26. Never Repeat Mistakes

Every failure documented. Memory files checked before every task. Fingerprinted errors.

### 27. Structured Output

All agent communication uses structured JSON schemas. Errors are fingerprinted.

### 28. CLI + SDK + MCP First

Use official tools. Never raw HTTP when CLI/SDK/MCP is available.

### 29. Workflow Discipline

No email storms. No recursive triggers. Concurrency controls on all workflows.

### 30. Production Artifact Minimization

Multi-stage Docker builds. Runtime-only dependencies. Non-root users.

### 31. Port Authority

All ports reference PORTS.md as SSOT. No hardcoded ports.

### 32. Holistic Approach

No isolated fixes. Every change is systematic, methodic, cohesive, complete.

## How to Apply These Principles to a New Platform

When forking this engine for a new domain:

1. **Keep all Zero Policies** — They are universal engineering quality gates
2. **Keep TigerStyle** — Function limits, assertions, naming conventions
3. **Keep RALPH Method** — Autonomous development loop with real data
4. **Replace domain-specific principles** — Swap AAOIFI/IFSB for your domain's compliance
5. **Keep the workflow engine** — CI/CD/self-healing patterns are domain-agnostic
6. **Keep agent orchestration** — Rename agents for your domain but keep the pattern
7. **Keep structured output** — Machine-readable errors are universally valuable

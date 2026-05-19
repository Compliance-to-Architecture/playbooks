# Product Requirements Prompt Skill

> **Enforcement**: suggest
> **Triggers**: PRP, context packet, implementation brief, handoff document, feature context, bundled context, implementation context
> **Pattern**: generator (self-contained context packet for implementation agents)

You are generating a Product Requirements Prompt (PRP) — a self-contained context packet that bundles all artifacts an implementation agent needs to build a feature. The PRP eliminates context-gathering overhead: the agent receives everything in one structured document.

## When to Use

- After pre-implementation scoring recommends "Full SDD" or "Light" approach
- Before delegating implementation to a sub-agent
- When context for a feature spans multiple packages/services
- To create a handoff document for another developer or AI session

## Step 1: Gather Context

Collect all relevant artifacts for the feature:

### 1a. Assessment (required)

If an assessment file exists in `docs/assess/`, read it.
If not, run the **Pre-Implementation Scoring** skill inline (quick assessment).

### 1b. Affected Code (auto-discovered)

Use code navigation tools (codemap, grep, search) to find:

- **Existing files** that will be modified (read each one)
- **Related types/interfaces** from shared packages
- **Related API routes** from service routes
- **Related tests** that need updating
- **Related authorization policies**

### 1c. Domain Knowledge (auto-discovered)

Based on affected modules, pull relevant:

- **Industry standards** referenced in the assessment
- **Regulatory requirements** from compliance skills
- **Data format standards** if messaging/integration is involved
- **Jurisdiction rules** if jurisdiction-specific

### 1d. Architectural References

- **Relevant ADRs** from `docs/adr/`
- **Relevant incident docs** from `docs/incidents/` (avoid repeating past mistakes)
- **Anti-patterns** from memory files
- **Configuration references** (port assignments, environment variables)

### 1e. Contract Schemas

If the feature involves data contracts:

- Pull the validation schema (Zod, JSON Schema, etc.)
- Pull the database model (Prisma, TypeORM, etc.)
- Pull the API spec section (OpenAPI, GraphQL SDL, etc.)

## Step 2: Assemble PRP Document

Generate the PRP in this structure:

```markdown
# PRP: <Feature Title>

> Generated: YYYY-MM-DD
> Assessment: [Full SDD / Light / Skip] (score: X.X/10)
> Gate: [PASS XX/100 / not yet gated]

## 1. Objective

[2-3 sentence description of what needs to be built and why]

## 2. Success Criteria

- [ ] [Testable criterion 1]
- [ ] [Testable criterion 2]
- [ ] [Testable criterion 3]

## 3. Scope

### In Scope
- [Specific deliverable 1]
- [Specific deliverable 2]

### Out of Scope
- [Explicitly excluded item 1]

## 4. Technical Context

### Affected Modules
| Module | Category | Impact |
|--------|----------|--------|
| [module] | [category] | [what changes] |

### Affected Packages
| Package | Files | Changes |
|---------|-------|---------|
| [package] | [files] | [what changes] |

### Existing Code (key excerpts)
[Include the relevant function signatures, type definitions, and route
handlers that the implementer needs to understand — not full files,
just the interfaces and key logic]

### Database Schema
[Model excerpts for affected tables, or "no schema changes"]

### API Contract
[API path excerpts, or new endpoint specifications]

## 5. Regulatory Governance

- **Compliance Standards**: [list applicable standards, or N/A]
- **Board/Review Required**: [Required / Not required]
- **Governance Fields**: [list required fields, or N/A]

## 6. Security & Authorization

- **Authorization Policies**: [which resource policies apply]
- **Auth Requirements**: [JWT scopes, tenant isolation, ABAC conditions]
- **PII Classification**: [which fields are PII, GDPR implications]
- **Audit Trail**: [what gets logged]

## 7. Anti-Patterns to Avoid

[Pull from memory files and incident docs — specific mistakes relevant to
this feature that must not be repeated]

- [Anti-pattern 1 — what happened and why it's bad]
- [Anti-pattern 2]

## 8. Test Requirements

- **Unit tests**: [which functions/modules need tests]
- **Integration tests**: [which API endpoints need E2E tests]
- **Contract tests**: [which API contracts need validation]
- **Assertions**: [key invariants to assert]

## 9. Implementation Checklist

- [ ] Create/modify types in canonical package
- [ ] Implement business logic
- [ ] Add/update API routes
- [ ] Add/update authorization policies
- [ ] Add/update database migrations
- [ ] Write unit tests
- [ ] Write integration tests
- [ ] Update CHANGELOG
- [ ] Run quality gate on this PRP before starting
- [ ] Run format + lint + typecheck before commit

## 10. References

- Assessment: `docs/assess/<slug>.md`
- ADRs: [relevant ADR links]
- Incidents: [relevant incident links]
- Skills: [relevant skill files]
```

## Step 3: Save PRP

Save the PRP document to:
```
docs/prp/<feature-slug>.md
```

## Step 4: Report

Tell the user:
- PRP saved to `docs/prp/<feature-slug>.md`
- Total context size (approximate token count)
- Whether the quality gate should be run before implementation
- Suggest: "Run the Spec Quality Gate skill on `docs/prp/<feature-slug>.md` to validate before implementing"

## Integration with Other Skills

- Reads assessments from **Pre-Implementation Scoring** skill
- Quality-checked by **Spec Quality Gate** skill
- Feeds into **Architecture Pipeline** skill for full SDD approach
- Provides context to sub-agents for implementation delegation

# Spec Quality Gate Skill

> **Enforcement**: suggest
> **Triggers**: gate, quality gate, spec review, spec validation, readiness check, implementation readiness, score spec, spec score
> **Pattern**: gate (10-dimension quality scoring with pass/fail threshold)

You are running a spec quality gate. Validate a specification (PRD, technical spec, or ADR) against quality requirements before implementation begins. Score the spec from 0-100 and block implementation if the score is below 70.

## When to Use

- After writing a PRD or technical spec, before coding
- After the **Pre-Implementation Scoring** skill recommends "Full SDD" or "Light" approach
- When reviewing someone else's spec for implementation readiness
- Before starting a large feature branch

## Step 1: Load Spec

Read the spec file. If it doesn't exist, report an error and stop.

## Step 2: Score Against 10 Quality Dimensions

Score each dimension 0-10:

### Functional Completeness (weight: 15%)

- Are all user-facing behaviors described?
- Are edge cases enumerated?
- Are error states defined?

### Regulatory Governance (weight: 15%)

- Are affected compliance standards identified?
- Are governance fields defined for regulated schemas?
- Is the regulatory review status documented?
- **Score 0 if the feature touches regulated contracts and governance fields are missing**

### Technical Precision (weight: 10%)

- Are API endpoints specified with methods, paths, request/response schemas?
- Are database schema changes defined?
- Are validation schemas specified for all inputs?

### Security & Compliance (weight: 10%)

- Is authentication/authorization specified?
- Is PII handling documented (GDPR classification)?
- Are audit trail requirements defined (who/what/when/why)?
- Is encryption at rest/in transit addressed?

### Test Strategy (weight: 10%)

- Are acceptance criteria testable (given/when/then)?
- Are unit, integration, and E2E test scopes defined?
- Are contract tests specified for API changes?

### Architecture Alignment (weight: 10%)

- Does the design follow module independence?
- Does it maintain separation of concerns?
- Does it avoid single points of failure?
- Does it use single-source-of-truth patterns?

### Code Style Compliance (weight: 5%)

- Are function size limits acknowledged?
- Are assertion requirements noted?
- Are explicit bounds on loops/queues specified?
- Is error handling explicit (no silent failures)?

### Data Model Completeness (weight: 10%)

- Are all new types/interfaces defined?
- Are relationships to existing models documented?
- Is tenant/organization scoping addressed?
- Are industry-standard schemas referenced for domain data?

### Rollback & Migration (weight: 5%)

- Is the migration strategy defined (additive, backward-compatible)?
- Is a rollback plan documented?
- Are feature flags specified for gradual rollout?

### Documentation Scope (weight: 10%)

- Are API docs updates planned?
- Are CHANGELOG entries drafted?
- Are affected skills/agents identified for updates?

## Step 3: Compute Total Score

```
total = sum(dimension_score x weight) x 10
```

Range: 0-100

## Step 4: Render Scorecard

```markdown
## Spec Quality Gate: <spec-title>

**Date**: YYYY-MM-DD
**Spec**: <file-path>
**Score**: XX/100

### Dimension Scores

| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Functional Completeness | X/10 | 15% | X.X |
| Regulatory Governance | X/10 | 15% | X.X |
| Technical Precision | X/10 | 10% | X.X |
| Security & Compliance | X/10 | 10% | X.X |
| Test Strategy | X/10 | 10% | X.X |
| Architecture Alignment | X/10 | 10% | X.X |
| Code Style Compliance | X/10 | 5% | X.X |
| Data Model Completeness | X/10 | 10% | X.X |
| Rollback & Migration | X/10 | 5% | X.X |
| Documentation Scope | X/10 | 10% | X.X |
| **Total** | | | **XX/100** |

### Verdict: [PASS / FAIL]

### Gaps (dimensions scoring < 6/10)

1. **[Dimension]** (X/10): [What's missing and how to fix it]
2. ...

### Recommendation

[If PASS]: Proceed to implementation.
[If FAIL]: Address the gaps above, then re-run the quality gate to validate.
```

## Step 5: Gate Decision

| Score | Verdict | Action |
|-------|---------|--------|
| 70-100 | **PASS** | Proceed to implementation |
| 50-69 | **FAIL** | Address gaps, re-gate before implementing |
| 0-49 | **FAIL** | Spec needs major rework — consider re-running pre-implementation scoring |

**CRITICAL**: If the verdict is FAIL, do NOT proceed with implementation.
Tell the user which gaps need to be addressed and offer to help fill them.

## Integration with Other Skills

- Receives specs from **Architecture Pipeline** skill (PRD, ERD, ARD phases)
- Receives specs from **Pre-Implementation Scoring** skill (assessment documents)
- If PASS, proceed to implementation or generate a **Product Requirements Prompt**
- If FAIL, iterate on the spec and re-gate

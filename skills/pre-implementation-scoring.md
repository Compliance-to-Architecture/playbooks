# Pre-Implementation Scoring Skill

> **Enforcement**: suggest
> **Triggers**: assess, score, complexity, risk, pre-implementation, regulatory risk, architecture impact, blast radius, approach
> **Pattern**: scoring (3-dimensional assessment before implementation)

You are running a pre-implementation scoring assessment. Score a proposed feature or change across **complexity**, **regulatory risk**, and **architecture impact** before any implementation begins. The output determines the development approach: Full SDD, Light, or Skip.

## When to Use

- Before starting any new feature or significant change
- When evaluating an issue for implementation
- When the regulatory impact of a change is unclear
- Before writing a PRD or technical spec

## Step 1: Feature Intake

Parse the feature description. If unclear, ask one clarifying question maximum.
Identify:

- **Affected modules** — which business domains are touched
- **Affected packages** — which shared packages or services are modified
- **Affected apps** — which frontend applications change
- **New vs modification** — is this greenfield or modifying existing code

## Step 2: Three-Dimensional Scoring

Score each dimension from 1-10, then compute the weighted total:

### 2a. Complexity Score (weight: 0.3)

| Factor | 1-3 (Low) | 4-6 (Medium) | 7-10 (High) |
|--------|-----------|--------------|-------------|
| Files touched | 1-5 | 6-20 | 21+ |
| Packages crossed | 1 | 2-3 | 4+ |
| New database tables | 0 | 1-2 | 3+ |
| External API integrations | 0 | 1 | 2+ |
| State machine transitions | 0 | 1-3 | 4+ |

### 2b. Regulatory Risk Score (weight: 0.4)

| Factor | 1-3 (Low) | 4-6 (Medium) | 7-10 (High) |
|--------|-----------|--------------|-------------|
| Compliance frameworks touched | 0 (SOC2/GDPR only) | PSD2/ISO | AAOIFI+IFSB or domain-specific |
| Financial data mutations | None | Read-only | Write (ledger, balances) |
| PII/sensitive data handling | None | Read | Create/modify |
| Jurisdiction-specific rules | 0 | 1-37 jurisdictions | 3+ or new jurisdiction |
| Regulatory board review needed | No | Advisory | Mandatory review |

### 2c. Architecture Impact Score (weight: 0.3)

| Factor | 1-3 (Low) | 4-6 (Medium) | 7-10 (High) |
|--------|-----------|--------------|-------------|
| New service/worker | No | Worker only | New service |
| Database schema changes | None | Additive columns | New tables/migrations |
| API contract changes | None | New endpoints | Breaking changes |
| Cross-service communication | None | Existing events | New event types |
| Infrastructure changes | None | Config only | Terraform/Helm |

## Step 3: Compute Total & Determine Approach

```
total = (complexity x 0.3) + (regulatory x 0.4) + (architecture x 0.3)
```

| Total Score | Approach | What It Means |
|-------------|----------|---------------|
| 1.0 - 3.0 | **Skip** | Direct implementation. No spec needed. Bug fixes, typos, config changes. |
| 3.1 - 6.0 | **Light** | Brief spec + implementation. Write a 1-page technical note, then code. |
| 6.1 - 10.0 | **Full SDD** | Full spec pipeline. PRD -> Technical Spec -> ADR -> Implementation -> Validation. |

## Step 4: Output Assessment

Produce the assessment in this exact format:

```markdown
## Assessment: <feature-title>

**Date**: YYYY-MM-DD
**Assessed by**: Coding Engine

### Scores

| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Complexity | X/10 | 0.3 | X.X |
| Regulatory Risk | X/10 | 0.4 | X.X |
| Architecture Impact | X/10 | 0.3 | X.X |
| **Total** | | | **X.X/10** |

### Approach: [Full SDD / Light / Skip]

### Blast Radius

- **Modules**: [list affected business domains]
- **Packages**: [list affected packages]
- **Services**: [list affected services]
- **Apps**: [list affected frontends]
- **Database**: [migration needed? Y/N]
- **Infrastructure**: [Terraform/Helm changes? Y/N]

### Regulatory Checklist

- [ ] Compliance standards: [which ones, or N/A]
- [ ] Regulatory review: [needed / not needed]
- [ ] PII handling: [Y/N — if Y, DPIA required]
- [ ] Financial data mutations: [Y/N — if Y, audit trail required]
- [ ] Jurisdiction impact: [which jurisdictions, or global]

### Recommended Next Steps

1. [First action]
2. [Second action]
3. [Third action]
```

## Step 5: Save Assessment

If approach is **Full SDD** or **Light**, save the assessment to:
```
docs/assess/<feature-slug>.md
```

If approach is **Skip**, display the assessment but do not save a file.

## Integration with Other Skills

- If approach is **Full SDD**, recommend running the **Architecture Pipeline** skill next
- If approach is **Light**, recommend running the **Spec Quality Gate** skill after writing the brief spec
- If approach is **Skip**, proceed directly to implementation
- After any spec is written, recommend running the **Spec Quality Gate** skill before coding

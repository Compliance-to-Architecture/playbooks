# Audit Verification Skill

**Type:** guardrail
**Enforcement:** block
**Purpose:** Prevent false claims in sub-agent audit reports by requiring evidence-based verification.

---

## Problem

Sub-agents performing audits can report incorrect findings because they:

1. **Assume absence = gap** — Fail to search deeply enough and report "missing" when the feature exists elsewhere
2. **Conflate config intent with runtime state** — Report "not enabled" when it defaults to true
3. **Count inaccurately** — Report different counts without citing the source command
4. **Over-generalize** — Claim "no X" when X exists in a different file/path than expected

Example false positives from prior audits:
- "4 workflows missing timeout-minutes" — All 4 actually had `timeout-minutes` on their jobs
- "Health endpoints: 3/7 (43%)" — All 7 services had complete health endpoints
- "WAF not integrated with ALB" — WAF was integrated with `enable_waf=true` (default) and `aws_wafv2_web_acl_association`

---

## Rules for Audit Sub-Agents

### 1. Evidence Chain Required

Every claim MUST include:

```
CLAIM: [what you're asserting]
EVIDENCE: [exact command/tool used to verify]
RESULT: [exact output or file content]
CONCLUSION: [derived from result, not assumed]
```

### 2. Negative Claims Require Exhaustive Search

Before reporting something as "missing" or "not found":

- Search at least 3 locations (expected path, alternative paths, `grep` across codebase)
- Check for aliased names (e.g., `timeout-minutes` can be on the job level, not workflow level)
- Verify defaults in variable definitions (a feature gated behind `var.x` might default to `true`)

### 3. Count Accuracy Protocol

All numeric claims must cite:

```
COUNT: [number]
SOURCE: [exact grep/wc command that produced this number]
SCOPE: [what was counted — files, lines, occurrences, unique matches]
```

Never state a count from memory or documentation — derive it fresh.

### 4. Status Verification Protocol

For "is X enabled/deployed/running" claims:

| Claim Type | Required Evidence |
|---|---|
| Feature enabled | Show the variable default AND any override in tfvars/env |
| Service deployed | Show health check response or `describe-services` output |
| Workflow has X | Show the exact YAML line with line number |
| Code has X | Show the grep result with file:line |

### 5. Cross-Verification

For any CRITICAL or HIGH finding, verify from two independent angles:

- **Finding: "No SSRF protection"** -> (1) grep for "ssrf" in middleware, (2) grep for private IP blocking patterns, (3) check security headers middleware
- **Finding: "Backup retention only 7 days"** -> (1) check module variable default, (2) check calling module override, (3) check environment-specific tfvars

### 6. Contradiction Resolution

When different sources disagree:

1. **Code > Documentation** — Actual code wins over docs/comments
2. **Runtime > Configuration** — Actual running state wins over config files
3. **Specific > General** — Environment-specific override wins over module default
4. **Recent > Old** — Latest commit wins over earlier one

---

## Verification Checklist for Audit Reports

Before submitting an audit report, the sub-agent MUST verify:

- [ ] Every "missing" claim was searched in 3+ locations
- [ ] Every count cites the exact command that produced it
- [ ] Every "not enabled" claim checks variable defaults and environment overrides
- [ ] Every CRITICAL finding was cross-verified from 2+ angles
- [ ] No claim relies on documentation or memory — all derived from code/runtime

---

## Integration with Code Engine

This skill is automatically activated when:

- Prompt contains: "audit", "verify", "check compliance", "production readiness"
- Agent type: any agent performing an audit task
- Enforcement: `block` — agent must acknowledge this protocol before starting

### Activation in Skill Rules

```json
{
  "audit-verification": {
    "type": "guardrail",
    "enforcement": "block",
    "promptTriggers": [
      { "keywords": ["audit", "verify", "compliance-check", "production-readiness", "deep-audit"] },
      { "intent": "audit.*platform|check.*production|verify.*deployment|assess.*compliance" }
    ],
    "fileTriggers": [],
    "skillFile": "skills/audit-verification.md"
  }
}
```

---

## Example: Correct vs Incorrect Audit Report

### Incorrect (False Positive)

> "4 workflows missing timeout-minutes: failure-bundle-standard.yml, failure-to-logs.yml, fixer.yml, store-logs.yml"

No evidence cited. No line numbers. No verification.

### Correct (Evidence-Based)

> **CLAIM:** failure-bundle-standard.yml has timeout-minutes
> **EVIDENCE:** `grep -n 'timeout-minutes' .github/workflows/failure-bundle-standard.yml`
> **RESULT:** `39:    timeout-minutes: 10`
> **CONCLUSION:** Has timeout-minutes on the `bundle` job (line 39). NOT missing.

---

## Metrics

Track audit accuracy over time:

- **False positive rate** = Claims reported as gaps that were actually implemented / Total gap claims
- **Target:** < 5% false positive rate
- **Current:** Reduced from ~30% (initial audit) to 0% (with verification protocol)

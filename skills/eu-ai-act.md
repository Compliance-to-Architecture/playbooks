# EU AI Act Compliance Skill

> **Enforcement:** block (on any AI-affecting rail or agent feature)
> **Scope:** AI system inventory, Annex III classification, conformity assessment, documentation
> **Deadline:** 2 August 2026 (full high-risk obligations)

## Purpose

This skill ensures IOF complies with the EU AI Act (Regulation 2024/1689) across all AI-using components: coding engines, structured output pipelines, agent orchestration, and any rail that uses AI for decision-making affecting natural persons.

## When to Activate

- Any change to `apps/code-engine/`
- Any change to rails that use AI for credit, underwriting, or risk decisions
- Any change to structured output or agent orchestration logic
- Any PR touching `packages/ai-core/` or `packages/compliance-core/`
- When creating new AI-powered features or endpoints
- When deploying AI systems to production

## EU AI Act Risk Classification for IOF

### High-Risk AI Systems (Annex III)

| IOF Component | Classification | EU AI Act Basis | Deadline |
|---|---|---|---|
| Murabaha/Ijarah financing eligibility | **High Risk** | Annex III §5(b): creditworthiness | Aug 2026 |
| Takaful underwriting AI | **High Risk** | Annex III §5(a): insurance risk/pricing | Aug 2026 |
| Qard Hasan eligibility scoring | **High Risk** | Annex III §5(b): creditworthiness | Aug 2026 |
| AML risk profiling | **High Risk** | Annex III §5(d): fraud detection | Aug 2026 |
| KYC automated decisions | **High Risk** | Annex III §5(c): identity verification | Aug 2026 |

### GPAI Model Obligations (Already Active — Aug 2025)

| IOF Component | Classification | Obligation |
|---|---|---|
| Coding engine (Claude) | GPAI deployer | Document intended use, maintain human oversight |
| Structured output pipeline | GPAI deployer | Validate outputs, log usage |
| Agent orchestration | GPAI deployer | Human-in-the-loop for regulated decisions |

### Limited/Minimal Risk

| IOF Component | Classification | Obligation |
|---|---|---|
| Customer chatbots | Limited Risk | Transparency: disclose AI interaction |
| Halal screening filters | Minimal Risk | None (rule-based, no material impact) |
| Code formatting/linting | Minimal Risk | None (developer tooling) |

## Compliance Requirements Checklist

### 1. Risk Management System (Article 9)

```
[ ] Identify all AI systems across 89 rails
[ ] Classify each by Annex III category
[ ] Document risk mitigation measures for each high-risk system
[ ] Establish continuous monitoring and update cycle
[ ] Assign risk management owner per system
```

### 2. Data Governance (Article 10)

```
[ ] Document training data sources for any fine-tuned models
[ ] Ensure representative data for credit/underwriting decisions
[ ] Track data provenance for all AI inputs
[ ] Implement data quality metrics and thresholds
```

### 3. Technical Documentation (Article 11)

```
[ ] System description and intended purpose
[ ] Development process and design choices
[ ] Monitoring, functioning, and control mechanisms
[ ] Risk management documentation
[ ] Changes log and version history
```

### 4. Human Oversight (Article 14)

```
[ ] No fully automated credit/underwriting decisions
[ ] Human review mechanism for high-risk outputs
[ ] Override capability for all AI decisions
[ ] Audit trail of human interventions
[ ] Training for human overseers
```

### 5. Accuracy, Robustness, Cybersecurity (Article 15)

```
[ ] Accuracy metrics documented per system
[ ] Adversarial testing (promptfoo, garak)
[ ] Cybersecurity measures for AI pipelines
[ ] Bias testing (AI Fairness 360)
[ ] Hallucination testing (HaluEval)
```

### 6. Transparency (Article 13)

```
[ ] Users informed when interacting with AI
[ ] Decision explanations for credit/underwriting
[ ] AI system capabilities and limitations documented
[ ] Contact information for inquiries
```

### 7. Conformity Assessment (Article 43)

```
[ ] Technical documentation finalized
[ ] Quality management system in place
[ ] EU AI Office database registration
[ ] CE marking (where applicable)
[ ] Post-market monitoring plan
```

### 8. Incident Reporting (Article 62)

```
[ ] AI incident detection pipeline
[ ] 15-day reporting timeline to authorities
[ ] Root cause analysis process
[ ] Integration with IOF failure inbox
```

## Integration with IOF Architecture

### AI System Registry

Maintain a machine-readable registry at `config/ai-systems/registry.json`:

```json
{
  "systems": [
    {
      "id": "murabaha-eligibility-ai",
      "rail": "MURABAHA",
      "classification": "high-risk",
      "annexCategory": "5b",
      "gpaiProvider": "anthropic",
      "gpaiModel": "claude-sonnet-4-20250514",
      "humanOversight": "shariah-board-review",
      "lastAssessment": "2026-03-31",
      "conformityStatus": "in-progress",
      "riskOwner": "compliance-team"
    }
  ]
}
```

### Coding Engine Integration

Both coding engines MUST:

1. **Log all AI invocations** with structured metadata (model, purpose, input hash, output hash)
2. **Tag outputs** that feed into regulated decisions
3. **Enforce human review** before any AI output affects credit, underwriting, or AML decisions
4. **Run promptfoo** red-teaming on every PR touching AI-using code
5. **Generate compliance artifacts** as part of the CI pipeline

### Evidence Pack Generation

On every deployment touching AI systems, generate:
- AI system inventory (from registry.json)
- Risk assessment summary
- Human oversight documentation
- Accuracy and bias test results
- Incident log excerpt

## Tools and Dependencies

| Tool | Purpose | Install |
|---|---|---|
| **promptfoo** | LLM red-teaming, EU AI Act evidence | `npm install -g promptfoo` |
| **llm-guard** | PII detection, prompt injection, GDPR | `pip install llm-guard` |
| **AI Fairness 360** | Bias detection for credit/underwriting | `pip install aif360` |

## Penalty Exposure

| Violation | Maximum Penalty |
|---|---|
| Prohibited AI practices | EUR 35M or 7% global turnover |
| High-risk non-compliance | EUR 15M or 3% global turnover |
| Misleading info to authorities | EUR 7.5M or 1% global turnover |

## References

- [EU AI Act Full Text](https://artificialintelligenceact.eu/)
- [Annex III High-Risk Systems](https://artificialintelligenceact.eu/annex/3/)
- [EBA AI Act Implications for Banking](https://www.eba.europa.eu/sites/default/files/2025-11/d8b999ce-a1d9-4964-9606-971bbc2aaf89/AI%20Act%20implications%20for%20the%20EU%20banking%20sector.pdf)
- [GPAI Guidelines](https://digital-strategy.ec.europa.eu/en/policies/guidelines-gpai-providers)
- [EU AI Act Timeline](https://trilateralresearch.com/responsible-ai/eu-ai-act-implementation-timeline-mapping-your-models-to-the-new-risk-tiers)

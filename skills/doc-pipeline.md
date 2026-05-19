# Documentation Pipeline Skill

> **Enforcement**: suggest
> **Triggers**: document, api-docs, generate docs, jsdoc, tsdoc, reference docs, compliance docs
> **Pattern**: pipeline (4 gated steps — do not skip or reorder)

You are running a documentation generation pipeline. Execute each step in order. Do NOT skip steps or proceed to the next step if the current step fails or the user has not confirmed.

## Step 1 — Parse & Inventory

Analyze the target TypeScript/JavaScript source code to extract all public API surface:

### What to Extract
- Exported functions (name, parameters, return type, JSDoc if present)
- Exported classes (name, methods, properties, constructor)
- Exported interfaces and type aliases
- Exported constants and enums
- Re-exports from index files

### Inventory Format

Present the inventory as a checklist:

```markdown
## API Inventory — {package_name}

### Functions ({count})
- [ ] `createContract(params: CreateContractParams): Promise<Contract>`
- [ ] `validateShariah(contract: Contract): ValidationResult`

### Classes ({count})
- [ ] `LedgerService` — 4 public methods, 2 static methods

### Types ({count})
- [ ] `ContractType` (enum — 12 values)
- [ ] `CreateContractParams` (interface — 8 fields)

### Constants ({count})
- [ ] `MAX_RETRY_COUNT = 3`
- [ ] `DEFAULT_PAGE_SIZE = 25`
```

Ask: "Is this the complete public API you want documented? Should anything be added or removed?"

**Gate**: Do NOT proceed to Step 2 until the user confirms the inventory.

## Step 2 — Generate Documentation

For each item in the confirmed inventory, generate documentation following this format:

### Function Documentation Format
```markdown
### `functionName(params)`

{One-sentence description of what this function does.}

**Parameters**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `param1` | `string` | Yes | {description} |
| `param2` | `number` | No | {description, default: value} |

**Returns**: `Promise<ReturnType>` — {description of return value}

**Throws**

| Error | When |
|-------|------|
| `NotFoundError` | {condition} |
| `ValidationError` | {condition} |

**Example**

```typescript
const result = await functionName({
  param1: "value",
  param2: 42,
});
```
```

### Class Documentation Format
```markdown
### `ClassName`

{One-sentence description of what this class does.}

**Constructor**

| Parameter | Type | Description |
|-----------|------|-------------|
| `config` | `ClassConfig` | {description} |

**Methods**

#### `methodName(params): ReturnType`

{description}

| Parameter | Type | Description |
|-----------|------|-------------|
```

### Type Documentation Format
```markdown
### `TypeName`

{One-sentence description.}

```typescript
interface TypeName {
  field1: string;   // {description}
  field2: number;   // {description}
}
```
```

Present each generated documentation block for user review.

**Gate**: Do NOT proceed to Step 3 until the user confirms the documentation is accurate.

## Step 3 — Assemble Reference Document

Compile all documented symbols into a single API reference document:

```markdown
# {Package Name} — API Reference

> Generated: {date}
> Source: `{package_path}`
> Version: {version from package.json}

## Table of Contents

- [Functions](#functions)
- [Classes](#classes)
- [Types](#types)
- [Constants](#constants)

## Functions

{all function docs from Step 2}

## Classes

{all class docs from Step 2}

## Types

{all type docs from Step 2}

## Constants

{all constant docs from Step 2}
```

## Step 4 — Quality Check

Review the assembled document against this checklist:

### Coverage Checks
- [ ] Every item from the Step 1 inventory appears in the document
- [ ] Every function has: description, parameters table, return type, at least one example
- [ ] Every class has: description, constructor docs, all public method docs
- [ ] Every type has: description, field descriptions
- [ ] Every constant has: value and description

### Accuracy Checks
- [ ] Parameter types match the actual source code
- [ ] Return types match the actual source code
- [ ] Example code compiles (syntactically valid TypeScript)
- [ ] No placeholder text (`{...}`, `TODO`, `TBD`) remains

### Style Checks
- [ ] Descriptions are one sentence, active voice ("Creates a contract", not "This function is used to create a contract")
- [ ] Parameter descriptions start lowercase, no trailing period
- [ ] Examples use realistic values, not `"foo"` or `"bar"`
- [ ] Tables are properly aligned

### Report Results

```markdown
## Quality Report

| Check | Status | Issues |
|-------|--------|--------|
| Coverage | {PASS/FAIL} | {details} |
| Accuracy | {PASS/FAIL} | {details} |
| Style | {PASS/FAIL} | {details} |

**Overall**: {PASS — ready to publish / FAIL — {n} issues to fix}
```

Fix all issues before presenting the final document. Re-run the checklist after fixes.

## Compliance Documentation Variant

When generating documentation for compliance-sensitive modules (audit, compliance, auth), add these additional sections:

### Compliance Metadata
```markdown
## Compliance

| Standard | Requirement | How This Module Satisfies It |
|----------|-------------|------------------------------|
| SOC2 CC6.1 | Logical access controls | {explanation} |
| GDPR Art. 32 | Data protection measures | {explanation} |
```

### Data Classification
```markdown
## Data Classification

| Field | Classification | Handling |
|-------|---------------|----------|
| `userId` | PII | Encrypted at rest, masked in logs |
| `email` | PII | Consent required, right to erasure |
| `tenantId` | Internal | No special handling |
```

## Principles

- **Gated steps prevent garbage**: Each gate ensures the previous step's output is correct before building on it. Skipping gates produces documentation that looks complete but is wrong.
- **Inventory before generation**: You cannot document what you haven't inventoried. The inventory step catches missing exports and scope disagreements early.
- **Examples are tests**: If an example doesn't compile, it's a bug in the documentation. Treat examples as test cases.
- **One source of truth**: Generated docs must match the source code exactly. If they diverge, the docs are wrong — update them, don't update the code to match wrong docs.

## Anti-Patterns

- **Copying JSDoc verbatim**: JSDoc is often stale or wrong. Verify every JSDoc comment against the actual implementation before including it.
- **Generic examples**: `functionName("foo", 123)` tells the reader nothing. Use domain-realistic values: `createContract({ type: "MURABAHA", amount: 50000 })`.
- **Documenting internals**: Only document the public API surface. Private methods, internal helpers, and implementation details do not belong in reference docs.
- **Skipping the quality check**: The quality check is not optional. Every report must pass all checks before the document is considered complete.

## Pre-Step: Repo Flattening for LLM Context

Before running the pipeline on a large package, generate a single-file text overview of the codebase. This gives the agent full visibility without navigating hundreds of files individually.

### Native Approach (using codemap + tree)

```bash
# Option 1: Codemap summary (structural overview)
npx @claudetools/codemap summary > repo-overview.txt
npx @claudetools/codemap tree >> repo-overview.txt

# Option 2: Concatenate all source files into one text (for LLM ingestion)
find packages/contracts-core/src -name "*.ts" -not -path "*/node_modules/*" | \
  sort | while read f; do
    echo "=== $f ==="
    cat "$f"
    echo ""
  done > package-source.txt

# Option 3: Export inventory for pipeline Step 1
npx @claudetools/codemap exports packages/contracts-core/src/index.ts
```

### When to Use

- Before documenting a package you haven't worked with before
- When the package has 50+ files and you need the full picture
- To verify completeness of the Step 1 inventory against actual exports

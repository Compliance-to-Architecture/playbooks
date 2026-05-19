# Cohesive Update — Dynamic Artifact Propagation

> When any component, endpoint, package, or configuration changes, all affected artifacts must be updated atomically. No stale numbers, no orphan docs, no out-of-sync schemas.

## Problem

Changes to routes, packages, or schemas create ripple effects across:
- Documentation (docs site, wiki, llms.txt, README files)
- Schemas (JSON schemas, OpenAPI specs)
- SDKs (TypeScript, Python, Go, Java)
- Metrics (STATUS.md, architecture quality score)
- Indexes (codemap, roam-code)
- UI displays (rail counts, feature numbers in frontend apps)

Without a cohesive update mechanism, these drift apart — the "89 rails" vs "89 rails" problem.

## Solution

Single entry point that detects what changed and propagates updates across all affected artifacts.

### CLI Usage

```bash
# Auto-detect changes from git diff and update affected artifacts
npx tsx scripts/ci/cohesive-update.ts

# Force full regeneration of all artifacts
npx tsx scripts/ci/cohesive-update.ts --all

# Preview what would change without modifying files
npx tsx scripts/ci/cohesive-update.ts --dry-run

# Scope to specific paths
npx tsx scripts/ci/cohesive-update.ts --scope packages/ui-core services/rail-api
```

### Trigger Points

| Trigger | Mechanism | What Runs |
|---------|-----------|-----------|
| Every commit (agent session) | PostToolUse hook | Stale count detection, warning |
| PR merged to main | GitHub Actions `codemap-reindex.yml` | Full `--all` cohesive update |
| Manual | `npx tsx scripts/ci/cohesive-update.ts` | Auto-detect or `--all` |
| Session start | `scripts/ci/generate_status.ts` | STATUS.md only |

### Change Detection → Scope Classification

```
Changed paths → Scope flags → Targeted updates

routes/*     → routes=true  → rail count, wiki, STATUS.md, llms.txt, codemap
packages/*   → packages=true → wiki, STATUS.md, codemap, architecture quality
apps/*       → apps=true     → STATUS.md, codemap
schemas/*    → schemas=true  → JSON schemas
openapi/*    → openapi=true  → SDK regeneration
docs/*       → docs=true     → doc consistency check
```

### Update Pipeline

```
1. Rail Count Consistency
   - Count actual routes from registry.ts (SSOT)
   - Scan all source files for stale counts (89, 112, 135, etc.)
   - Auto-fix in-place

2. llms.txt Sync
   - Update all apps/*/public/llms.txt with current rail count

3. Wiki Metadata Regeneration
   - Run generate_wiki.ts to rebuild wiki-generated.ts

4. STATUS.md Regeneration
   - Run generate_status.ts with latest metrics

5. Codemap Index Rebuild
   - Rebuild structural navigation index

6. JSON Schema Regeneration (if schemas changed)
   - Regenerate from Zod schemas

7. Doc Consistency Check
   - Verify docs match current code state

8. Architecture Quality Score
   - Recalculate modularity, abstraction, dependency health
```

## Integration with Coding Engines

### Portable Code-Engine
- Registered in `skills/skills-index.md` as "Cohesive Update" skill
- Triggers on keywords: cohesive, propagate, ripple, update-all, sync-artifacts
- Agent orchestrator can delegate to cohesive-update as a post-task step

### In-Repo Engine (CLAUDE.md)
- PostToolUse hook detects git commits and warns on stale counts
- Session start runs STATUS.md generation
- Codemap reindex workflow runs full cohesive update on PR merge

### Sandbox Image
- `npx tsx scripts/ci/cohesive-update.ts` available in sandbox image
- All dependencies (codemap, tsx) pre-installed
- Can be run as part of `iof-verify-sandbox` checks

## Rules

1. **SSOT for counts**: `grep -c '.route(' registry.ts` is the only source of truth for rail count
2. **Atomic updates**: All affected files updated in the same commit
3. **No manual counts**: Never hardcode numbers — derive from code
4. **Idempotent**: Running twice produces the same result
5. **Non-blocking**: Hook runs in background, warns but doesn't block commits
6. **Safe**: `--dry-run` flag for preview before applying

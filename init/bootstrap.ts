#!/usr/bin/env tsx
/**
 * Coding Engine — Bootstrap Script
 *
 * Initializes the coding engine in a new or existing project.
 *
 * Usage:
 *   npx coding-engine init
 *   npx coding-engine init --domain healthcare --name "MedPlatform"
 *   npx coding-engine init --domain energy --compliance "NERC,SOC2"
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import {
  defaultConfig,
  type CodingEngineConfig,
} from "../config/coding-engine.config";
import { MemorySystem } from "../core/memory/memory-system";
import { SessionManager } from "../core/session/session-manager";
import { MetricsCollector } from "../core/engine-metrics/metrics";

interface InitOptions {
  projectRoot: string;
  domain: string;
  name: string;
  compliance: string[];
  cloudProviders: string[];
  billingProvider: string;
  language: string;
  packageManager: string;
}

const SCAFFOLD_DIRS = [
  ".claude/agents",
  ".claude/hooks",
  ".claude/skills",
  ".claude/memory",
  "scripts/ci",
  "scripts/failures",
  ".github/workflows",
  "docs/incidents",
  "docs/adr",
  "docs/fixes",
  "docs/architecture",
  "config",
];

const PREREQUISITE_TOOLS = [
  { name: "git", command: "git --version", required: true },
  { name: "node", command: "node --version", required: true, minVersion: "22" },
  { name: "gh", command: "gh --version", required: false },
  { name: "docker", command: "docker --version", required: false },
];

function checkPrerequisites(): {
  passed: boolean;
  results: Array<{ tool: string; found: boolean; version?: string }>;
} {
  const results: Array<{ tool: string; found: boolean; version?: string }> = [];
  let allRequired = true;

  for (const tool of PREREQUISITE_TOOLS) {
    try {
      const output = execSync(tool.command, { encoding: "utf-8" }).trim();
      results.push({ tool: tool.name, found: true, version: output });
    } catch {
      results.push({ tool: tool.name, found: false });
      if (tool.required) allRequired = false;
    }
  }

  return { passed: allRequired, results };
}

function scaffoldDirectories(root: string): void {
  for (const dir of SCAFFOLD_DIRS) {
    const fullPath = path.join(root, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      console.log(`  Created: ${dir}/`);
    }
  }
}

function generateConfig(options: InitOptions): CodingEngineConfig {
  const config: CodingEngineConfig = {
    ...defaultConfig,
    engine: {
      ...defaultConfig.engine,
      name: options.name,
    },
    repository: {
      ...defaultConfig.repository,
      owner: "",
      name: options.name.toLowerCase().replace(/\s+/g, "-"),
      packageManager: options.packageManager as "pnpm" | "npm" | "yarn" | "bun",
      language: options.language as
        | "typescript"
        | "python"
        | "go"
        | "rust"
        | "java"
        | "polyglot",
    },
    domain: {
      name: options.domain,
      description: `${options.name} — ${options.domain} platform`,
      guardrailSkills: [],
      domainAgents: [],
      domainSkills: [],
      taxonomyCategories: [],
    },
    compliance: {
      ...defaultConfig.compliance,
      standards: options.compliance,
    },
    billing: {
      ...defaultConfig.billing,
      provider: options.billingProvider as
        | "stripe"
        | "paddle"
        | "lemonsqueezy"
        | "none",
    },
  };

  return config;
}

function generateCLAUDE_MD(config: CodingEngineConfig): string {
  return `# CLAUDE.md — ${config.engine.name}

## Mandatory Principles

1. **Codemap First**: Rebuild codemap index at session start
2. **RALPH Method**: Read → Analyze → List → Plan → Hardcode-nothing
3. **TigerStyle**: Functions ≤70 lines, ≥2 assertions, explicit bounds
4. **Direct Action First**: Fix directly, don't create scripts for what you can do now
5. **Zero Mock Data**: All data from real APIs
6. **Zero Duplication**: One canonical implementation per feature
7. **Zero Orphan Code**: If not imported, delete it
8. **SSOT**: One definition per type, one import path per consumer
9. **Separation of Concerns**: One module = one responsibility
10. **Compliance by Design**: ${config.compliance.standards.join(", ")} as engineering requirements
11. **Structured Output**: All agent communication uses structured JSON
12. **Never Repeat Mistakes**: Check MEMORY.md before every task

## Project Overview

**${config.domain.description}**

## Tech Stack

- **Runtime**: Node.js 22, TypeScript 5.7+
- **Package Manager**: ${config.repository.packageManager}
- **Database**: ${config.infrastructure.database}
- **Cache**: ${config.infrastructure.cache}
- **Cloud**: ${config.infrastructure.cloudProviders.join(", ")}
- **Billing**: ${config.billing.provider}
- **Access Control**: ${config.compliance.accessControl}

## Repository Structure

\`\`\`
/apps           # Frontend applications
/packages       # Shared packages
/services       # Backend services
/infra          # Infrastructure (Docker, Terraform, Helm)
/config         # Configuration files
/scripts        # Build and utility scripts
\`\`\`

## Key Commands

\`\`\`bash
${config.repository.packageManager} install
${config.repository.packageManager} build
${config.repository.packageManager} dev
${config.repository.packageManager} test
${config.repository.packageManager} lint
${config.repository.packageManager} typecheck
\`\`\`

## Git Workflow

- Branch naming: \`claude/<description>-<session-id>\`
- Commit messages: conventional commits (feat:, fix:, chore:)
- Before every commit: format:check, lint, typecheck
`;
}

function generateSkillRules(config: CodingEngineConfig): object {
  const rules: Record<string, object> = {
    codemap: {
      type: "domain",
      enforcement: "suggest",
      promptTriggers: [
        { keywords: ["find", "where", "search", "symbol", "reference"] },
      ],
    },
    "structured-output": {
      type: "domain",
      enforcement: "suggest",
      promptTriggers: [
        { keywords: ["error", "failure", "structured", "json", "schema"] },
      ],
    },
    "failure-inbox": {
      type: "domain",
      enforcement: "suggest",
      promptTriggers: [
        { keywords: ["failure", "ci", "fix", "broken", "pipeline"] },
      ],
    },
  };

  // Add domain-specific guardrails
  for (const standard of config.compliance.standards) {
    rules[`compliance-${standard.toLowerCase()}`] = {
      type: "guardrail",
      enforcement: "suggest",
      promptTriggers: [
        { keywords: [standard.toLowerCase(), "compliance", "audit"] },
      ],
    };
  }

  return rules;
}

// Main execution
export function bootstrap(options: InitOptions): void {
  console.log(
    `\n  Coding Engine Bootstrap — v${defaultConfig.engine.version}\n`,
  );

  // 1. Check prerequisites
  console.log("  Checking prerequisites...");
  const prereqs = checkPrerequisites();
  for (const r of prereqs.results) {
    console.log(
      `    ${r.found ? "✓" : "✗"} ${r.tool}${r.version ? ` (${r.version})` : ""}`,
    );
  }

  if (!prereqs.passed) {
    console.error("\n  Missing required tools. Install them and try again.\n");
    process.exit(1);
  }

  // 2. Scaffold directories
  console.log("\n  Scaffolding directories...");
  scaffoldDirectories(options.projectRoot);

  // 3. Generate config
  console.log("  Generating configuration...");
  const config = generateConfig(options);
  const configPath = path.join(options.projectRoot, "coding-engine.config.ts");
  fs.writeFileSync(
    configPath,
    `export default ${JSON.stringify(config, null, 2)};`,
  );
  console.log(`    Created: coding-engine.config.ts`);

  // 4. Generate CLAUDE.md
  const claudeMd = generateCLAUDE_MD(config);
  const claudeMdPath = path.join(options.projectRoot, "CLAUDE.md");
  if (!fs.existsSync(claudeMdPath)) {
    fs.writeFileSync(claudeMdPath, claudeMd);
    console.log(`    Created: CLAUDE.md`);
  }

  // 5. Generate skill-rules.json
  const skillRules = generateSkillRules(config);
  const skillRulesPath = path.join(
    options.projectRoot,
    ".claude/skills/skill-rules.json",
  );
  fs.writeFileSync(skillRulesPath, JSON.stringify(skillRules, null, 2));
  console.log(`    Created: .claude/skills/skill-rules.json`);

  // 6. Initialize 3-tier memory system (with Hindsight if configured)
  console.log("  Initializing 3-tier memory system...");
  const hindsightConfig =
    config.agentMemory?.provider === "hindsight"
      ? config.agentMemory.hindsight
      : undefined;
  const memory = new MemorySystem(options.projectRoot, hindsightConfig);
  memory.initialize();
  console.log("    Created: .claude/memory/MEMORY.md");
  console.log("    Created: .claude/memory/anti-patterns.json");
  console.log("    Created: docs/incidents/INCIDENT_TEMPLATE.md");
  console.log("    Created: docs/adr/ADR_TEMPLATE.md");

  // 7. Initialize session manager (parallel-universe prevention)
  console.log("  Initializing session manager...");
  const sessions = new SessionManager(options.projectRoot);
  sessions.initialize();
  console.log("    Created: .claude/active-sessions.json");

  // 8. Initialize metrics collector (empty — no phantom session)
  console.log("  Initializing metrics collector...");
  const metrics = new MetricsCollector(options.projectRoot);
  metrics.save();
  console.log("    Created: .claude/engine-metrics.json");

  // 9. Copy failure context template
  console.log("  Generating failure context template...");
  const templateSrc = path.join(
    __dirname,
    "..",
    "templates",
    "session-failure-context.ts",
  );
  const templateDest = path.join(
    options.projectRoot,
    "scripts/ci/session_failure_context.ts",
  );
  if (fs.existsSync(templateSrc) && !fs.existsSync(templateDest)) {
    fs.copyFileSync(templateSrc, templateDest);
    console.log("    Created: scripts/ci/session_failure_context.ts");
  }

  console.log(`\n  Coding Engine initialized for ${config.domain.name}!\n`);
  console.log("  What was created:");
  console.log("    - CLAUDE.md with mandatory principles");
  console.log("    - .claude/memory/MEMORY.md (warm memory tier)");
  console.log(
    "    - .claude/memory/anti-patterns.json (anti-pattern registry)",
  );
  console.log(
    "    - .claude/active-sessions.json (parallel-universe prevention)",
  );
  console.log("    - .claude/engine-metrics.json (self-observability)");
  console.log("    - .claude/skills/skill-rules.json (skill activation rules)");
  console.log("    - docs/incidents/INCIDENT_TEMPLATE.md (cold memory tier)");
  console.log("    - docs/adr/ADR_TEMPLATE.md (architectural decisions)");
  console.log(
    "    - scripts/ci/session_failure_context.ts (failure context generator)",
  );
  console.log("");
  console.log("  Next steps:");
  console.log("    1. Review and update coding-engine.config.ts");
  console.log("    2. Add domain-specific skills to .claude/skills/");
  console.log("    3. Add domain-specific agents to .claude/agents/");
  console.log("    4. Start building with: claude");
  console.log("");
}

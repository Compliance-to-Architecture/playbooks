/**
 * Session Failure Context Generator — Template
 *
 * Copy this to your project's scripts/ci/ directory.
 * Collects failure context from GitHub Actions and generates
 * .claude/failure-context.md for agent consumption.
 *
 * Usage:
 *   npx tsx scripts/ci/session_failure_context.ts
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

interface FailureRun {
  databaseId: number;
  name: string;
  conclusion: string;
  headSha: string;
  createdAt: string;
  url: string;
}

function getRepoName(): string {
  try {
    const remote = execSync("git remote get-url origin", {
      encoding: "utf-8",
    }).trim();
    const match = remote.match(/[:/]([^/]+\/[^/.]+)/);
    return match ? match[1] : "unknown/repo";
  } catch {
    return "unknown/repo";
  }
}

function getRecentFailures(repo: string): FailureRun[] {
  try {
    const output = execSync(
      `gh run list --repo ${repo} --status failure --limit 10 --json databaseId,name,conclusion,headSha,createdAt,url`,
      { encoding: "utf-8" },
    );
    return JSON.parse(output);
  } catch {
    console.warn(
      "Could not fetch GitHub Actions failures (gh CLI not available or not authenticated)",
    );
    return [];
  }
}

function getOpenFixPRs(
  repo: string,
): Array<{ number: number; title: string; url: string }> {
  try {
    const output = execSync(
      `gh pr list --repo ${repo} --label "auto-fix" --json number,title,url --limit 10`,
      { encoding: "utf-8" },
    );
    return JSON.parse(output);
  } catch {
    return [];
  }
}

function getIncidentFiles(projectRoot: string): string[] {
  const incidentsDir = path.join(projectRoot, "docs/incidents");
  try {
    return fs
      .readdirSync(incidentsDir)
      .filter((f) => f.endsWith(".md") && f !== "INCIDENT_TEMPLATE.md")
      .sort()
      .reverse()
      .slice(0, 5);
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const projectRoot = process.cwd();
  const repo = getRepoName();
  const failures = getRecentFailures(repo);
  const fixPRs = getOpenFixPRs(repo);
  const incidents = getIncidentFiles(projectRoot);

  const lines: string[] = [
    "# Failure Context",
    "",
    `> Auto-generated at ${new Date().toISOString()}`,
    `> Repository: ${repo}`,
    "",
  ];

  if (failures.length === 0 && fixPRs.length === 0 && incidents.length === 0) {
    lines.push("No active failures or incidents. All clear.");
  }

  if (failures.length > 0) {
    lines.push("## Recent GitHub Actions Failures");
    lines.push("");
    lines.push("| Workflow | SHA | Date |");
    lines.push("|----------|-----|------|");
    for (const f of failures) {
      lines.push(
        `| ${f.name} | \`${f.headSha.slice(0, 7)}\` | ${f.createdAt} |`,
      );
    }
    lines.push("");
  }

  if (fixPRs.length > 0) {
    lines.push("## Open Fix PRs");
    lines.push("");
    for (const pr of fixPRs) {
      lines.push(`- #${pr.number}: ${pr.title}`);
    }
    lines.push("");
  }

  if (incidents.length > 0) {
    lines.push("## Recent Incidents");
    lines.push("");
    for (const inc of incidents) {
      lines.push(`- \`docs/incidents/${inc}\``);
    }
    lines.push("");
  }

  // Attempt Hindsight recall for cross-session context
  try {
    const { HindsightAdapter } =
      await import("../core/memory/hindsight-adapter");
    const hindsight = new HindsightAdapter();
    const available = await hindsight.isAvailable();
    if (available) {
      const context = await hindsight.sessionStartRecall();
      if (context.antiPatterns.length > 0) {
        lines.push("## Hindsight: Known Anti-Patterns");
        lines.push("");
        for (const ap of context.antiPatterns) {
          lines.push(`- ${ap}`);
        }
        lines.push("");
      }
      if (context.recentIncidents.length > 0) {
        lines.push("## Hindsight: Recent Incidents");
        lines.push("");
        for (const inc of context.recentIncidents) {
          lines.push(`- ${inc}`);
        }
        lines.push("");
      }
      if (context.conventions.length > 0) {
        lines.push("## Hindsight: Conventions & Decisions");
        lines.push("");
        for (const conv of context.conventions) {
          lines.push(`- ${conv}`);
        }
        lines.push("");
      }
    }
  } catch {
    // Hindsight not available — gracefully skip
  }

  lines.push("## Action Items");
  lines.push("");
  if (failures.length > 0) {
    lines.push(`- [ ] Investigate ${failures.length} recent CI failure(s)`);
  }
  if (fixPRs.length > 0) {
    lines.push(`- [ ] Review ${fixPRs.length} open fix PR(s)`);
  }
  lines.push(
    "- [ ] Check MEMORY.md and Hindsight recall for known anti-patterns before starting work",
  );
  lines.push("");

  const outputDir = path.join(projectRoot, ".claude");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, "failure-context.md");
  fs.writeFileSync(outputPath, lines.join("\n"));
  console.log(`Failure context written to ${outputPath}`);
}

main().catch(console.error);

#!/usr/bin/env tsx
/**
 * Coding Engine CLI
 *
 * Commands:
 *   init     - Initialize coding engine in current project
 *   check    - Verify engine configuration
 *   status   - Show engine metrics and health
 */

import * as fs from "fs";
import * as path from "path";

const COMMANDS: Record<string, () => Promise<void>> = {
  init: async () => {
    const { bootstrap } = await import("./init/bootstrap");
    const args = process.argv.slice(3);
    const options = {
      projectRoot: getCliArg(args, "--root") ?? process.cwd(),
      domain: getCliArg(args, "--domain") ?? "generic",
      name: getCliArg(args, "--name") ?? path.basename(process.cwd()),
      compliance: (getCliArg(args, "--compliance") ?? "SOC2,GDPR").split(","),
      cloudProviders: (getCliArg(args, "--cloud") ?? "aws,cloudflare").split(
        ",",
      ),
      billingProvider: getCliArg(args, "--billing") ?? "stripe",
      language: getCliArg(args, "--language") ?? "typescript",
      packageManager: getCliArg(args, "--pm") ?? "pnpm",
    };
    bootstrap(options);
  },
  check: async () => {
    const projectRoot = process.cwd();
    const requiredDirs = [
      ".claude/skills",
      ".claude/agents",
      ".claude/hooks",
      ".claude/memory",
      "scripts/ci",
      ".github/workflows",
    ];
    let passed = 0;
    let failed = 0;
    for (const dir of requiredDirs) {
      const fullPath = path.join(projectRoot, dir);
      if (fs.existsSync(fullPath)) {
        console.log(`  [ok] ${dir}`);
        passed++;
      } else {
        console.log(`  [missing] ${dir}`);
        failed++;
      }
    }
    console.log(
      `\n${passed} passed, ${failed} missing out of ${requiredDirs.length} directories`,
    );
    if (failed > 0) process.exit(1);
  },
  status: async () => {
    const { MetricsCollector } = await import("./core/engine-metrics/metrics");
    const metrics = new MetricsCollector(process.cwd());
    const data = metrics.getMetrics();
    process.stdout.write(JSON.stringify(data, null, 2) + "\n");
  },
  recall: async () => {
    const { HindsightAdapter } =
      await import("./core/memory/hindsight-adapter");
    const query = process.argv.slice(3).join(" ") || "known anti-patterns";
    const adapter = new HindsightAdapter();
    const available = await adapter.isAvailable();
    if (!available) {
      console.error("Hindsight server not reachable at http://localhost:8888");
      console.error(
        "Start with: docker run --rm -it -p 8888:8888 -p 9999:9999 ghcr.io/vectorize-io/hindsight:latest",
      );
      process.exit(1);
    }
    console.log(`Recalling: "${query}"`);
    const result = await adapter.recall(query);
    if (result.success && result.memories.length > 0) {
      for (const mem of result.memories) {
        console.log(`  [${(mem.relevance * 100).toFixed(0)}%] ${mem.content}`);
      }
    } else if (result.success) {
      console.log("  No memories found for this query.");
    } else {
      console.error(`  Error: ${result.error}`);
    }
  },
  reflect: async () => {
    const { HindsightAdapter } =
      await import("./core/memory/hindsight-adapter");
    const query =
      process.argv.slice(3).join(" ") ||
      "Synthesize all known anti-patterns, recurring issues, and engineering principles";
    const adapter = new HindsightAdapter();
    const available = await adapter.isAvailable();
    if (!available) {
      console.error("Hindsight server not reachable at http://localhost:8888");
      process.exit(1);
    }
    console.log(`Reflecting: "${query}"`);
    const result = await adapter.reflect(query);
    if (result.success) {
      if (result.insight) {
        console.log("\nInsight:");
        console.log(result.insight);
      }
      if (result.mentalModels && result.mentalModels.length > 0) {
        console.log("\nMental Models:");
        for (const model of result.mentalModels) {
          console.log(`  - ${model}`);
        }
      }
    } else {
      console.error(`  Error: ${result.error}`);
    }
  },
  "session-recall": async () => {
    const { HindsightAdapter } =
      await import("./core/memory/hindsight-adapter");
    const adapter = new HindsightAdapter();
    const available = await adapter.isAvailable();
    if (!available) {
      console.log("Hindsight not available — skipping session recall");
      return;
    }
    console.log("Running session-start recall...");
    const context = await adapter.sessionStartRecall();
    const outputLines: string[] = [];
    if (context.antiPatterns.length > 0) {
      outputLines.push("## Hindsight: Known Anti-Patterns");
      outputLines.push("");
      for (const ap of context.antiPatterns) {
        outputLines.push(`- ${ap}`);
      }
      outputLines.push("");
    }
    if (context.recentIncidents.length > 0) {
      outputLines.push("## Hindsight: Recent Incidents");
      outputLines.push("");
      for (const inc of context.recentIncidents) {
        outputLines.push(`- ${inc}`);
      }
      outputLines.push("");
    }
    if (context.conventions.length > 0) {
      outputLines.push("## Hindsight: Conventions & Decisions");
      outputLines.push("");
      for (const conv of context.conventions) {
        outputLines.push(`- ${conv}`);
      }
      outputLines.push("");
    }
    if (outputLines.length > 0) {
      const outputPath = path.join(
        process.cwd(),
        ".claude/hindsight-context.md",
      );
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      fs.writeFileSync(outputPath, outputLines.join("\n"));
      console.log(`Hindsight context written to ${outputPath}`);
    } else {
      console.log("No memories recalled from Hindsight.");
    }
  },
};

function getCliArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (!command || command === "--help" || command === "-h") {
    console.log("Usage: coding-engine <command>");
    console.log("\nCommands:");
    console.log(
      "  init            Initialize coding engine in current project",
    );
    console.log("  check           Verify engine configuration");
    console.log("  status          Show engine metrics and health");
    console.log("  recall [query]  Recall memories from Hindsight");
    console.log("  reflect [query] Synthesize insights from Hindsight");
    console.log(
      "  session-recall  Recall full session context (anti-patterns, incidents, conventions)",
    );
    return;
  }
  const handler = COMMANDS[command];
  if (!handler) {
    console.error(`Unknown command: ${command}`);
    console.error(`Available: ${Object.keys(COMMANDS).join(", ")}`);
    process.exit(1);
  }
  await handler();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

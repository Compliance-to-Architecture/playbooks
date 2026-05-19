#!/usr/bin/env tsx
/**
 * Hook Template — {{HOOK_NAME}}
 *
 * Event: {{UserPromptSubmit | PostToolUse | PreCommit | SessionStart | SessionEnd}}
 *
 * Copy this file, replace {{placeholders}}, and save as `.claude/hooks/{{hook-name}}.ts`
 *
 * Hook configuration in .claude/settings.json:
 * {
 *   "hooks": {
 *     "{{EVENT}}": [{
 *       "command": "npx tsx .claude/hooks/{{hook-name}}.ts",
 *       "timeout": 10000
 *     }]
 *   }
 * }
 */

interface HookInput {
  event: string;
  data: Record<string, unknown>;
}

async function main(): Promise<void> {
  // Read hook input from stdin
  const input: HookInput = JSON.parse(
    await new Promise<string>((resolve) => {
      let data = "";
      process.stdin.on("data", (chunk) => (data += chunk));
      process.stdin.on("end", () => resolve(data));
    }),
  );

  // {{HOOK_LOGIC}}

  // Output result (optional — only if hook needs to provide feedback)
  const result = {
    proceed: true,
    message: "",
    suggestions: [] as string[],
  };

  process.stdout.write(JSON.stringify(result));
}

main().catch((error) => {
  console.error("Hook error:", error);
  process.exit(1);
});

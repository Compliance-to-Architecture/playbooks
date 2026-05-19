# Code-Mode — Tool Execution Optimization

## Overview

Code-mode enables agents to batch multiple MCP tool calls into a single TypeScript code execution, reducing token usage by 67-88% and eliminating sequential round-trips.

Instead of calling tools one-by-one (each requiring a full LLM turn), the agent writes a TypeScript function that calls multiple tools, and code-mode executes it in a sandboxed VM.

## When to Use

- **Batch operations**: Checking health of all services, deploying all apps, running all checks
- **Multi-step workflows**: Fetch data from one tool, transform, pass to another
- **Conditional logic**: If service A is down, check logs, then restart — all in one execution
- **Data aggregation**: Collect metrics from multiple sources and return a summary

## Usage

```typescript
import {
  CodeModeManager,
  iofCodeModeConfig,
} from "../core/code-mode/code-mode-plugin";

const manager = new CodeModeManager(iofCodeModeConfig);
await manager.initialize();

// Execute a batch operation
const result = await manager.executeToolChain(`
  const issues = await github.listIssues({ state: "open", labels: ["bug"] });
  const prs = await github.listPullRequests({ state: "open" });
  return { openBugs: issues.length, openPRs: prs.length };
`);

console.log(result.result); // { openBugs: 5, openPRs: 3 }
console.log(result.duration_ms); // 1200
```

## Token Savings

| Approach | Tokens per interaction | Savings |
|----------|----------------------|---------|
| Sequential tool calls | ~50,000 (10 tools × 5,000 each) | Baseline |
| Code-mode batch | ~5,000 (1 code block + results) | **90%** |

## Configuration

Code-mode is configured in `coding-engine.config.ts` under the `codeMode` section, or directly via `CodeModeConfig`.

### MCP Server Registration

```typescript
const config: CodeModeConfig = {
  enabled: true,
  timeout_ms: 30000,
  mcpServers: {
    github: { command: "gh", args: ["mcp"] },
    stripe: { command: "npx", args: ["-y", "@stripe/mcp", "--tools=all"] },
  },
};
```

### As MCP Server (for external agents)

```json
{
  "mcpServers": {
    "code-mode": {
      "command": "npx",
      "args": ["@utcp/code-mode-mcp"]
    }
  }
}
```

## Security

- Code executes in VM2 sandbox (isolated from host process)
- Configurable timeout (default 30s, max 120s)
- Only registered tools are accessible
- No filesystem or network access outside tool calls

## References

- Package: [@utcp/code-mode](https://www.npmjs.com/package/@utcp/code-mode) (v1.2.11)
- MCP wrapper: [@utcp/code-mode-mcp](https://www.npmjs.com/package/@utcp/code-mode-mcp)
- GitHub: [universal-tool-calling-protocol/code-mode](https://github.com/universal-tool-calling-protocol/code-mode)
- Cloudflare variant: [@cloudflare/codemode](https://github.com/cloudflare/agents/tree/main/packages/codemode) (Workers-only)

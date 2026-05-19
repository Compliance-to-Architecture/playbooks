# LLM Agent Patterns

> Prompt engineering, agent architectures, tool calling, structured output, RAG patterns, guardrails, and evaluation for production AI systems.

## Core Principles

1. **Structured Output Over Free Text** — Always constrain LLM responses with JSON schemas (Zod, Pydantic). Free-text parsing is fragile and breaks at scale. Use `tool_use` or `response_format` to enforce structure.
2. **Guardrails Are Non-Negotiable** — Every production agent needs input validation, output validation, content filtering, and cost controls. An unguarded agent is a liability, not a feature.
3. **Evaluate Before Deploying** — Build eval suites before shipping. Without evals, you cannot measure regression, compare models, or justify changes. Evals are the tests of AI systems.
4. **Context Window Is Precious** — Token budget management is engineering, not an afterthought. Compress context, use RAG for long-tail knowledge, and never dump entire codebases into prompts.
5. **Determinism Where Possible** — Use temperature=0 for structured tasks, seed parameters for reproducibility, and caching for identical inputs. Non-determinism should be intentional.

## Patterns

### Pattern 1: Tool-Calling Agent Loop

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const tools: Anthropic.Tool[] = [
  {
    name: 'search_contracts',
    description: 'Search Islamic finance contracts by type, status, or tenant',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query' },
        contract_type: { type: 'string', enum: ['MURABAHA', 'IJARAH', 'SUKUK'] },
        limit: { type: 'number', default: 10 },
      },
      required: ['query'],
    },
  },
];

async function agentLoop(userMessage: string): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userMessage },
  ];

  while (true) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      tools,
      messages,
    });

    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find(b => b.type === 'text');
      return textBlock?.text ?? '';
    }

    // Execute tool calls
    const toolUses = response.content.filter(b => b.type === 'tool_use');
    messages.push({ role: 'assistant', content: response.content });

    const toolResults = await Promise.all(
      toolUses.map(async (tool) => ({
        type: 'tool_result' as const,
        tool_use_id: tool.id,
        content: JSON.stringify(await executeTool(tool.name, tool.input)),
      }))
    );
    messages.push({ role: 'user', content: toolResults });
  }
}
```

### Pattern 2: Structured Output with Zod Validation

```typescript
import { z } from 'zod';

const ContractAnalysis = z.object({
  risk_level: z.enum(['low', 'medium', 'high', 'critical']),
  compliance_issues: z.array(z.object({
    standard: z.string(),
    violation: z.string(),
    severity: z.enum(['warning', 'error', 'blocker']),
  })),
  recommendation: z.string().max(500),
  confidence_score: z.number().min(0).max(1),
});

async function analyzeContract(contract: Contract) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: 'You are a Shariah compliance analyst. Respond ONLY with valid JSON.',
    messages: [{ role: 'user', content: `Analyze: ${JSON.stringify(contract)}` }],
  });

  const text = response.content.find(b => b.type === 'text')?.text ?? '{}';
  const parsed = ContractAnalysis.safeParse(JSON.parse(text));

  if (!parsed.success) {
    throw new Error(`Invalid LLM output: ${parsed.error.message}`);
  }
  return parsed.data;
}
```

### Pattern 3: Cost-Controlled Agent with Circuit Breaker

```typescript
class AgentBudget {
  private tokens_used = 0;
  private calls_made = 0;
  private readonly max_tokens: number;
  private readonly max_calls: number;

  constructor(max_tokens = 100_000, max_calls = 20) {
    this.max_tokens = max_tokens;
    this.max_calls = max_calls;
  }

  check(): void {
    assert(this.tokens_used < this.max_tokens, `Token budget exceeded: ${this.tokens_used}`);
    assert(this.calls_made < this.max_calls, `Call limit exceeded: ${this.calls_made}`);
  }

  record(input_tokens: number, output_tokens: number): void {
    this.tokens_used += input_tokens + output_tokens;
    this.calls_made += 1;
    this.check();
  }
}
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Better Approach |
|---|---|---|
| Parsing free-text with regex | Fragile, breaks with model updates | Use structured output (tool_use, JSON mode) |
| No token budget limits | Runaway costs from agent loops | Circuit breaker with token and call limits |
| Prompt injection via user input | Security vulnerability, data exfiltration | Input sanitization, system prompt isolation |
| Evaluating by vibes | No reproducibility, no regression detection | Automated eval suites with scored assertions |
| Stuffing entire DB into context | Exceeds context window, degrades quality | RAG with relevant retrieval, summarization |
| Hardcoded prompts in source | No A/B testing, hard to iterate | Prompt registry with versioning |

## Implementation Checklist

- [ ] Define output schemas (Zod/Pydantic) for all LLM responses
- [ ] Implement tool-calling agent loop with max iteration limit
- [ ] Add token budget tracking and circuit breaker
- [ ] Build eval suite with minimum 50 test cases per task
- [ ] Set up prompt versioning and A/B testing infrastructure
- [ ] Implement input sanitization against prompt injection
- [ ] Add structured logging for all LLM calls (model, tokens, latency)
- [ ] Configure caching for deterministic queries (same input = cached output)

## References

- [Anthropic Tool Use Documentation](https://docs.anthropic.com/en/docs/build-with-claude/tool-use)
- [Anthropic Prompt Engineering Guide](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering)
- [OWASP LLM Top 10](https://owasp.org/www-project-top-10-for-large-language-model-applications/)
- [Braintrust Evals](https://www.braintrust.dev/docs/guides/evals)

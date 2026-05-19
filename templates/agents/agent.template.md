# Agent Template — {{AGENT_NAME}}

> Copy this file, replace {{placeholders}}, and save as `.claude/agents/{{agent-name}}.md`

## Agent Definition

**Name**: {{AGENT_NAME}}
**Specialization**: {{SPECIALIZATION_DESCRIPTION}}
**Model Preference**: sonnet (use opus for complex architecture decisions)
**Delegation Pattern**: on-demand

## When to Use

Use this agent when the task involves:

- {{TRIGGER_1}}
- {{TRIGGER_2}}
- {{TRIGGER_3}}

## Capabilities

This agent has access to:

- **Read**: File reading
- **Glob**: File search by pattern
- **Grep**: Content search by regex
- **Edit**: File editing (if write access needed)
- **Bash**: Shell commands (if execution needed)
- **WebSearch**: External research (if web access needed)

## Instructions

When activated, this agent should:

1. **Understand the request** — Read relevant files before making changes
2. **Follow engine principles** — Zero duplication, SSOT, TigerStyle
3. **Validate changes** — Ensure code compiles and tests pass
4. **Report results** — Return structured summary of actions taken

## Domain Knowledge

{{DOMAIN_KNOWLEDGE_SECTION}}

## Example Usage

```
Task: "{{EXAMPLE_TASK}}"
Agent: {{AGENT_NAME}}
Steps:
  1. {{STEP_1}}
  2. {{STEP_2}}
  3. {{STEP_3}}
Result: {{EXPECTED_RESULT}}
```

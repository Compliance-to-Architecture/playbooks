import { describe, it, expect } from "vitest";
import { AgentOrchestrator } from "../core/orchestrator/agent-orchestrator";
import type {
  AgentTask,
  AgentExecutor,
  TaskResult,
} from "../core/orchestrator/agent-orchestrator";

function makeExecutor(delay = 10, shouldFail = false): AgentExecutor {
  return {
    execute: async (task: AgentTask): Promise<TaskResult> => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      if (shouldFail) {
        return {
          taskId: task.id,
          agentType: task.agentType,
          status: "failed",
          error: "Simulated failure",
          duration_ms: delay,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        };
      }
      return {
        taskId: task.id,
        agentType: task.agentType,
        status: "completed",
        output: `Result for ${task.id}`,
        duration_ms: delay,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      };
    },
    isAvailable: async () => true,
  };
}

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: `task-${Math.random().toString(36).slice(2, 8)}`,
    agentType: "test-agent",
    description: "Test task",
    priority: "normal",
    prompt: "Do something",
    dependencies: [],
    timeout_ms: 5000,
    ...overrides,
  };
}

describe("AgentOrchestrator", () => {
  it("executes a single task", async () => {
    const orchestrator = new AgentOrchestrator({ maxParallelTasks: 2 });
    orchestrator.registerAgent(
      {
        name: "test-agent",
        description: "Test",
        specialization: "testing",
        tools: [],
        delegationPattern: "parallel",
      },
      makeExecutor(),
    );

    const task = makeTask({ id: "t1" });
    orchestrator.submit(task);
    const results = await orchestrator.executeAll();

    expect(results.get("t1")).toBeDefined();
    expect(results.get("t1")!.status).toBe("completed");
  });

  it("executes parallel tasks", async () => {
    const orchestrator = new AgentOrchestrator({ maxParallelTasks: 4 });
    orchestrator.registerAgent(
      {
        name: "test-agent",
        description: "Test",
        specialization: "testing",
        tools: [],
        delegationPattern: "parallel",
      },
      makeExecutor(10),
    );

    orchestrator.submitParallel([
      makeTask({ id: "p1" }),
      makeTask({ id: "p2" }),
      makeTask({ id: "p3" }),
    ]);

    const results = await orchestrator.executeAll();
    expect(results.size).toBe(3);
    for (const [, result] of results) {
      expect(result.status).toBe("completed");
    }
  });

  it("respects task dependencies", async () => {
    const orchestrator = new AgentOrchestrator({ maxParallelTasks: 2 });
    orchestrator.registerAgent(
      {
        name: "test-agent",
        description: "Test",
        specialization: "testing",
        tools: [],
        delegationPattern: "sequential",
      },
      makeExecutor(10),
    );

    orchestrator.submit(makeTask({ id: "dep-1" }));
    orchestrator.submit(makeTask({ id: "dep-2", dependencies: ["dep-1"] }));

    const results = await orchestrator.executeAll();
    expect(results.get("dep-1")!.status).toBe("completed");
    expect(results.get("dep-2")!.status).toBe("completed");
  });

  it("triggers circuit breaker on repeated failures", async () => {
    const orchestrator = new AgentOrchestrator({
      maxParallelTasks: 1,
      circuitBreakerThreshold: 2,
    });
    orchestrator.registerAgent(
      {
        name: "failing-agent",
        description: "Always fails",
        specialization: "testing",
        tools: [],
        delegationPattern: "sequential",
      },
      makeExecutor(5, true),
    );

    orchestrator.submit(makeTask({ id: "f1", agentType: "failing-agent" }));
    orchestrator.submit(makeTask({ id: "f2", agentType: "failing-agent" }));
    orchestrator.submit(makeTask({ id: "f3", agentType: "failing-agent" }));

    const results = await orchestrator.executeAll();
    const summary = orchestrator.getSummary();
    expect(summary.failed).toBeGreaterThanOrEqual(2);
    expect(summary.circuitBreakers["failing-agent"]).toBe("open");
  });

  it("prioritizes critical tasks", async () => {
    const orchestrator = new AgentOrchestrator({ maxParallelTasks: 1 });
    const executionOrder: string[] = [];
    const trackingExecutor: AgentExecutor = {
      execute: async (task) => {
        executionOrder.push(task.id);
        return {
          taskId: task.id,
          agentType: task.agentType,
          status: "completed",
          duration_ms: 1,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        };
      },
      isAvailable: async () => true,
    };

    orchestrator.registerAgent(
      {
        name: "test-agent",
        description: "Test",
        specialization: "testing",
        tools: [],
        delegationPattern: "sequential",
      },
      trackingExecutor,
    );

    orchestrator.submit(makeTask({ id: "low", priority: "low" }));
    orchestrator.submit(makeTask({ id: "critical", priority: "critical" }));
    orchestrator.submit(makeTask({ id: "normal", priority: "normal" }));

    await orchestrator.executeAll();
    expect(executionOrder[0]).toBe("critical");
  });

  it("rejects unknown agent types", () => {
    const orchestrator = new AgentOrchestrator();
    expect(() =>
      orchestrator.submit(makeTask({ agentType: "nonexistent" })),
    ).toThrow();
  });

  it("provides audit trail", async () => {
    const orchestrator = new AgentOrchestrator();
    orchestrator.registerAgent(
      {
        name: "test-agent",
        description: "Test",
        specialization: "testing",
        tools: [],
        delegationPattern: "parallel",
      },
      makeExecutor(),
    );

    orchestrator.submit(makeTask({ id: "audit-1" }));
    await orchestrator.executeAll();

    const trail = orchestrator.getAuditTrail();
    expect(trail.length).toBeGreaterThan(0);
    expect(trail.some((e) => e.action === "submitted")).toBe(true);
    expect(trail.some((e) => e.action === "completed")).toBe(true);
  });
});

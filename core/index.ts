/**
 * Coding Engine — Core Exports
 *
 * Main entry point for the portable coding engine.
 */

// Types
export type {
  BaseFailure,
  FailureEvent,
  FailureBundle,
  AgentFailureContext,
  UnifiedFailureReport,
  FailureSeverity,
  FailureSource,
  FailureStatus,
  BlobKind,
  FailureContextBlob,
} from "./types/failure-types";

export { generateFingerprint, compareSeverity } from "./types/failure-types";

export type {
  CodingEnginePlugin,
  PluginRegistry as IPluginRegistry,
  SkillDefinition,
  AgentDefinition,
  FailureSourceAdapter,
  MetricCollector,
  HookEvent,
  HookHandler,
  HookContext,
  HookResult,
  WorkflowTemplate,
  SkillEnforcement,
} from "./types/plugin-types";

// Config
export type { CodingEngineConfig } from "../config/coding-engine.config";
export { defaultConfig, loadConfig } from "../config/coding-engine.config";

// Failure Pipeline
export {
  FailurePipeline,
  FailureStore,
  createGitHubActionsSource,
} from "./failure-pipeline/pipeline";
export type {
  FailureSourceConfig,
  PipelineConfig,
  EscalationHook,
  ResolutionRecord,
  DeadLetterEntry,
  CorrelationGroup,
} from "./failure-pipeline/pipeline";

// Plugin Registry
export { PluginRegistry, createPlugin } from "./plugin-api/registry";

// Engine Metrics
export { MetricsCollector } from "./engine-metrics/metrics";
export type { EngineMetrics } from "./engine-metrics/metrics";

// Memory System
export { MemorySystem } from "./memory/memory-system";
export type {
  MemoryEntry,
  AntiPattern,
  MemoryTier,
} from "./memory/memory-system";

// Hindsight Agent Memory
export {
  HindsightAdapter,
  defaultHindsightConfig,
} from "./memory/hindsight-adapter";
export type {
  HindsightConfig,
  RetainResult,
  RecallResult,
  ReflectResult,
} from "./memory/hindsight-adapter";

// Session Manager
export { SessionManager } from "./session/session-manager";
export type { SessionInfo, ActiveSessions } from "./session/session-manager";

// Language Adapters
export {
  getAdapter,
  TypeScriptPnpmAdapter,
  TypeScriptNpmAdapter,
  PythonPoetryAdapter,
  PythonUvAdapter,
  GoAdapter,
  RustCargoAdapter,
  JavaGradleAdapter,
} from "./language-adapters/adapter";
export type { LanguageAdapter } from "./language-adapters/adapter";

// Code-Mode (Tool Execution Optimization)
export {
  CodeModeManager,
  createCodeModePlugin,
  defaultCodeModeConfig,
} from "./code-mode/code-mode-plugin";
export type {
  CodeModeConfig,
  ToolChainResult,
} from "./code-mode/code-mode-plugin";

// Storage Adapters (Distributed State Backend)
export { LRUCache } from "./storage/lru-cache";
export type { LRUCacheOptions } from "./storage/lru-cache";
export {
  FileStorageAdapter,
  InMemoryStorageAdapter,
  RedisStorageAdapter,
  TenantScopedStorageAdapter,
  ServerlessStorageAdapter,
} from "./storage/storage-adapter";
export type {
  StorageAdapter,
  RedisStorageAdapterConfig,
} from "./storage/storage-adapter";

// Compliance Engine (Runtime Enforcement)
export { ComplianceEngine } from "./compliance/compliance-engine";
export type {
  ComplianceRule,
  ComplianceContext,
  ComplianceResult,
  ComplianceReport,
  ComplianceRuleId,
  ComplianceSeverity,
  ComplianceStandard,
} from "./compliance/compliance-engine";

// Agent Orchestrator (Built-in Delegation Engine)
export { AgentOrchestrator } from "./orchestrator/agent-orchestrator";
export type {
  AgentTask,
  TaskResult,
  TaskStatus,
  TaskPriority,
  AgentExecutor,
  OrchestratorConfig,
} from "./orchestrator/agent-orchestrator";

// Health Monitor & Watchdog (Proactive Self-Healing)
export {
  HealthMonitor,
  createHttpHealthTarget,
} from "./watchdog/health-monitor";
export type {
  HealthTarget,
  HealthCheckResult,
  HealthStatus,
  HealthReport,
  RemediationResult,
} from "./watchdog/health-monitor";

// PostgreSQL Storage Adapter (Distributed Persistence)
export { PostgreSQLStorageAdapter } from "./storage/postgresql-adapter";
export type { PostgreSQLAdapterConfig } from "./storage/postgresql-adapter";

// Webhook & Event Dispatcher
export { WebhookDispatcher } from "./webhook/webhook-dispatcher";
export type {
  WebhookEventType,
  WebhookEndpoint,
  WebhookPayload,
  WebhookDelivery,
  WebhookDispatcherConfig,
} from "./webhook/webhook-dispatcher";

// Authentication & Authorization
export { AuthManager } from "./auth/auth-middleware";
export type {
  AuthRole,
  ApiKeyRecord,
  AuthContext,
  AuthResult,
} from "./auth/auth-middleware";

// HTTP Server (Service Mode)
export { EngineHttpServer } from "./server/http-server";
export type {
  EngineServerConfig,
  EngineServerDeps,
} from "./server/http-server";

// Graceful Shutdown
export { GracefulShutdown } from "./lifecycle/graceful-shutdown";
export type {
  ShutdownPhase,
  ShutdownHook,
  ShutdownConfig,
} from "./lifecycle/graceful-shutdown";

// LLM Adapter Layer (llama.cpp, Anthropic, OpenAI, Custom)
export {
  LlamaCppAdapter,
  CloudLlmAdapter,
  LlmManager,
  createLlmAdapter,
  DEFAULT_LLAMACPP_CONFIG,
} from "./llm/llm-adapter";
export type {
  LlmProvider,
  LlmMessage,
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmToolCall,
  LlmToolResult,
  LlmAdapter,
  LlmAdapterConfig,
} from "./llm/llm-adapter";

// Autonomous Execution Loop (RALPH-style)
export { ExecutionLoop } from "./runtime/execution-loop";
export type {
  LoopStatus,
  LoopTask,
  LoopConfig,
  LoopState,
  IterationResult,
  TaskSource,
} from "./runtime/execution-loop";

// Runtime Agent Daemon (Persistent Process)
export { AgentDaemon } from "./runtime/agent-daemon";
export type {
  DaemonConfig,
  DaemonStatus,
  DaemonState,
} from "./runtime/agent-daemon";

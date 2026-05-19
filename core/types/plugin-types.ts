/**
 * Coding Engine — Plugin API Types
 *
 * Formal plugin interface for extending the engine with custom skills,
 * agents, failure sources, metrics collectors, and hooks.
 */

export type HookEvent =
  | "UserPromptSubmit"
  | "PostToolUse"
  | "PreCommit"
  | "PostCommit"
  | "PreDeploy"
  | "PostDeploy"
  | "SessionStart"
  | "SessionEnd"
  | "FailureDetected"
  | "PRCreated"
  | "PRMerged";

export type SkillEnforcement = "block" | "suggest" | "warn";

export interface SkillDefinition {
  name: string;
  type: "domain" | "guardrail" | "utility";
  enforcement: SkillEnforcement;
  description: string;
  promptTriggers: Array<{
    keywords: string[];
    intent?: string;
  }>;
  fileTriggers?: Array<{
    pathPattern: string;
    contentPattern?: string;
  }>;
  skillFilePath: string;
}

export interface AgentDefinition {
  name: string;
  description: string;
  specialization: string;
  tools: string[];
  modelPreference?: "opus" | "sonnet" | "haiku";
  delegationPattern: "parallel" | "sequential" | "on-demand";
}

export interface FailureSourceAdapter {
  name: string;
  source: string;
  collect: () => Promise<import("./failure-types").FailureEvent[]>;
  healthCheck: () => Promise<boolean>;
}

export interface MetricCollector {
  name: string;
  collect: () => Promise<Record<string, number | string>>;
  interval?: string;
}

export type HookHandler = (context: HookContext) => Promise<HookResult>;

export interface HookContext {
  event: HookEvent;
  data: Record<string, unknown>;
  config: import("../../config/coding-engine.config").CodingEngineConfig;
}

export interface HookResult {
  proceed: boolean;
  message?: string;
  suggestions?: string[];
}

export interface WorkflowTemplate {
  name: string;
  description: string;
  trigger: string;
  templatePath: string;
  variables: Record<string, string>;
}

/**
 * The main plugin interface.
 * All plugins must implement this interface to be loadable by the engine.
 */
export interface CodingEnginePlugin {
  /** Unique plugin name (e.g., "healthcare-compliance") */
  name: string;
  /** Semver version string */
  version: string;
  /** Human-readable description */
  description: string;
  /** Plugin author */
  author?: string;
  /** Plugin license */
  license?: string;

  /** Custom failure source adapters */
  failureSources?: FailureSourceAdapter[];
  /** Custom metric collectors */
  statusMetrics?: MetricCollector[];
  /** Skill definitions to register */
  skills?: SkillDefinition[];
  /** Agent definitions to register */
  agents?: AgentDefinition[];
  /** Event hooks */
  hooks?: Partial<Record<HookEvent, HookHandler>>;
  /** Workflow templates */
  workflows?: WorkflowTemplate[];

  /** Called when plugin is loaded */
  onLoad?: () => Promise<void>;
  /** Called when plugin is unloaded */
  onUnload?: () => Promise<void>;
}

/**
 * Plugin registry — manages loaded plugins
 */
export interface PluginRegistry {
  register(plugin: CodingEnginePlugin): Promise<void>;
  unregister(pluginName: string): Promise<void>;
  getPlugin(name: string): CodingEnginePlugin | undefined;
  listPlugins(): CodingEnginePlugin[];
  getSkills(): SkillDefinition[];
  getAgents(): AgentDefinition[];
  getHooks(event: HookEvent): HookHandler[];
}

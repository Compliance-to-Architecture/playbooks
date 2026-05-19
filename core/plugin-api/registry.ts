/**
 * Coding Engine — Plugin Registry
 *
 * Manages plugin lifecycle: loading, registration, hook dispatch.
 */

import { strict as assert } from "node:assert";
import type {
  CodingEnginePlugin,
  PluginRegistry as IPluginRegistry,
  SkillDefinition,
  AgentDefinition,
  HookEvent,
  HookHandler,
  HookContext,
  HookResult,
} from "../types/plugin-types";

export class PluginRegistry implements IPluginRegistry {
  private plugins: Map<string, CodingEnginePlugin> = new Map();

  async register(plugin: CodingEnginePlugin): Promise<void> {
    assert(
      typeof plugin.name === "string" && plugin.name.length > 0,
      "plugin.name must be a non-empty string",
    );
    assert(
      typeof plugin.version === "string" && plugin.version.length > 0,
      "plugin.version must be a non-empty string",
    );
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin "${plugin.name}" is already registered`);
    }

    // Call onLoad lifecycle hook
    if (plugin.onLoad) {
      await plugin.onLoad();
    }

    this.plugins.set(plugin.name, plugin);
    console.log(`Plugin registered: ${plugin.name} v${plugin.version}`);
  }

  async unregister(pluginName: string): Promise<void> {
    assert(
      typeof pluginName === "string" && pluginName.length > 0,
      "pluginName must be a non-empty string",
    );
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      throw new Error(`Plugin "${pluginName}" is not registered`);
    }

    // Call onUnload lifecycle hook
    if (plugin.onUnload) {
      await plugin.onUnload();
    }

    this.plugins.delete(pluginName);
    console.log(`Plugin unregistered: ${pluginName}`);
  }

  getPlugin(name: string): CodingEnginePlugin | undefined {
    assert(
      typeof name === "string" && name.length > 0,
      "name must be a non-empty string",
    );
    return this.plugins.get(name);
  }

  listPlugins(): CodingEnginePlugin[] {
    const result = Array.from(this.plugins.values());
    assert(result.length <= 10000, "registered plugins must not exceed 10000");
    return result;
  }

  getSkills(): SkillDefinition[] {
    const skills: SkillDefinition[] = [];
    for (const plugin of this.plugins.values()) {
      if (plugin.skills) {
        skills.push(...plugin.skills);
      }
    }
    assert(skills.length <= 100000, "aggregated skills must not exceed 100000");
    return skills;
  }

  getAgents(): AgentDefinition[] {
    const agents: AgentDefinition[] = [];
    for (const plugin of this.plugins.values()) {
      if (plugin.agents) {
        agents.push(...plugin.agents);
      }
    }
    assert(agents.length <= 100000, "aggregated agents must not exceed 100000");
    return agents;
  }

  getHooks(event: HookEvent): HookHandler[] {
    assert(
      typeof event === "string" && event.length > 0,
      "event must be a non-empty string",
    );
    const handlers: HookHandler[] = [];
    for (const plugin of this.plugins.values()) {
      if (plugin.hooks?.[event]) {
        handlers.push(plugin.hooks[event]!);
      }
    }
    assert(handlers.length <= 10000, "hook handlers must not exceed 10000");
    return handlers;
  }

  /**
   * Dispatch an event to all registered hook handlers
   */
  async dispatch(event: HookEvent, context: HookContext): Promise<HookResult> {
    assert(
      typeof event === "string" && event.length > 0,
      "event must be a non-empty string",
    );
    assert(
      context !== null && context !== undefined,
      "context must not be null",
    );
    const handlers = this.getHooks(event);
    let proceed = true;
    const allSuggestions: string[] = [];
    const allMessages: string[] = [];

    for (const handler of handlers) {
      try {
        const result = await handler(context);
        if (!result.proceed) {
          proceed = false;
          if (result.message) allMessages.push(result.message);
        }
        if (result.suggestions) {
          allSuggestions.push(...result.suggestions);
        }
      } catch (error) {
        console.error(`Hook handler error in event "${event}":`, error);
        // Plugin errors should not block the engine
      }
    }

    return {
      proceed,
      message: allMessages.join("; "),
      suggestions: allSuggestions,
    };
  }
}

/**
 * Create a plugin from a simple configuration object.
 * Convenience factory for quick plugin creation.
 */
export function createPlugin(config: {
  name: string;
  version: string;
  description: string;
  skills?: SkillDefinition[];
  agents?: AgentDefinition[];
  hooks?: Partial<Record<HookEvent, HookHandler>>;
}): CodingEnginePlugin {
  assert(
    typeof config.name === "string" && config.name.length > 0,
    "config.name must be a non-empty string",
  );
  assert(
    typeof config.version === "string" && config.version.length > 0,
    "config.version must be a non-empty string",
  );
  const plugin: CodingEnginePlugin = {
    name: config.name,
    version: config.version,
    description: config.description,
    skills: config.skills,
    agents: config.agents,
    hooks: config.hooks,
  };
  assert(
    typeof plugin.name === "string" && plugin.name.length > 0,
    "created plugin.name must be non-empty",
  );
  return plugin;
}

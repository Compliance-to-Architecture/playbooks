/**
 * Type declarations for @utcp/code-mode
 *
 * Optional dependency — loaded dynamically at runtime.
 * @see https://github.com/universal-tool-calling-protocol/code-mode
 */
declare module "@utcp/code-mode" {
  export class CodeModeUtcpClient {
    static create(
      root_dir?: string,
      config?: unknown,
    ): Promise<CodeModeUtcpClient>;
    static AGENT_PROMPT_TEMPLATE: string;

    callToolChain(
      code: string,
      timeout?: number,
    ): Promise<{ result: unknown; logs: string[] }>;
    getAllToolsTypeScriptInterfaces(): string;
    registerManual(config: {
      name: string;
      call_template_type: "mcp" | "http" | "file" | "cli";
      config?: unknown;
      file_path?: string;
      env?: Record<string, string>;
    }): Promise<void>;
    searchTools(
      query: string,
    ): Promise<Array<{ name: string; description: string }>>;
  }
}

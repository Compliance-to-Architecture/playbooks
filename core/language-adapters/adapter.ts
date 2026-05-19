/**
 * Coding Engine — Language Adapter Interface
 *
 * Abstracts language-specific operations so the engine works with
 * TypeScript, Python, Go, Rust, Java, and polyglot monorepos.
 */

export interface LanguageAdapter {
  /** Adapter name */
  name: string;
  /** Language identifier */
  language: string;
  /** File extensions handled by this adapter */
  extensions: string[];

  /** Install dependencies */
  install(): string;
  /** Build the project */
  build(): string;
  /** Run tests */
  test(): string;
  /** Run linter */
  lint(): string;
  /** Run formatter check */
  formatCheck(): string;
  /** Run formatter fix */
  formatFix(): string;
  /** Run type checker */
  typeCheck(): string;
  /** Run dev server */
  dev(): string;

  /** Count source files */
  countSourceFiles(): string;
  /** Count lines of code */
  countLines(): string;
}

export const TypeScriptPnpmAdapter: LanguageAdapter = {
  name: "typescript-pnpm",
  language: "typescript",
  extensions: [".ts", ".tsx", ".js", ".jsx"],
  install: () => "pnpm install --frozen-lockfile",
  build: () => "pnpm build",
  test: () => "pnpm test",
  lint: () => "pnpm lint",
  formatCheck: () => "pnpm format:check",
  formatFix: () =>
    'pnpm prettier --write "**/*.{ts,tsx,js,jsx,json,md,yaml,yml}"',
  typeCheck: () => "pnpm typecheck",
  dev: () => "pnpm dev",
  countSourceFiles: () =>
    'find . -name "*.ts" -o -name "*.tsx" | grep -v node_modules | wc -l',
  countLines: () =>
    'find . -name "*.ts" -o -name "*.tsx" | grep -v node_modules | xargs wc -l | tail -1',
};

export const TypeScriptNpmAdapter: LanguageAdapter = {
  ...TypeScriptPnpmAdapter,
  name: "typescript-npm",
  install: () => "npm ci",
  build: () => "npm run build",
  test: () => "npm test",
  lint: () => "npm run lint",
  formatCheck: () => "npm run format:check",
  formatFix: () =>
    'npx prettier --write "**/*.{ts,tsx,js,jsx,json,md,yaml,yml}"',
  typeCheck: () => "npm run typecheck",
  dev: () => "npm run dev",
};

export const PythonPoetryAdapter: LanguageAdapter = {
  name: "python-poetry",
  language: "python",
  extensions: [".py"],
  install: () => "poetry install",
  build: () => "poetry build",
  test: () => "poetry run pytest",
  lint: () => "poetry run ruff check .",
  formatCheck: () => "poetry run ruff format --check .",
  formatFix: () => "poetry run ruff format .",
  typeCheck: () => "poetry run mypy .",
  dev: () => "poetry run uvicorn main:app --reload",
  countSourceFiles: () => 'find . -name "*.py" | grep -v __pycache__ | wc -l',
  countLines: () =>
    'find . -name "*.py" | grep -v __pycache__ | xargs wc -l | tail -1',
};

export const PythonUvAdapter: LanguageAdapter = {
  ...PythonPoetryAdapter,
  name: "python-uv",
  install: () => "uv sync",
  build: () => "uv build",
  test: () => "uv run pytest",
  lint: () => "uv run ruff check .",
  formatCheck: () => "uv run ruff format --check .",
  formatFix: () => "uv run ruff format .",
  typeCheck: () => "uv run mypy .",
  dev: () => "uv run uvicorn main:app --reload",
};

export const GoAdapter: LanguageAdapter = {
  name: "go-modules",
  language: "go",
  extensions: [".go"],
  install: () => "go mod download",
  build: () => "go build ./...",
  test: () => "go test ./...",
  lint: () => "golangci-lint run",
  formatCheck: () => "gofmt -l .",
  formatFix: () => "gofmt -w .",
  typeCheck: () => "go vet ./...",
  dev: () => "go run main.go",
  countSourceFiles: () => 'find . -name "*.go" | wc -l',
  countLines: () => 'find . -name "*.go" | xargs wc -l | tail -1',
};

export const RustCargoAdapter: LanguageAdapter = {
  name: "rust-cargo",
  language: "rust",
  extensions: [".rs"],
  install: () => "cargo fetch",
  build: () => "cargo build --release",
  test: () => "cargo test",
  lint: () => "cargo clippy -- -D warnings",
  formatCheck: () => "cargo fmt -- --check",
  formatFix: () => "cargo fmt",
  typeCheck: () => "cargo check",
  dev: () => "cargo run",
  countSourceFiles: () => 'find . -name "*.rs" | wc -l',
  countLines: () => 'find . -name "*.rs" | xargs wc -l | tail -1',
};

export const JavaGradleAdapter: LanguageAdapter = {
  name: "java-gradle",
  language: "java",
  extensions: [".java", ".kt"],
  install: () => "./gradlew dependencies",
  build: () => "./gradlew build",
  test: () => "./gradlew test",
  lint: () => "./gradlew checkstyleMain",
  formatCheck: () => "./gradlew spotlessCheck",
  formatFix: () => "./gradlew spotlessApply",
  typeCheck: () => "./gradlew compileJava",
  dev: () => "./gradlew bootRun",
  countSourceFiles: () => 'find . -name "*.java" -o -name "*.kt" | wc -l',
  countLines: () =>
    'find . -name "*.java" -o -name "*.kt" | xargs wc -l | tail -1',
};

/**
 * Get the adapter for a given language and package manager
 */
export function getAdapter(
  language: string,
  packageManager?: string,
): LanguageAdapter {
  const adapters: Record<string, LanguageAdapter> = {
    "typescript-pnpm": TypeScriptPnpmAdapter,
    "typescript-npm": TypeScriptNpmAdapter,
    "python-poetry": PythonPoetryAdapter,
    "python-uv": PythonUvAdapter,
    "go-modules": GoAdapter,
    "rust-cargo": RustCargoAdapter,
    "java-gradle": JavaGradleAdapter,
  };

  const key = packageManager ? `${language}-${packageManager}` : language;

  // Try exact match first
  if (adapters[key]) return adapters[key];

  // Try language-only match
  for (const [name, adapter] of Object.entries(adapters)) {
    if (name.startsWith(language)) return adapter;
  }

  // Default to TypeScript/pnpm
  return TypeScriptPnpmAdapter;
}

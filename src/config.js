import { existsSync } from "fs";
import { join, resolve } from "path";
import { homedir } from "os";
import { config as loadDotenv } from "dotenv";

const DEFAULT_MODELS = {
  openai: "gpt-4o",
  anthropic: "claude-sonnet-4-5",
  "openai-compat": "local-model",
};

const DEFAULT_TEST_OUTPUT_DIR = "test-out";

/**
 * The global user-level config directory, following the XDG Base Directory
 * Specification. Users set their API keys here once and every project picks
 * them up automatically — no need to copy .env files between projects.
 *
 * Respects $XDG_CONFIG_HOME when set; otherwise defaults to ~/.config/wish.
 */
function globalConfigDir() {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.startsWith("/") ? xdg : join(homedir(), ".config");
  return join(base, "wish");
}

/**
 * Loads configuration from .env files and CLI overrides.
 *
 * Resolution order (highest → lowest priority):
 *   1. CLI flags
 *   2. Shell environment variables
 *   3. Per-project  <projectDir>/.env
 *   4. Per-project  <projectDir>/.env.local
 *   5. Global       ~/.config/wish/.env   ← set API keys here once
 *
 * The global config is loaded first so that per-project files can override
 * individual values while inheriting everything else (e.g. the API key).
 *
 * @param {string} projectDir
 * @param {Object} cliOverrides
 */
export function loadConfig(projectDir, cliOverrides = {}) {
  const absProjectDir = resolve(projectDir);

  // Load global config first (lowest priority) so per-project values win.
  const globalEnv = join(globalConfigDir(), ".env");
  if (existsSync(globalEnv)) {
    loadDotenv({ path: globalEnv });
  }

  // Per-project files are loaded in order; the first one found wins.
  // Because dotenv skips keys that are already set, loading global first and
  // project second means project values naturally take precedence.
  const projectCandidates = [
    join(absProjectDir, ".env.local"),
    join(absProjectDir, ".env"),
  ];

  for (const envFile of projectCandidates) {
    if (existsSync(envFile)) {
      loadDotenv({ path: envFile, override: true });
      break;
    }
  }

  const provider =
    cliOverrides.provider || process.env.WISH_PROVIDER || detectProvider();

  const model =
    cliOverrides.model || process.env.WISH_MODEL || DEFAULT_MODELS[provider];

  if (!model) {
    throw new Error(
      `No default model known for provider "${provider}". Pass --model explicitly.`,
    );
  }

  const outputDir = cliOverrides.output || process.env.WISH_OUTPUT_DIR || "out";

  // Retries for tests and fixes and syntactic loops
  const rawRetries = cliOverrides.retries ?? process.env.WISH_RETRIES;
  const retries = rawRetries !== undefined ? parseInt(String(rawRetries), 10) : 3;

  // Base URL — used by the openai-compat provider.
  const baseUrl = cliOverrides.baseUrl || process.env.WISH_BASE_URL;

  if (requiresBaseUrl(provider) && !baseUrl) {
    throw new Error(
      'Provider "openai-compat" requires a base URL.\n' +
        "Set WISH_BASE_URL in your global config or project .env, or pass --base-url.",
    );
  }

  // API key for OpenAI-compatible servers.
  const apiKey =
    cliOverrides.apiKey ||
    process.env.WISH_API_KEY ||
    process.env.OPENAI_API_KEY ||
    "local";

  return {
    provider,
    model,
    outputDir,
    retries,
    baseUrl,
    apiKey,
    openaiApiKey: process.env.OPENAI_API_KEY,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  };
}

/**
 * Returns the path to the global config file.
 * Useful for printing "set your API key here" messages.
 *
 * @returns {string}
 */
export function globalConfigPath() {
  return join(globalConfigDir(), ".env");
}

/**
 * Returns true for providers that require an explicit base URL.
 *
 * @param {string} provider
 * @returns {boolean}
 */
function requiresBaseUrl(provider) {
  return provider === "openai-compat";
}

/**
 * Returns a human-friendly label for the active LLM.
 *
 * For cloud providers ("anthropic", "openai") the brand name is recognisable
 * and meaningful on its own. For "openai-compat" the provider name is opaque —
 * the model identifier is far more useful to display.
 *
 * @param {{ provider: string, model: string }} config
 * @returns {string}
 */
export function providerLabel(config) {
  return config.provider === "openai-compat" ? config.model : config.provider;
}

/**
 * Infers the provider from whichever API key is present in the environment.
 * Throws a descriptive error when no provider can be determined.
 */
function detectProvider() {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";

  throw new Error(
    "No LLM provider configured.\n" +
      "\n" +
      "Quick setup — add your API key to the global Wish config:\n" +
      `  ${join(globalConfigDir(), ".env")}\n` +
      "\n" +
      "Example:\n" +
      "  ANTHROPIC_API_KEY=sk-ant-...\n" +
      "  # or\n" +
      "  OPENAI_API_KEY=sk-...\n" +
      "\n" +
      "For local models (LM Studio, Ollama, etc.):\n" +
      "  WISH_PROVIDER=openai-compat\n" +
      "  WISH_BASE_URL=http://localhost:1234/v1\n",
  );
}

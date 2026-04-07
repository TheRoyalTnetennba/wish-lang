import { createInterface } from "readline/promises";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import chalk from "chalk";
import { globalConfigPath } from "./config.js";

// ---------------------------------------------------------------------------
// Provider metadata
// ---------------------------------------------------------------------------

const PROVIDERS = ["anthropic", "openai", "openai-compat"];

const PROVIDER_LABELS = {
  anthropic: "Anthropic      (cloud, requires API key)",
  openai: "OpenAI         (cloud, requires API key)",
  "openai-compat":
    "OpenAI-compat  (any OpenAI-compatible endpoint — LM Studio, Ollama, etc.)",
};

const PROVIDER_KEY_VAR = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  "openai-compat": "WISH_API_KEY",
};

const PROVIDER_DEFAULT_MODEL = {
  anthropic: "claude-sonnet-4-5",
  openai: "gpt-4o",
  "openai-compat": "local-model",
};

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Main entry point for `wish setup`.
 *
 * Behaviour:
 *   --show                  Print current global config and exit.
 *   --provider / --key /    Apply flags directly (non-interactive).
 *   --model / --base-url
 *   (no flags)              Run the interactive configuration wizard.
 *
 * @param {Object} flags
 * @param {boolean} [flags.show]
 * @param {string}  [flags.provider]
 * @param {string}  [flags.key]
 * @param {string}  [flags.model]
 * @param {string}  [flags.baseUrl]
 */
export async function setup(flags = {}) {
  const configPath = globalConfigPath();

  if (flags.show) {
    showCurrent(configPath);
    return;
  }

  const hasFlags =
    flags.provider != null ||
    flags.key != null ||
    flags.model != null ||
    flags.baseUrl != null;

  if (hasFlags) {
    applyNonInteractive(flags, configPath);
  } else {
    await runInteractive(configPath);
  }
}

// ---------------------------------------------------------------------------
// Non-interactive mode
// ---------------------------------------------------------------------------

/**
 * Applies the provided CLI flags to the global config file without prompting.
 *
 * @param {Object} flags
 * @param {string} configPath
 */
function applyNonInteractive(flags, configPath) {
  const updates = {};

  if (flags.provider) {
    if (!PROVIDERS.includes(flags.provider)) {
      throw new Error(
        `Unknown provider "${flags.provider}". Valid options: ${PROVIDERS.join(", ")}.`,
      );
    }
    updates["WISH_PROVIDER"] = flags.provider;
  }

  if (flags.key != null) {
    // Resolve which env var to set from the provider.
    // Either the flag or whatever is already saved in the config file.
    const provider =
      flags.provider ?? readCurrentValues(configPath)["WISH_PROVIDER"];

    if (!provider) {
      throw new Error(
        "Pass --provider so Wish knows which key variable to set.\n" +
          "Example: wish setup --provider anthropic --key sk-ant-...",
      );
    }

    const keyVar = PROVIDER_KEY_VAR[provider];
    if (!keyVar) {
      throw new Error(
        `Provider "${provider}" is local and does not use an API key.`,
      );
    }

    updates[keyVar] = flags.key;
  }

  if (flags.model != null) {
    updates["WISH_MODEL"] = flags.model;
  }

  if (flags.baseUrl != null) {
    updates["WISH_BASE_URL"] = flags.baseUrl;
  }

  if (flags.retries != null) {
    updates["WISH_RETRIES"] = flags.retries;
  }

  patchEnvFile(configPath, updates);

  console.log("");
  for (const [key, value] of Object.entries(updates)) {
    const display = isSensitive(key) ? maskSecret(value) : value;
    console.log(chalk.green("  ✓ ") + chalk.dim(key + "=") + display);
  }
  console.log("");
  console.log(chalk.bold.green("✓  Saved to ") + chalk.dim(configPath));
  console.log("");
}

// ---------------------------------------------------------------------------
// Interactive mode
// ---------------------------------------------------------------------------

/**
 * Runs the step-by-step configuration wizard.
 *
 * @param {string} configPath
 */
async function runInteractive(configPath) {
  console.log("");
  console.log(chalk.bold("🙏  Wish Setup"));
  console.log("");
  console.log(chalk.dim("  Settings will be saved to:"));
  console.log(chalk.dim("  " + configPath));
  console.log("");

  const current = readCurrentValues(configPath);
  const currentProvider =
    current["WISH_PROVIDER"] ?? detectProviderFromKeys(current) ?? "anthropic";

  // ── Provider selection ────────────────────────────────────────────────────

  console.log("  Provider:");
  console.log("");
  PROVIDERS.forEach((p, i) => {
    const active = p === currentProvider;
    const marker = active ? chalk.cyan("❯") : " ";
    const label = active ? chalk.cyan(PROVIDER_LABELS[p]) : PROVIDER_LABELS[p];
    console.log(`  ${marker} ${chalk.dim(String(i + 1) + ")")} ${label}`);
  });
  console.log("");

  const currentIndex = PROVIDERS.indexOf(currentProvider) + 1;
  const providerInput = await ask(`  Enter number`, String(currentIndex));

  const providerIdx = parseInt(providerInput, 10) - 1;
  const provider =
    providerIdx >= 0 && providerIdx < PROVIDERS.length
      ? PROVIDERS[providerIdx]
      : currentProvider;

  console.log("");

  const updates = { WISH_PROVIDER: provider };

  // ── API key ───────────────────────────────────────────────────────────────

  const keyVar = PROVIDER_KEY_VAR[provider];

  if (keyVar) {
    const hasExisting = Boolean(current[keyVar]);
    const key = await readMasked(`  ${keyVar}`, hasExisting);
    if (key) {
      updates[keyVar] = key;
    }
    console.log("");
  }

  // ── Base URL (openai-compat only) ─────────────────────────────────────────

  if (provider === "openai-compat") {
    const currentUrl = current["WISH_BASE_URL"] ?? "";
    const url = await ask(
      "  Base URL",
      currentUrl || "http://localhost:8080/v1",
    );
    if (url) updates["WISH_BASE_URL"] = url;
    console.log("");
  }

  // ── Model override (optional) ─────────────────────────────────────────────

  const defaultModel = PROVIDER_DEFAULT_MODEL[provider] ?? "local-model";
  const currentModel = current["WISH_MODEL"] ?? "";

  const modelInput = await ask(
    `  Model ${chalk.dim("(Enter to use default: " + defaultModel + ")")}`,
    currentModel,
  );

  if (modelInput && modelInput !== defaultModel) {
    updates["WISH_MODEL"] = modelInput;
  }

  // ── Retries ───────────────────────────────────────────────────────────────

  const currentRetries = current["WISH_RETRIES"] ?? "";

  const retriesInput = await ask(
    `  Global retries ${chalk.dim("(Enter to use default: 3)")}`,
    currentRetries,
  );

  if (retriesInput && retriesInput !== "3") {
    updates["WISH_RETRIES"] = retriesInput;
  } else if (retriesInput === "3") {
    // Keep it clean if they typed 3 natively
    updates["WISH_RETRIES"] = "3";
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  patchEnvFile(configPath, updates);

  console.log("");
  console.log(chalk.bold.green("✓  Saved to ") + chalk.dim(configPath));
  console.log("");
}

// ---------------------------------------------------------------------------
// Show current config
// ---------------------------------------------------------------------------

/**
 * Prints the contents of the global config file to stdout (keys masked).
 *
 * @param {string} configPath
 */
function showCurrent(configPath) {
  console.log("");
  console.log(chalk.bold("🙏  Wish Configuration"));
  console.log("");
  console.log(chalk.dim("  " + configPath));
  console.log("");

  if (!existsSync(configPath)) {
    console.log(chalk.dim("  (file not found)"));
    console.log("");
    console.log(
      chalk.dim("  Run ") +
        chalk.cyan("wish setup") +
        chalk.dim(" to configure."),
    );
    console.log("");
    return;
  }

  const values = readCurrentValues(configPath);

  if (Object.keys(values).length === 0) {
    console.log(chalk.dim("  (no values set — all lines are comments)"));
    console.log("");
    return;
  }

  let maxLen = 0;
  for (const key of Object.keys(values)) {
    if (key.length > maxLen) maxLen = key.length;
  }

  for (const [key, value] of Object.entries(values)) {
    const display = isSensitive(key) ? maskSecret(value) : value;
    console.log("  " + chalk.dim(key.padEnd(maxLen + 2)) + display);
  }

  console.log("");
}

// ---------------------------------------------------------------------------
// Env file reading / patching
// ---------------------------------------------------------------------------

/**
 * Reads all active (non-commented) KEY=value pairs from an .env file.
 *
 * @param {string} configPath
 * @returns {Record<string, string>}
 */
function readCurrentValues(configPath) {
  if (!existsSync(configPath)) return {};

  const result = {};
  for (const line of readFileSync(configPath, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
    if (m) result[m[1]] = m[2].trim();
  }
  return result;
}

/**
 * Updates specific KEY=VALUE pairs in an .env file while preserving all
 * other content — comments, blank lines, ordering.
 *
 * Handles three cases per entry in `updates`:
 *   • Key is active (KEY=old)    → replace value in place
 *   • Key is commented (# KEY=)  → uncomment and set value
 *   • Key is absent              → append at end of file
 *
 * @param {string}                  filePath
 * @param {Record<string, string>}  updates   — keys with new values
 */
function patchEnvFile(filePath, updates) {
  mkdirSync(dirname(filePath), { recursive: true });

  const raw = existsSync(filePath) ? readFileSync(filePath, "utf-8") : "";
  const lines = raw.split("\n");
  const pending = new Map(Object.entries(updates).filter(([, v]) => v != null));

  const patched = lines.map((line) => {
    // Active: KEY=value
    const active = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)/);
    if (active && pending.has(active[1])) {
      const val = pending.get(active[1]);
      pending.delete(active[1]);
      return `${active[1]}=${val}`;
    }

    // Commented-out: # KEY=value  or  #KEY=value
    const commented = line.match(/^#\s*([A-Z_][A-Z0-9_]*)=(.*)/);
    if (commented && pending.has(commented[1])) {
      const val = pending.get(commented[1]);
      pending.delete(commented[1]);
      return `${commented[1]}=${val}`;
    }

    return line;
  });

  // Append keys that didn't exist anywhere in the file.
  for (const [key, value] of pending) {
    patched.push(`${key}=${value}`);
  }

  // Ensure single trailing newline.
  const content = patched.join("\n").replace(/\n+$/, "") + "\n";
  writeFileSync(filePath, content, "utf-8");
}

// ---------------------------------------------------------------------------
// Prompt helpers
// ---------------------------------------------------------------------------

/**
 * Prompts the user for text input, showing a default in brackets.
 * Returns the default when the user presses Enter without typing.
 *
 * @param {string} question
 * @param {string} [defaultValue]
 * @returns {Promise<string>}
 */
async function ask(question, defaultValue) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const suffix = defaultValue ? chalk.dim(` [${defaultValue}]`) + ": " : ": ";

  const raw = await rl.question(question + suffix);
  rl.close();
  return raw.trim() || defaultValue || "";
}

/**
 * Prompts for a secret value, printing `*` for each character typed.
 * Falls back to plain readline when stdin is not a TTY.
 *
 * @param {string}  label        — Label shown before the prompt.
 * @param {boolean} hasExisting  — When true, shows a "press Enter to keep" hint
 *                                 and returns "" if the user does so.
 * @returns {Promise<string>}
 */
function readMasked(label, hasExisting) {
  const hint = hasExisting
    ? chalk.dim(" [press Enter to keep current]") + ": "
    : ": ";

  process.stdout.write(label + hint);

  // ── Non-TTY fallback (e.g. piped input in scripts) ─────────────────────
  if (!process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin });
    return new Promise((resolve) => {
      rl.once("line", (line) => {
        rl.close();
        resolve(line.trim());
      });
    });
  }

  // ── TTY: raw mode with * masking ───────────────────────────────────────
  return new Promise((resolve) => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    let value = "";

    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
    };

    const onData = (ch) => {
      if (ch === "\r" || ch === "\n" || ch === "\u0004") {
        // Enter / Ctrl-D → submit
        cleanup();
        process.stdout.write("\n");
        resolve(value);
      } else if (ch === "\u0003") {
        // Ctrl-C → exit
        cleanup();
        process.stdout.write("\n");
        process.exit(0);
      } else if (ch === "\u007f" || ch === "\b") {
        // Backspace
        if (value.length > 0) {
          value = value.slice(0, -1);
          process.stdout.write("\b \b");
        }
      } else if (ch >= " ") {
        value += ch;
        process.stdout.write("*");
      }
    };

    process.stdin.on("data", onData);
  });
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Returns true for env var names that contain secret values and should be
 * masked in output.
 *
 * @param {string} key
 * @returns {boolean}
 */
function isSensitive(key) {
  return key.includes("KEY") || key.includes("SECRET") || key.includes("TOKEN");
}

/**
 * Masks a secret value, showing only the first 8 characters.
 * e.g. "sk-ant-api03-abc..." → "sk-ant-a…"
 *
 * @param {string} value
 * @returns {string}
 */
function maskSecret(value) {
  if (!value) return chalk.dim("(not set)");
  if (value.length <= 8) return "****";
  return value.slice(0, 8) + chalk.dim("…");
}

/**
 * Infers the likely provider from whichever API keys are present.
 *
 * @param {Record<string, string>} values
 * @returns {string|null}
 */
function detectProviderFromKeys(values) {
  if (values["ANTHROPIC_API_KEY"]) return "anthropic";
  if (values["OPENAI_API_KEY"]) return "openai";
  return null;
}

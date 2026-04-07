import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import chalk from "chalk";

const WISH_FILE_TEMPLATE = (name, description) => `\
@name ${name}

${description ?? "Describe what your program should do here."}
`;

const TEST_FILE_TEMPLATE = () => `\
Describe how your program should behave here.
When you run "wish test", the compiler will automatically translate these rules into a test suite and execute them.
`;

const ENV_EXAMPLE = `\
# Wish Language Configuration
# Copy this file to .env and fill in your API key.

# Cloud providers (pick one):
# WISH_PROVIDER=anthropic
# ANTHROPIC_API_KEY=sk-ant-...

# WISH_PROVIDER=openai
# OPENAI_API_KEY=sk-...

# Local providers (no API key needed):
# WISH_PROVIDER=openai-compat
# WISH_BASE_URL=http://localhost:1234/v1   # LM Studio
# WISH_BASE_URL=http://localhost:11434/v1  # Ollama
# WISH_MODEL=llama3.1
`;

/**
 * Converts an arbitrary string to kebab-case.
 * e.g. "My Cool App" → "my-cool-app", "myApp" → "my-app"
 *
 * @param {string} str
 * @returns {string}
 */
function toKebabCase(str) {
  return (
    str
      .trim()
      // Insert a hyphen before uppercase letters (camelCase → camel-case)
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      // Replace whitespace and underscores with hyphens
      .replace(/[\s_]+/g, "-")
      // Strip any characters that aren't alphanumeric or hyphens
      .replace(/[^a-zA-Z0-9-]/g, "")
      // Collapse multiple consecutive hyphens
      .replace(/-{2,}/g, "-")
      // Strip leading/trailing hyphens
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
  );
}

/**
 * Scaffolds a new Wish project.
 *
 * When a name is provided, a new subdirectory is created with that name.
 * When no name is provided, files are written into the current directory.
 *
 * Created files:
 *   <name>.🙏     — starter wish source file with @name pre-filled
 *   <name>.🧪     — starter wish test file
 *   .env.example  — minimal environment config template
 *
 * @param {string|undefined} rawName  - Project name as typed by the user (optional).
 * @param {string} [cwd=process.cwd()] - Base directory to create the project in.
 * @returns {string} Absolute path to the scaffolded project directory.
 */
export function scaffold(rawName, { description, cwd = process.cwd() } = {}) {
  const name = rawName ? toKebabCase(rawName) : "app";

  if (!name) {
    throw new Error(
      `Could not derive a valid project name from "${rawName}".\n` +
        "Use letters, numbers, hyphens, or spaces.",
    );
  }

  // If a name was given, create a subdirectory. Otherwise use cwd directly.
  const projectDir = rawName ? resolve(cwd, name) : resolve(cwd);

  if (rawName) {
    if (existsSync(projectDir)) {
      throw new Error(
        `Directory "${name}" already exists. Choose a different name or scaffold inside it manually.`,
      );
    }
    mkdirSync(projectDir, { recursive: true });
  }

  const wishFileName = `${name}.🙏`;
  const wishFilePath = join(projectDir, wishFileName);
  const testFileName = `${name}.🧪`;
  const testFilePath = join(projectDir, testFileName);
  const envExamplePath = join(projectDir, ".env.example");

  // Guard against overwriting existing files when scaffolding in cwd.
  if (existsSync(wishFilePath)) {
    throw new Error(
      `"${wishFileName}" already exists in ${projectDir}. Aborting to avoid overwriting it.`,
    );
  }

  writeFileSync(wishFilePath, WISH_FILE_TEMPLATE(name, description), "utf-8");
  writeFileSync(testFilePath, TEST_FILE_TEMPLATE(), "utf-8");
  writeFileSync(envExamplePath, ENV_EXAMPLE, "utf-8");

  // ── Output ─────────────────────────────────────────────────────────────────
  console.log("");
  console.log(chalk.bold("🙏  New Wish project created!"));
  console.log("");
  console.log(chalk.dim("  location  ") + projectDir);
  console.log(chalk.dim("  source    ") + wishFileName);
  console.log(chalk.dim("  tests     ") + testFileName);
  console.log("");
  console.log("  Next steps:");
  console.log("");

  if (rawName) {
    console.log(chalk.cyan(`  cd ${name}`));
  }

  console.log(chalk.dim("  # Add your API key to .env"));
  console.log("");
  console.log(
    chalk.cyan(
      `  # Edit ${wishFileName} — describe what your program should do`,
    ),
  );
  console.log("");
  console.log(chalk.cyan(`  wish run${rawName ? " ." : ""}`));
  console.log("");

  return projectDir;
}

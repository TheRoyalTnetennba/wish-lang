import { resolve, join } from "path";
import chalk from "chalk";
import { loadConfig, providerLabel } from "./config.js";
import { scanWishFiles, scanExistingOutput } from "./scanner.js";
import { parseWishFiles } from "./parser.js";
import { createProvider } from "./providers/index.js";
import { writeOutput } from "./writer.js";
import { isUpToDate, writeStamp } from "./staleness.js";

/**
 * Main compilation pipeline.
 *
 * Steps:
 *   1. Load configuration (env + CLI overrides)
 *   2. Scan the project directory for *.🙏 files
 *   3. Parse each wish file into structured data
 *   4. Scan the output directory for any previously generated files (update flow)
 *   5. Send everything to the configured LLM provider
 *   6. Validate and write the generated files to the output directory
 *
 * @param {string} projectDir    - Path to the directory containing *.🙏 files.
 * @param {Object} cliOverrides  - CLI flag values that override env / defaults.
 * @param {string}  [cliOverrides.output]   - Output directory name (default: "out").
 * @param {string}  [cliOverrides.provider] - LLM provider override.
 * @param {string}  [cliOverrides.model]    - Model override.
 * @param {boolean} [cliOverrides.force]    - Skip staleness check and always recompile.
 * @returns {Promise<string>} Absolute path to the output directory.
 */
export async function compile(projectDir, cliOverrides = {}) {
  const absProjectDir = resolve(projectDir);

  // ── 1. Configuration ────────────────────────────────────────────────────────
  const config = loadConfig(absProjectDir, cliOverrides);
  const outputDir = join(absProjectDir, config.outputDir);

  printHeader(config, absProjectDir, outputDir);

  // ── 2. Scan ─────────────────────────────────────────────────────────────────
  const rawFiles = await scanWishFiles(absProjectDir, config.outputDir);

  console.log(
    chalk.green(`  Found ${rawFiles.length} wish file(s):`),
    rawFiles.map((f) => chalk.bold(f.path)).join(", "),
    "\n",
  );

  // ── 2a. Staleness check ──────────────────────────────────────────────────────
  if (!cliOverrides.force && isUpToDate(rawFiles, outputDir)) {
    console.log(chalk.bold.green("✓  Already up to date."));
    console.log(
      chalk.dim("  (No 🙏 files have changed since the last compilation.)"),
    );
    console.log(chalk.dim("  Run with --force to recompile anyway.\n"));
    return outputDir;
  }

  // ── 3. Parse ─────────────────────────────────────────────────────────────────
  const parsedFiles = parseWishFiles(rawFiles);

  // ── 3a. Inject Boilerplate ───────────────────────────────────────────────────
  const { injectBoilerplate } = await import("./boilerplate.js");
  injectBoilerplate(outputDir, absProjectDir);

  // ── 4. Load existing output (update flow) ────────────────────────────────────
  const existingFiles = await scanExistingOutput(outputDir);

  // ── 5. Compile via LLM ───────────────────────────────────────────────────────
  const label = providerLabel(config);
  const labelStr =
    label === config.model
      ? chalk.bold(label)
      : `${chalk.bold(label)} (${chalk.dim(config.model)})`;
  step(`Compiling with ${labelStr}…`);

  const provider = createProvider(config);

  let result;
  try {
    result = await provider.compile(parsedFiles, existingFiles);
  } catch (err) {
    // Re-throw with a cleaner message that includes provider context.
    const errLabel =
      label === config.model ? label : `${label}/${config.model}`;
    throw new Error(`Compilation failed (${errLabel}): ${err.message}`);
  }

  // ── 6. Write output ──────────────────────────────────────────────────────────
  console.log("\n");
  step(
    `Writing ${result.files.length} file(s) to ${chalk.bold(config.outputDir + "/")}…`,
  );

  const written = writeOutput(outputDir, result.files);

  for (const filePath of written) {
    console.log(chalk.green(`  ✓  ${filePath}`));
  }

  // ── Done ─────────────────────────────────────────────────────────────────────
  console.log("");

  if (result.explanation) {
    console.log(chalk.dim(`  ${result.explanation}`));
    console.log("");
  }

  writeStamp(outputDir);

  console.log(chalk.bold.green("✓  Compilation complete!"));
  console.log("");
  console.log(
    chalk.dim("  To run:"),
    chalk.cyan(`cd ${config.outputDir} && npm start`),
    chalk.dim("  — or —"),
    chalk.cyan(`wish run ${projectDir === "." ? "" : projectDir}`).trim(),
  );
  console.log("");

  return outputDir;
}

// ── Private helpers ────────────────────────────────────────────────────────────

/**
 * Prints the compiler banner and session metadata.
 */
function printHeader(config, projectDir, outputDir) {
  console.log("");
  console.log(chalk.bold("🙏  Wish Compiler"));
  console.log("");
  console.log(chalk.dim("  project  ") + projectDir);
  console.log(chalk.dim("  output   ") + outputDir);
  const lbl = providerLabel(config);
  const providerStr = lbl === config.model ? lbl : `${lbl} / ${config.model}`;
  console.log(chalk.dim("  provider ") + providerStr);
  console.log("");
}

/**
 * Prints a cyan "step" label — used to show pipeline progress.
 *
 * @param {string} label
 */
function step(label) {
  console.log(chalk.cyan(`→  ${label}`));
}

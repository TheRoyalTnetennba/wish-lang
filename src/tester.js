import { resolve, join } from "path";
import { existsSync } from "fs";
import chalk from "chalk";
import { loadConfig, providerLabel } from "./config.js";
import { scanWishFiles, scanTestFiles, scanExistingOutput } from "./scanner.js";
import { parseWishFiles } from "./parser.js";
import { createProvider } from "./providers/index.js";
import { writeOutput } from "./writer.js";
import { isUpToDate, writeStamp } from "./staleness.js";
import { runTests } from "./runner.js";

/**
 * Main test pipeline.
 *
 * Steps:
 *   1. Load configuration (env + CLI overrides)
 *   2. Verify the source project has been compiled
 *   3. Scan for 🧪 test description files
 *   4. Scan for 🙏 source files (used for staleness check + LLM context)
 *   5. Check staleness against both sets of files
 *   6. Parse the test description files
 *   7. Load existing compiled source files (LLM context)
 *   8. Load previously generated test files (update flow)
 *   9. Send everything to the configured LLM provider
 *  10. Write the generated test files to the test output directory
 *  11. Run the test suite
 *
 * @param {string} projectDir   - Path to the directory containing *.🧪 and *.🙏 files.
 * @param {Object} cliOverrides - CLI flag values that override env / defaults.
 * @param {string}  [cliOverrides.output]     - Source output directory name (default: "out").
 * @param {string}  [cliOverrides.testOutput] - Test output directory name (default: "test-out").
 * @param {string}  [cliOverrides.provider]   - LLM provider override.
 * @param {string}  [cliOverrides.model]      - Model override.
 * @param {boolean} [cliOverrides.force]      - Skip staleness check and always recompile.
 * @returns {Promise<void>}
 */
export async function test(projectDir, cliOverrides = {}) {
  const absProjectDir = resolve(projectDir);
  const config = loadConfig(absProjectDir, cliOverrides);
  const outputDir = join(absProjectDir, config.outputDir);

  printHeader(config, absProjectDir, outputDir);

  // ── 1. Verify source has been compiled ──────────────────────────────────────
  if (!existsSync(outputDir)) {
    throw new Error(
      `Source output directory "${config.outputDir}" does not exist.\n` +
        'Run "wish compile" first to generate the source code before running tests.',
    );
  }

  // ── 2. Scan for 🧪 test files ───────────────────────────────────────────────
  const rawTestFiles = await scanTestFiles(absProjectDir, config.outputDir);

  console.log(
    chalk.green(`  Found ${rawTestFiles.length} test file(s):`),
    rawTestFiles.map((f) => chalk.bold(f.path)).join(", "),
    "\n",
  );

  // ── 3. Scan for 🙏 source files (for staleness + context) ───────────────────
  const rawWishFiles = await scanWishFiles(absProjectDir, config.outputDir);

  // ── 4. Staleness check ───────────────────────────────────────────────────────
  // Recompile if either test descriptions or source wish files have changed,
  // since the LLM generates tests with knowledge of the compiled source.
  if (
    !cliOverrides.force &&
    isUpToDate(
      [...rawTestFiles, ...rawWishFiles],
      outputDir,
      ".wish-test-stamp",
    )
  ) {
    console.log(chalk.bold.green("✓  Tests already up to date."));
    console.log(
      chalk.dim(
        "  (No 🧪 or 🙏 files have changed since the tests were last compiled.)",
      ),
    );
    console.log(chalk.dim("  Run with --force to recompile anyway.\n"));

    if (cliOverrides.skipRun) return;

    try {
      await runTests(outputDir);
    } catch (err) {
      console.log(chalk.dim("\n  Tests failed — running fix…"));
      const { fix } = await import("./fix.js");
      await fix(projectDir, cliOverrides);
    }
    return;
  }

  // ── 5. Parse test files ──────────────────────────────────────────────────────
  const parsedTestFiles = parseWishFiles(rawTestFiles);

  // ── 6 & 7. Load existing source and test output (LLM context & update flow) ─────
  const allOutputFiles = await scanExistingOutput(outputDir);

  const sourceFiles = allOutputFiles.filter(
    (f) => !f.path.endsWith(".test.js"),
  );
  const existingTestFiles = allOutputFiles.filter((f) =>
    f.path.endsWith(".test.js"),
  );

  // ── 8. Compile tests via LLM ─────────────────────────────────────────────────
  const label = providerLabel(config);
  const labelStr =
    label === config.model
      ? chalk.bold(label)
      : `${chalk.bold(label)} (${chalk.dim(config.model)})`;
  step(`Compiling tests with ${labelStr}…`);

  const provider = createProvider(config);

  let result;
  try {
    result = await provider.compileTests(
      parsedTestFiles,
      sourceFiles,
      existingTestFiles,
    );
  } catch (err) {
    const plainLabel =
      label === config.model ? label : `${label} (${config.model})`;
    throw new Error(`Test compilation failed (${plainLabel}): ${err.message}`);
  }

  console.log("\n");
  step(
    `Writing ${result.files.length} file(s) to ${chalk.bold(config.outputDir + "/")}…`,
  );

  const written = writeOutput(outputDir, result.files);

  for (const filePath of written) {
    console.log(chalk.green(`  ✓  ${filePath}`));
  }

  console.log("");

  if (result.explanation) {
    console.log(chalk.dim(`  ${result.explanation}`));
    console.log("");
  }

  writeStamp(outputDir, ".wish-test-stamp");

  console.log(chalk.bold.green("✓  Test compilation complete!\n"));

  if (cliOverrides.skipRun) return;

  // ── 11. Run tests ────────────────────────────────────────────────────────────
  try {
    await runTests(outputDir);
  } catch (err) {
    console.log(chalk.dim("\n  Tests failed — running fix…"));
    const { fix } = await import("./fix.js");
    await fix(projectDir, cliOverrides);
  }
}

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Prints the tester banner and session metadata.
 */
function printHeader(config, projectDir, outputDir) {
  console.log("");
  console.log(chalk.bold("🧪  Wish Tester"));
  console.log("");
  console.log(chalk.dim("  project    ") + projectDir);
  console.log(chalk.dim("  output     ") + outputDir);
  const lbl = providerLabel(config);
  const providerStr = lbl === config.model ? lbl : `${lbl} / ${config.model}`;
  console.log(chalk.dim("  provider   ") + providerStr);
  console.log("");
}

/**
 * Prints a cyan "step" label to show pipeline progress.
 *
 * @param {string} label
 */
function step(label) {
  console.log(chalk.cyan(`→  ${label}`));
}

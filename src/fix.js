import { resolve, join } from "path";
import { existsSync } from "fs";
import chalk from "chalk";
import { loadConfig, providerLabel } from "./config.js";
import { scanWishFiles, scanTestFiles, scanExistingOutput } from "./scanner.js";
import { parseWishFiles } from "./parser.js";
import { createProvider } from "./providers/index.js";
import { writeOutput } from "./writer.js";
import { runTestsWithCapture } from "./runner.js";
import { compile } from "./compiler.js";
import { test } from "./tester.js";

/**
 * Main fix pipeline.
 *
 * @param {string} projectDir
 * @param {Object} cliOverrides
 */
export async function fix(projectDir, cliOverrides = {}) {
  const absProjectDir = resolve(projectDir);
  const config = loadConfig(absProjectDir, cliOverrides);
  const outputDir = join(absProjectDir, config.outputDir);

  console.log("");
  console.log(chalk.bold("🛠️  Wish Fixer"));
  console.log("");
  console.log(chalk.dim("  project    ") + absProjectDir);
  console.log(chalk.dim("  output     ") + outputDir);
  const lbl = providerLabel(config);
  const providerStr = lbl === config.model ? lbl : `${lbl} / ${config.model}`;
  console.log(chalk.dim("  provider   ") + providerStr);
  console.log("");

  // 1. Ensure source and tests are compiled & up-to-date
  if (!existsSync(outputDir)) {
    console.log(chalk.yellow("→ Output missing. Compiling first..."));
    await compile(projectDir, cliOverrides);
  }
  // Automatically compiles tests if they are stale or missing (but stops before executing them to avoid infinite recursion)
  await test(projectDir, { ...cliOverrides, skipRun: true });

  const rawWishFiles = await scanWishFiles(absProjectDir, config.outputDir);
  const rawTestFiles = await scanTestFiles(absProjectDir, config.outputDir);

  const parsedWishFiles = parseWishFiles(rawWishFiles);
  const parsedTestFiles = parseWishFiles(rawTestFiles);

  const maxRetries = config.retries;
  let attempt = 1;

  while (attempt <= maxRetries) {
    console.log(
      chalk.cyan(`→ Running tests (attempt ${attempt}/${maxRetries})…`),
    );
    const testResult = await runTestsWithCapture(outputDir);

    if (testResult.success) {
      console.log(chalk.bold.green("✓  Tests passed! No fix needed."));
      console.log(chalk.dim("  Use `wish run` to execute your project."));
      return;
    }

    console.log(chalk.dim(`  Tests failed. Generating a fix…`));

    // Get current source code to patch
    const allOutputFiles = await scanExistingOutput(outputDir);
    const sourceFiles = allOutputFiles.filter(
      (f) => !f.path.endsWith(".test.js"),
    );
    const compiledTestFiles = allOutputFiles.filter((f) =>
      f.path.endsWith(".test.js"),
    );

    const provider = createProvider(config);
    let result;
    try {
      result = await provider.fix(
        parsedWishFiles,
        sourceFiles,
        parsedTestFiles,
        testResult.output,
        compiledTestFiles,
      );
    } catch (err) {
      throw new Error(
        `Fix compilation failed (${providerStr}): ${err.message}`,
      );
    }

    // Write new source files
    writeOutput(outputDir, result.files);

    if (result.explanation) {
      console.log(chalk.dim(`  ${result.explanation}\n`));
    }

    attempt++;
  }

  // Run one last check — the final patch may have fixed things
  const finalResult = await runTestsWithCapture(outputDir);
  if (finalResult.success) {
    console.log(chalk.bold.green("✓  Tests passed!"));
    console.log(chalk.dim("  Use `wish run` to execute your project."));
    return;
  }

  throw new Error(
    `Tests still failing after ${maxRetries} attempt${maxRetries === 1 ? "" : "s"}.\n\n` +
      `Last test output:\n${finalResult.output.slice(0, 2000)}\n\n` +
      `Run wish fix again, or check the output manually.`,
  );
}

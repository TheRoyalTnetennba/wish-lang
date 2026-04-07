import { readFileSync, existsSync } from "fs";
import { join, resolve, relative } from "path";
import { glob } from "glob";

const WISH_EXT = "🙏";
const TEST_EXT = "🧪";

/**
 * Scans a project directory for .🙏 files and returns their paths + contents.
 * @param {string} projectDir    - Absolute or relative path to the project root.
 * @param {string} outputDir     - Output dir name to exclude from the scan (e.g. "out").
 * @returns {Promise<Array<{ path: string, absPath: string, content: string }>>}
 */
export async function scanWishFiles(
  projectDir,
  outputDir = "out",
) {
  const absDir = resolve(projectDir);

  const files = await glob(`**/*.${WISH_EXT}`, {
    cwd: absDir,
    ignore: [
      "node_modules/**",
      `${outputDir}/**`,
      ".git/**",
    ],
    dot: false,
  });

  if (files.length === 0) {
    throw new Error(
      `No ${WISH_EXT} files found in "${absDir}".\n` +
        `Create a file with the .${WISH_EXT} extension containing natural language instructions.`,
    );
  }

  // Sort for deterministic ordering
  files.sort();

  return files.map((relPath) => {
    const absPath = join(absDir, relPath);
    const content = readFileSync(absPath, "utf-8");
    return { path: relPath, absPath, content };
  });
}

/**
 * Scans a project directory for .🧪 test description files.
 *
 * @param {string} projectDir    - Absolute or relative path to the project root.
 * @param {string} outputDir     - Output dir name to exclude (e.g. "out").
 * @returns {Promise<Array<{ path: string, absPath: string, content: string }>>}
 */
export async function scanTestFiles(
  projectDir,
  outputDir = "out",
) {
  const absDir = resolve(projectDir);

  const files = await glob(`**/*.${TEST_EXT}`, {
    cwd: absDir,
    ignore: [
      "node_modules/**",
      `${outputDir}/**`,
      ".git/**",
    ],
    dot: false,
  });

  if (files.length === 0) {
    throw new Error(
      `No ${TEST_EXT} files found in "${absDir}".\n` +
        `Create a file with the .${TEST_EXT} extension describing how your program should behave.`,
    );
  }

  files.sort();

  return files.map((relPath) => {
    const absPath = join(absDir, relPath);
    const content = readFileSync(absPath, "utf-8");
    return { path: relPath, absPath, content };
  });
}

/**
 * Scans the output directory for previously generated files.
 * Used by the update flow so the LLM can see what already exists.
 * @param {string} outputDir - Absolute path to the output directory.
 * @returns {Promise<Array<{ path: string, content: string }>>}
 */
export async function scanExistingOutput(outputDir) {
  if (!existsSync(outputDir)) return [];

  const files = await glob("**/*", {
    cwd: outputDir,
    ignore: ["node_modules/**"],
    nodir: true,
  });

  files.sort();

  return files.flatMap((relPath) => {
    const absPath = join(outputDir, relPath);
    try {
      const content = readFileSync(absPath, "utf-8");
      return [{ path: relPath, content }];
    } catch {
      // Skip unreadable files (e.g. binaries)
      return [];
    }
  });
}

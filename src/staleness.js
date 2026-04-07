import { existsSync, statSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

/**
 * Checks whether the output directory is up to date with respect to the
 * given wish source files.
 *
 * Up-to-date means: the stamp file exists AND every wish file's last-modified
 * time is older than (or equal to) the stamp file's last-modified time.
 *
 * @param {Array<{ absPath: string }>} wishFiles - Scanned wish source files.
 * @param {string} outputDir - Absolute path to the output directory.
 * @param {string} stampFileName - The name of the stamp file to use.
 * @returns {boolean} true if recompilation can be skipped.
 */
export function isUpToDate(
  wishFiles,
  outputDir,
  stampFileName = ".wish-stamp",
) {
  const stampPath = join(outputDir, stampFileName);

  if (!existsSync(stampPath)) return false;

  const stampMtime = statSync(stampPath).mtimeMs;

  for (const file of wishFiles) {
    const wishMtime = statSync(file.absPath).mtimeMs;
    if (wishMtime > stampMtime) return false;
  }

  return true;
}

/**
 * Writes (or touches) the stamp file in the output directory, recording that
 * a successful compilation just completed.
 *
 * Creates the output directory if it does not yet exist.
 *
 * @param {string} outputDir - Absolute path to the output directory.
 * @param {string} stampFileName - The name of the stamp file to use.
 */
export function writeStamp(outputDir, stampFileName = ".wish-stamp") {
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, stampFileName), "", "utf-8");
}

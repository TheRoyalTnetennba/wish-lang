import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname, normalize, isAbsolute } from 'path';

/**
 * Writes LLM-generated files to the output directory.
 *
 * Each entry in `files` must have:
 *   - path    {string}  Relative path within the output directory
 *   - content {string}  File content
 *
 * Path traversal attempts (absolute paths, `..` segments) are rejected
 * so that a misbehaving LLM response can never write outside `outputDir`.
 *
 * @param {string} outputDir - Absolute path to the output directory.
 * @param {Array<{ path: string, content: string }>} files
 * @returns {string[]} List of relative paths that were written.
 */
export function writeOutput(outputDir, files) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('No files to write — the LLM returned an empty file list.');
  }

  const written = [];

  for (const file of files) {
    const safePath = resolveSafePath(outputDir, file.path);

    // Ensure parent directory exists
    mkdirSync(dirname(safePath), { recursive: true });

    // Normalise line endings to LF
    const content = typeof file.content === 'string'
      ? file.content.replace(/\r\n/g, '\n')
      : String(file.content ?? '');

    writeFileSync(safePath, content, 'utf-8');
    written.push(file.path);
  }

  return written;
}

/**
 * Resolves a relative file path against `outputDir` and rejects any path that
 * would escape the output directory.
 *
 * @param {string} outputDir
 * @param {string} filePath
 * @returns {string} Absolute safe path.
 */
function resolveSafePath(outputDir, filePath) {
  if (typeof filePath !== 'string' || filePath.trim() === '') {
    throw new Error(`Invalid file path from LLM: ${JSON.stringify(filePath)}`);
  }

  const normalised = normalize(filePath);

  if (isAbsolute(normalised)) {
    throw new Error(
      `LLM returned an absolute file path, which is not allowed: "${filePath}"`
    );
  }

  if (normalised.startsWith('..')) {
    throw new Error(
      `LLM returned a path that escapes the output directory: "${filePath}"`
    );
  }

  return join(outputDir, normalised);
}

/**
 * Parses a raw wish file into structured data.
 *
 * Wish file syntax:
 *   # This is a comment — ignored entirely.
 *
 *   @directive value   — metadata understood by the compiler
 *                        (e.g. @name, @version)
 *
 *   Everything else    — natural language instructions sent to the LLM.
 *
 * Supported directives:
 *   @name      <string>   Human-readable name for this wish unit
 *   @version   <semver>   Version hint for the generated package
 */

/**
 * @typedef {Object} ParsedWishFile
 * @property {string} path         - Relative path of the source file
 * @property {Record<string,string>} directives - Key/value pairs from @ lines
 * @property {string} instructions - Cleaned natural language instructions
 * @property {string} raw          - Original file content, unmodified
 */

/**
 * Parses a single wish file object as returned by the scanner.
 *
 * @param {{ path: string, content: string }} file
 * @returns {ParsedWishFile}
 */
export function parseWishFile({ path, content }) {
  const lines = content.split("\n");
  const directives = {};
  const instructionLines = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "") {
      // Preserve blank lines inside instruction blocks for readability
      instructionLines.push("");
      continue;
    }

    if (trimmed.startsWith("#")) {
      // Comment — discard entirely
      continue;
    }

    if (trimmed.startsWith("@")) {
      // Directive — @key rest-of-line
      const match = trimmed.match(/^@([a-zA-Z][a-zA-Z0-9_-]*)\s*(.*)/);
      if (match) {
        const key = match[1].toLowerCase();
        const value = match[2].trim();
        directives[key] = value;
      }
      // Malformed @ lines (no valid key) are silently ignored
      continue;
    }

    instructionLines.push(line);
  }

  const instructions = trimBlankLines(instructionLines).join("\n");

  if (!instructions) {
    throw new Error(
      `Wish file "${path}" contains no instructions.\n` +
        `Add at least one line of natural language describing what the program should do.`,
    );
  }

  return { path, directives, instructions, raw: content };
}

/**
 * Parses an array of raw wish file objects (as returned by the scanner).
 *
 * @param {Array<{ path: string, content: string }>} files
 * @returns {ParsedWishFile[]}
 */
export function parseWishFiles(files) {
  return files.map(parseWishFile);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Removes leading and trailing blank lines from an array of line strings,
 * while preserving internal blank lines.
 *
 * @param {string[]} lines
 * @returns {string[]}
 */
function trimBlankLines(lines) {
  let start = 0;
  while (start < lines.length && lines[start].trim() === "") start++;

  let end = lines.length - 1;
  while (end >= start && lines[end].trim() === "") end--;

  return lines.slice(start, end + 1);
}

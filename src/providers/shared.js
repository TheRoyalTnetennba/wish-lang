/**
 * Shared logic used by all LLM providers.
 *
 * Centralises:
 *   - The canonical Wish compiler system prompt
 *   - User message construction
 *   - JSON extraction / validation of the LLM response
 */

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

export const SYSTEM_PROMPT = `\
You are the Wish compiler — a non-deterministic compiler for the Wish programming language
that targets Node.js.

Wish files (*.🙏) contain natural language instructions describing what a Node.js program
should do. Your job is to translate those instructions into a complete, working Node.js project.

## Rules

- Generate idiomatic, modern Node.js strictly using ES Modules (import/export) and async/await. CommonJS (\`require()\`, \`module.exports\`) is explicitly FORBIDDEN.
- Use static, top-level \`import\` statements for all dependencies. Do NOT use dynamic imports (\`await import()\`) unless absolutely necessary for conditional execution.
- Always prefix native Node.js core modules with \`node:\` (e.g., \`import readline from 'node:readline';\`).
- Always include a package.json with:
    - A "name" field (kebab-case, derived from the instructions or the @name directive).
    - A "version" field (default "1.0.0", or the value of the @version directive).
    - A "type": "module" field.
    - A "start" script that runs the entry point with node.
    - A "test" script explicitly set to exactly: "node --test"
    - Any third-party npm packages the code requires listed under "dependencies".
- Choose a sensible entry file name (e.g. index.js) unless the instructions imply otherwise.
- Keep the generated code clean, minimal, and strictly focused on what the instructions describe.
- Do not add unrequested features.
- If existing generated files are provided, update only what the instructions require and
  preserve everything else.
- Use descriptive variable names and add a brief comment above any non-obvious logic.
- Never wrap your response in markdown fences or include any text outside the JSON object.

## Directives

Each wish file may contain optional @directive lines. Honour them when present:
  @name     <string>   Use as the package name (converted to kebab-case).
  @version  <semver>   Use as the package version.

## Response format

Respond ONLY with a single valid JSON object — no markdown, no prose before or after it.

{
  "files": [
    { "path": "relative/path/to/file.js", "content": "...complete file content..." }
  ],
  "explanation": "One sentence describing what was generated or updated."
}

Every entry in "files" must contain the full, complete content of that file as a plain string.
Never truncate or summarise file contents. The "files" array must include every file needed to
run the project, including package.json.`;

// ---------------------------------------------------------------------------
// User message builder
// ---------------------------------------------------------------------------

/**
 * Builds the user-turn message sent to any provider.
 *
 * Includes all parsed wish source files and, when present, the previously
 * generated output files so the LLM can perform targeted updates.
 *
 * @param {import('../parser.js').ParsedWishFile[]}      wishFiles
 * @param {Array<{ path: string, content: string }>}     existingFiles
 * @returns {string}
 */
export function buildUserMessage(wishFiles, existingFiles) {
  const parts = [];

  parts.push(
    "Compile the following Wish source files into a Node.js project:\n",
  );

  for (const file of wishFiles) {
    parts.push(section(`WISH SOURCE: ${file.path}`, formatWishFile(file)));
  }

  if (existingFiles.length > 0) {
    parts.push(
      "\nThe project was previously compiled. " +
        "The following files already exist — update them as needed to reflect " +
        "any changes in the wish files above, and leave everything else intact:\n",
    );

    for (const file of existingFiles) {
      parts.push(section(`EXISTING FILE: ${file.path}`, file.content));
    }
  }

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// JSON extraction
// ---------------------------------------------------------------------------

/**
 * Parses the LLM's raw text response into a structured object.
 *
 * Tries a direct JSON.parse first (fast path for well-behaved models), then
 * falls back to locating the outermost `{…}` block in case the model wrapped
 * its response in prose or markdown fences.
 *
 * @param {string} raw
 * @returns {unknown}
 */
export function extractJSON(raw) {
  // Fast path — model returned pure JSON.
  try {
    return JSON.parse(raw);
  } catch {
    // Fall through to extraction heuristic.
  }

  // Find the outermost { … } and try to parse it.
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error(
      "The model returned a response that contains no JSON object.\n" +
        `Response preview (first 500 chars):\n${raw.slice(0, 500)}`,
    );
  }

  const candidate = raw.slice(start, end + 1);

  try {
    return JSON.parse(candidate);
  } catch {
    // Fall through to sanitization.
  }

  // Some models emit literal newlines/tabs inside JSON string values, which
  // is invalid JSON. Sanitize and retry before giving up.
  try {
    return JSON.parse(sanitizeJSON(candidate));
  } catch (err) {
    throw new Error(
      `The model returned malformed JSON: ${err.message}\n` +
        `Candidate preview (first 500 chars):\n${candidate.slice(0, 500)}`,
    );
  }
}

/**
 * Escapes literal control characters (newline, carriage return, tab) that
 * appear inside JSON string values. Some models emit multi-line file content
 * with real newline characters rather than \\n escape sequences, producing
 * JSON that fails to parse despite being otherwise well-structured.
 *
 * Uses a simple state machine to track string/escape context so it never
 * corrupts already-valid escape sequences or non-string content.
 *
 * @param {string} raw
 * @returns {string}
 */
function sanitizeJSON(raw) {
  let result = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];

    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\" && inString) {
      result += ch;
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }

    if (inString) {
      if (ch === "\n") {
        result += "\\n";
        continue;
      }
      if (ch === "\r") {
        result += "\\r";
        continue;
      }
      if (ch === "\t") {
        result += "\\t";
        continue;
      }
    }

    result += ch;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Result validation
// ---------------------------------------------------------------------------

/**
 * Validates that the parsed LLM response matches the expected shape.
 * Throws a descriptive error on the first violation found.
 *
 * @param {unknown} result
 */
export function validateResult(result) {
  if (typeof result !== "object" || result === null) {
    throw new Error("LLM response is not a JSON object.");
  }

  if (!Array.isArray(result.files)) {
    throw new Error('LLM response is missing the "files" array.');
  }

  if (result.files.length === 0) {
    throw new Error(
      'LLM response contains an empty "files" array — no output was generated.',
    );
  }

  for (const [i, file] of result.files.entries()) {
    if (typeof file.path !== "string" || file.path.trim() === "") {
      throw new Error(`files[${i}].path is missing or empty.`);
    }
    if (typeof file.content !== "string") {
      throw new Error(
        `files[${i}].content is not a string (path: "${file.path}").`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Imagine prompt (used by --yolo)
// ---------------------------------------------------------------------------

export const IMAGINE_SYSTEM_PROMPT = `\
You are a wildly imaginative inventor of command-line Node.js applications.
Given an app name made of three random words, you dream up the most delightfully
unexpected, slightly absurd, but completely implementable thing it could possibly do.
Lean into the strange. Embrace the niche. The weirder and more specific the better —
as long as a real program could actually do it.`;

/**
 * Builds the user message asking the LLM to imagine an app concept from a name.
 *
 * @param {string} name - The generated kebab-case app name (e.g. "amber-fox-cipher").
 * @returns {string}
 */
export function buildImagineMessage(name) {
  return `App name: "${name}"

Invent a delightfully specific and unexpected command-line Node.js application with this name. \
The concept should feel surprising — maybe a little absurd — but the program itself must be \
genuinely implementable in a few files of Node.js. Avoid generic CRUD apps, todo lists, or \
weather fetchers. Think: niche tools, odd utilities, programs with personality.

Write 3–5 sentences describing what it does, what inputs it accepts, and what it outputs. \
Be concrete and specific — name the exact thing it measures, converts, generates, or simulates.

Respond with only the specification text, written in the imperative style. \
No title, no preamble, no markdown, no quotes.`;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Formats a parsed wish file for inclusion in the prompt.
 * Renders the directives block (if any) followed by the instructions.
 *
 * @param {import('../parser.js').ParsedWishFile} file
 * @returns {string}
 */
function formatWishFile(file) {
  const lines = [];

  const keys = Object.keys(file.directives);
  if (keys.length > 0) {
    lines.push("[Directives]");
    for (const key of keys) {
      lines.push(`  @${key} ${file.directives[key]}`);
    }
    lines.push("");
  }

  lines.push("[Instructions]");
  lines.push(file.instructions);

  return lines.join("\n");
}

/**
 * Wraps content in a labelled delimiter block for clear sectioning.
 *
 * @param {string} label
 * @param {string} content
 * @returns {string}
 */
function section(label, content) {
  const bar = "─".repeat(60);
  return `${bar}\n${label}\n${bar}\n${content}\n`;
}

// ---------------------------------------------------------------------------
// Test system prompt
// ---------------------------------------------------------------------------

export const TEST_SYSTEM_PROMPT = `\
You are the Wish test compiler — a non-deterministic compiler for the Wish programming language.

🧪 files contain natural language descriptions of how a Node.js program should behave.
Your job is to generate a test suite that verifies that behavior against the compiled source.

## Rules

- Your response must contain ONLY test files (*.test.js). Do NOT include source implementation
  files (e.g. index.js) in your response. The source files provided below are read-only context
  so you know what to import — you must not regenerate or modify them.
- Use Node.js built-in test runner (node:test) and the assert module. Do not use Jest or Vitest.
- You do NOT need to update or include package.json in your response unless you specifically need to add a brand new third-party dependency specifically for testing logic.
- Test files are placed in the exact same directory alongside the source code.
  Import source modules using relative paths within the same folder (e.g. import { foo } from './index.js').
  The source code uses strict ES Modules. CommonJS (\`require()\`, \`module.exports\`) is explicitly FORBIDDEN in both source and test files.
  For command-line programs, run them as subprocesses using node:child_process and check
  their stdout, stderr, and exit code.
- When capturing subprocess stdout or stderr, always strip ANSI escape codes before
  making string assertions. Compiled programs may use terminal colour libraries (chalk,
  etc.). Use this helper at the top of every test file that spawns a subprocess:
    const stripAnsi = (s) => s.replace(/\x1B\[[0-9;]*[mGKHFJ]/g, '');
  Then wrap captured output: stripAnsi(stdout).trim()
- Write one test file per 🧪 source file unless grouping makes more sense.
- Name test files with the pattern <name>.test.js.
- Focus on observable behavior: outputs, return values, exit codes — not implementation details.
- Each test should be self-contained and must not depend on any other test.
- If existing test files are provided, update only what has changed and leave the rest intact.
- Never include markdown fences or text outside the JSON response.

## Response format

Respond ONLY with a single valid JSON object:

{
  "files": [
    { "path": "relative/path/to/file.test.js", "content": "...complete file content..." }
  ],
  "explanation": "One sentence describing what was generated or updated."
}`;

// ---------------------------------------------------------------------------
// Test user message builder
// ---------------------------------------------------------------------------

/**
 * Builds the user-turn message for test compilation.
 *
 * Includes the 🧪 test description files, the compiled source files (so the
 * LLM knows what imports and entry points are available), and any previously
 * generated test files for the update flow.
 *
 * @param {import('../parser.js').ParsedWishFile[]}      testFiles
 * @param {Array<{ path: string, content: string }>}     sourceFiles
 * @param {Array<{ path: string, content: string }>}     existingTestFiles
 * @returns {string}
 */
export function buildTestUserMessage(
  testFiles,
  sourceFiles,
  existingTestFiles,
) {
  const parts = [];

  parts.push(
    "Generate a test suite for the following Node.js project.\n" +
      "Place the test files in the same directory alongside the source.\n",
  );

  for (const file of testFiles) {
    parts.push(section(`TEST DESCRIPTION: ${file.path}`, formatWishFile(file)));
  }

  if (sourceFiles.length > 0) {
    parts.push("\nThe following source files are available to test:\n");
    for (const file of sourceFiles) {
      parts.push(section(`SOURCE FILE: ${file.path}`, file.content));
    }
  }

  if (existingTestFiles.length > 0) {
    parts.push(
      "\nThe test suite was previously compiled. " +
        "Update the following files as needed to match the current descriptions:\n",
    );
    for (const file of existingTestFiles) {
      parts.push(section(`EXISTING TEST FILE: ${file.path}`, file.content));
    }
  }

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Fix user message builder
// ---------------------------------------------------------------------------

export const FIX_SYSTEM_PROMPT = `\
You are an expert debugger for the Wish programming language.
A generated Node.js project has failed its test suite.

Your objective is to identify the root cause of the failure and output ONLY the updated, patched files required to fix the project.
The failure could be due to buggy application source code, or it could be due to overly rigid/incorrect test assertions. You must evaluate both and update either the source code, the test files, or both, so that all tests pass and faithfully implement the requested requirements.

## Rules
- Generate idiomatic, modern Node.js strictly using ES Modules (import/export) and async/await. CommonJS (\`require()\`, \`module.exports\`) is explicitly FORBIDDEN.
- Treat BOTH the existing source code and the existing tests as potentially flawed.
- If modifying tests, you MUST use Node.js built-in test runner (node:test) and the assert module. Do not use Jest or Vitest.
- Maintain the overall structure. Do not randomly erase dependencies from package.json.
- Keep modifications clean and focused on resolving the specific test failure.
- Never wrap your response in markdown fences or include any text outside the JSON object.

## Response Format
You must respond with a SINGLE valid JSON object matching this schema exactly:
{
  "explanation": "Brief explanation of what was wrong (was it the source, the tests, or both?) and how you fixed it.",
  "files": [
    {
      "path": "path/to/file",
      "content": "the complete source code for the file"
    }
  ]
}
`;

/**
 * Builds the user-turn message for test-driven code fixation.
 *
 * Includes the original .🙏 instructions, the .🧪 test requirements, the existing
 * source code, and the error output produced by the failed test suite to guide
 * the LLM towards a fix.
 *
 * @param {import('../parser.js').ParsedWishFile[]} wishFiles
 * @param {Array<{ path: string, content: string }>} sourceFiles
 * @param {import('../parser.js').ParsedWishFile[]} testFiles
 * @param {string} testOutput
 * @returns {string}
 */
export function buildFixUserMessage(
  wishFiles,
  sourceFiles,
  testFiles,
  testOutput,
  compiledTestFiles = [],
) {
  const parts = [];

  parts.push(
    "The generated Node.js project has failed its test suite.\n" +
      "Your objective is to identify the root cause of the failure and fix either the source code, the test files, or both, so that everything passes.\n",
  );

  parts.push(section("TEST SUITE EXECUTION OUTPUT", testOutput));

  for (const file of wishFiles) {
    parts.push(
      section(
        `ORIGINAL SOURCE REQUIREMENT: ${file.path}`,
        formatWishFile(file),
      ),
    );
  }

  for (const file of testFiles) {
    parts.push(section(`TEST REQUIREMENT: ${file.path}`, formatWishFile(file)));
  }

  if (sourceFiles.length > 0) {
    parts.push(
      "\nBelow is the current failing source code. Update it to fix the test errors.\n",
    );
    for (const file of sourceFiles) {
      parts.push(section(`CURRENT SOURCE FILE: ${file.path}`, file.content));
    }
  }

  if (compiledTestFiles.length > 0) {
    parts.push(
      "\nBelow are the currently compiled test files. Update them if the test assertions are incorrect.\n",
    );
    for (const file of compiledTestFiles) {
      parts.push(section(`CURRENT TEST FILE: ${file.path}`, file.content));
    }
  }

  return parts.join("\n");
}

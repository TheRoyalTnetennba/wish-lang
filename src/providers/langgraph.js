import { START, END, StateGraph } from "@langchain/langgraph";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import { tmpdir } from "os";
import { join } from "path";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import {
  SYSTEM_PROMPT,
  IMAGINE_SYSTEM_PROMPT,
  TEST_SYSTEM_PROMPT,
  FIX_SYSTEM_PROMPT,
  buildUserMessage,
  buildImagineMessage,
  extractJSON,
  validateResult,
  buildTestUserMessage,
  buildFixUserMessage,
} from "./shared.js";

const execAsync = promisify(exec);

/**
 * Creates the appropriate LangChain model based on the config.
 */
function createModel(config) {
  const { provider, model, openaiApiKey, anthropicApiKey, baseUrl } = config;

  if (provider === "anthropic") {
    return new ChatAnthropic({
      model: model,
      anthropicApiKey: anthropicApiKey,
    });
  } else if (provider === "openai") {
    return new ChatOpenAI({
      model: model,
      openAIApiKey: openaiApiKey,
    });
  } else if (provider === "openai-compat") {
    return new ChatOpenAI({
      model: model,
      apiKey: config.apiKey || "not-needed",
      configuration: {
        baseURL: baseUrl,
      },
    });
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

const PLANNER_SYSTEM_PROMPT = `You are the architect and planner for a code generation compiler.
Your job is to read the user's specification and break the problem down into a clear, actionable plan.
You must also define a strict set of completion criteria that will be used by a QA bot to verify if the final code satisfies the specification.

Return ONLY a valid JSON object matching this schema:
{
  "steps": ["string", "string"],
  "criteria": ["string", "string"]
}
Include no markdown formatting outside the JSON object.`;

const TEST_PLANNER_SYSTEM_PROMPT = `You are the architect and planner for a test suite generator.
Your job is to read the test specifications and plan what test files need to be written.

IMPORTANT: The source implementation files already exist and are provided as read-only context.
They will NOT appear in the output. Your plan and criteria must concern ONLY the test files (*.test.js).

Return ONLY a valid JSON object matching this schema:
{
  "steps": ["string", "string"],
  "criteria": ["string", "string"]
}

Criteria must be test-focused only. Good examples:
- "A *.test.js file is present for each 🧪 description file"
- "Tests use node:test and assert/strict — no Jest or Vitest"
- "Tests verify observable behaviour described in the spec (outputs, exit codes, etc.)"
- "No source implementation files (e.g. index.js) are included in the response"

Include no markdown formatting outside the JSON object.`;

const FIX_PLANNER_SYSTEM_PROMPT = `You are the debugging strategist for a failing Node.js project.
Your job is to analyze the test failure output and the existing source and test files, then create a clear, targeted plan for fixing the issues.

IMPORTANT: Both the source code AND the test files may be incorrect. Evaluate both.

Return ONLY a valid JSON object matching this schema:
{
  "steps": ["string", "string"],
  "criteria": ["string", "string"]
}

Steps should describe the specific, targeted changes needed to resolve the test failures.
Criteria should be verifiable statements about the fixed output. Good examples:
- "All tests pass when run with node --test"
- "No CommonJS (require/module.exports) usage remains in any file"
- "The fix addresses the root cause rather than suppressing the symptom"
- "Only the minimum necessary files are modified"
Include no markdown formatting outside the JSON object.`;

const VERIFIER_SYSTEM_PROMPT = `You are the final output Verifier.
Read the generated code and check it against the predefined completion criteria.

If the code contains ANY CommonJS semantics like \`require(\` or \`module.exports\`, you MUST reply with exactly "REJECT:" followed by instructions to rewrite it into strict ES Modules.

If the code meets ALL criteria and works correctly based on your assessment, reply with exactly "ACCEPT".
If the code misses any criteria, took lazy shortcuts, or is incomplete, reply starting with exactly "REJECT:" followed by a clear string of feedback explaining what is missing and how the executor should fix it in the next iteration.`;

export class LangGraphProvider {
  constructor(config) {
    this.config = config;
    this.model = createModel(config);
  }

  async imagine(name) {
    const response = await this.model.invoke([
      new SystemMessage(IMAGINE_SYSTEM_PROMPT),
      new HumanMessage(buildImagineMessage(name)),
    ]);
    return response.content.trim();
  }

  async compile(wishFiles, existingFiles) {
    const userMessage = buildUserMessage(wishFiles, existingFiles);
    return this._runAgent(SYSTEM_PROMPT, userMessage);
  }

  async compileTests(testFiles, sourceFiles, existingTestFiles) {
    const userMessage = buildTestUserMessage(
      testFiles,
      sourceFiles,
      existingTestFiles,
    );
    return this._runAgent(
      TEST_SYSTEM_PROMPT,
      userMessage,
      TEST_PLANNER_SYSTEM_PROMPT,
    );
  }

  async fix(
    wishFiles,
    sourceFiles,
    testFiles,
    testOutput,
    compiledTestFiles = [],
  ) {
    const userMessage = buildFixUserMessage(
      wishFiles,
      sourceFiles,
      testFiles,
      testOutput,
      compiledTestFiles,
    );
    return this._runAgent(
      FIX_SYSTEM_PROMPT,
      userMessage,
      FIX_PLANNER_SYSTEM_PROMPT,
    );
  }

  async _runAgent(
    systemPrompt,
    userText,
    plannerPrompt = PLANNER_SYSTEM_PROMPT,
  ) {
    const graphState = {
      plan: {
        value: (x, y) => (y === undefined ? x : y),
        default: () => null,
      },
      finalResult: {
        value: (x, y) => (y === undefined ? x : y),
        default: () => null,
      },
      verificationFeedback: {
        value: (x, y) => (y === undefined ? x : y),
        default: () => null,
      },
      iterations: {
        value: (x, y) => x + y,
        default: () => 0,
      },
    };

    const plannerNode = async (state) => {
      const response = await this.model.invoke([
        new SystemMessage(plannerPrompt),
        new HumanMessage(userText),
      ]);

      const parsedPlan = extractJSON(response.content);
      return { plan: parsedPlan };
    };

    const executorNode = async (state) => {
      let prompt =
        userText +
        `\n\n=== IMPLEMENTATION PLAN ===\nSteps to follow:\n` +
        state.plan.steps.map((s) => `- ${s}`).join("\n");

      if (state.verificationFeedback) {
        prompt +=
          `\n\n=== PREVIOUS ATTEMPT FAILED ===\nFeedback from verifier:\n${state.verificationFeedback}\n` +
          `\nPlease revise the code to fix these issues. Ensure you output the COMPLETE set of files via JSON as before.`;
      }

      const response = await this.model.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(prompt),
      ]);

      const raw = response.content;
      let parsed;
      try {
        parsed = extractJSON(raw);
        validateResult(parsed);
      } catch (err) {
        return {
          verificationFeedback: `JSON Validation Error: ${err.message}`,
          finalResult: null,
          iterations: 1,
        };
      }

      return { finalResult: parsed, verificationFeedback: null, iterations: 1 };
    };

    const verifierNode = async (state) => {
      if (!state.finalResult) return {}; // skip if JSON failed

      // 1. Deterministic Syntax Check
      let tmpDir;
      try {
        tmpDir = await mkdtemp(join(tmpdir(), "wish-agent-"));
        let syntaxErrors = [];

        for (const file of state.finalResult.files) {
          if (file.path.endsWith(".js")) {
            if (
              file.content.includes("require(") ||
              file.content.includes("module.exports")
            ) {
              syntaxErrors.push(
                `Module error in ${file.path}: CommonJS is rigidly forbidden. You MUST use 'import' and 'export'.`,
              );
              continue; // Don't even bother syntax checking, we reject hard.
            }

            const filePath = join(
              tmpDir,
              file.path.replace(/[^a-zA-Z0-9.-]/g, "_"),
            );
            await writeFile(filePath, file.content);
            try {
              await execAsync(`node --check ${filePath}`);
            } catch (execErr) {
              syntaxErrors.push(
                `Syntax error in ${file.path}:\n${execErr.stderr}`,
              );
            }
          }
        }

        if (syntaxErrors.length > 0) {
          return {
            verificationFeedback: `Node syntax check failed:\n\n${syntaxErrors.join("\n")}`,
            finalResult: null,
          };
        }
      } catch (err) {
        // internal check loop errors
      } finally {
        if (tmpDir) {
          await rm(tmpDir, { recursive: true, force: true }).catch(() => null);
        }
      }

      // 2. Semantic Completion Criteria Check
      const codeContent = state.finalResult.files
        .map((f) => `// ${f.path}\n${f.content}`)
        .join("\n\n");

      const criteriaText = state.plan.criteria.map((c) => `- ${c}`).join("\n");
      const verificationPrompt = `COMPLETION CRITERIA:\n${criteriaText}\n\nGENERATED CODE:\n${codeContent}`;

      const response = await this.model.invoke([
        new SystemMessage(VERIFIER_SYSTEM_PROMPT),
        new HumanMessage(verificationPrompt),
      ]);

      const qaText = response.content.trim();

      if (qaText.startsWith("REJECT:")) {
        const feedback = qaText.substring(7).trim();
        return {
          verificationFeedback: `Completion criteria not fully met. Feedback: ${feedback}`,
          finalResult: null,
        };
      }

      return {}; // Accept
    };

    const routeFromExecutor = (state) => {
      if (!state.finalResult) {
        const maxIterations = this.config.retries ?? 3;
        if (state.iterations >= maxIterations) {
          throw new Error(
            `Agent hit JSON extraction cap after ${maxIterations} iterations. Feedback: ` +
              (state.verificationFeedback || ""),
          );
        }
        return "executor"; // parse failure
      }
      return "verifier";
    };

    const routeFromVerifier = (state) => {
      if (state.finalResult) {
        return END; // passed verification
      }
      const maxIterations = this.config.retries ?? 3;
      if (state.iterations >= maxIterations) {
        throw new Error(
          `Agent failed to reach completion criteria after ${maxIterations} iterations. Feedback: ` +
            (state.verificationFeedback || "no feedback provided"),
        );
      }
      return "executor"; // failed verification, loop back
    };

    const workflow = new StateGraph({ channels: graphState })
      .addNode("planner", plannerNode)
      .addNode("executor", executorNode)
      .addNode("verifier", verifierNode)
      .addEdge(START, "planner")
      .addEdge("planner", "executor")
      .addConditionalEdges("executor", routeFromExecutor)
      .addConditionalEdges("verifier", routeFromVerifier);

    const app = workflow.compile();
    const result = await app.invoke({});
    return result.finalResult;
  }
}

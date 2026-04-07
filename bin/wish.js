#!/usr/bin/env node

import { program } from "commander";
import chalk from "chalk";
import { compile } from "../src/compiler.js";
import { run } from "../src/runner.js";
import { scaffold } from "../src/scaffold.js";
import { pickName, imagineApp } from "../src/yolo.js";
import { test } from "../src/tester.js";
import { fix } from "../src/fix.js";
import { generate } from "../src/generator.js";
import { setup } from "../src/setup.js";
import { update } from "../src/update.js";

program
  .name("wish")
  .description(
    "🙏 Wish — a programming language compiled by an LLM, targeting Node.js",
  )
  .version("0.1.0");

program
  .command("compile [dir]")
  .description("Compile 🙏 files in a directory to a Node.js project")
  .option(
    "-o, --output <dir>",
    "Output directory (relative to source dir)",
    "out",
  )
  .option(
    "-p, --provider <name>",
    "LLM provider to use: openai | anthropic | openai-compat",
  )
  .option(
    "-m, --model <model>",
    "Specific model to use (overrides default for provider)",
  )
  .option("-f, --force", "Recompile even if output is already up to date")
  .option(
    "-b, --base-url <url>",
    "Base URL for an OpenAI-compatible API endpoint",
  )
  .option(
    "-r, --retries <number>",
    "Number of semantic retries during generation",
  )
  .action(async (dir = ".", options) => {
    try {
      await compile(dir, options);
    } catch (err) {
      console.error(chalk.red("\n✗ Compilation failed:"), err.message);
      process.exit(1);
    }
  });

program
  .command("run [dir]")
  .description("Compile 🙏 files and run the resulting Node.js project")
  .option(
    "-o, --output <dir>",
    "Output directory (relative to source dir)",
    "out",
  )
  .option(
    "-p, --provider <name>",
    "LLM provider to use: openai | anthropic | openai-compat",
  )
  .option(
    "-m, --model <model>",
    "Specific model to use (overrides default for provider)",
  )
  .option("-f, --force", "Recompile even if output is already up to date")
  .option(
    "-b, --base-url <url>",
    "Base URL for an OpenAI-compatible API endpoint",
  )
  .option(
    "-r, --retries <number>",
    "Number of semantic retries during generation",
  )
  .action(async (dir = ".", options) => {
    try {
      const outputDir = await compile(dir, options);
      await run(outputDir);
    } catch (err) {
      console.error(chalk.red("\n✗ Failed:"), err.message);
      process.exit(1);
    }
  });

program
  .command("test [dir]")
  .description("Compile 🧪 test files and run the generated test suite")
  .option(
    "-o, --output <dir>",
    "Output directory (relative to project dir)",
    "out",
  )
  .option(
    "-p, --provider <name>",
    "LLM provider to use: openai | anthropic | openai-compat",
  )
  .option(
    "-m, --model <model>",
    "Specific model to use (overrides default for provider)",
  )
  .option("-f, --force", "Recompile tests even if already up to date")
  .option(
    "-b, --base-url <url>",
    "Base URL for an OpenAI-compatible API endpoint",
  )
  .option(
    "-r, --retries <number>",
    "Number of semantic retries during generation",
  )
  .action(async (dir = ".", options) => {
    try {
      await test(dir, options);
    } catch (err) {
      console.error(chalk.red("\n✗ Tests failed:"), err.message);
      process.exit(1);
    }
  });

program
  .command("fix [dir]")
  .description("Identify why tests are failing and fix the generated code")
  .option(
    "-o, --output <dir>",
    "Output directory (relative to project dir)",
    "out",
  )
  .option(
    "-p, --provider <name>",
    "LLM provider to use: openai | anthropic | openai-compat",
  )
  .option(
    "-m, --model <model>",
    "Specific model to use (overrides default for provider)",
  )
  .option(
    "-b, --base-url <url>",
    "Base URL for an OpenAI-compatible API endpoint",
  )
  .option(
    "-r, --retries <number>",
    "Number of semantic retries during generation",
  )
  .action(async (dir = ".", options) => {
    try {
      await fix(dir, options);
    } catch (err) {
      console.error(chalk.red("\n✗ Fix attempt failed:"), err.message);
      process.exit(1);
    }
  });

program
  .command("add <name>")
  .alias("g")
  .description(
    "Generate a 🙏 wish file (or a 🧪 test file with --test) in the current directory",
  )
  .option("-t, --test", "Generate a 🧪 test file instead of a 🙏 wish file")
  .action((name, options) => {
    try {
      generate(name, { test: options.test });
    } catch (err) {
      console.error(chalk.red("\n✗ Failed:"), err.message);
      process.exit(1);
    }
  });

program
  .command("setup")
  .description("Configure your LLM provider and API keys")
  .option(
    "-p, --provider <name>",
    "Provider to use: openai | anthropic | openai-compat",
  )
  .option("-k, --key <value>", "API key for the selected provider")
  .option("-m, --model <model>", "Default model to use")
  .option("-b, --base-url <url>", "Base URL for an OpenAI-compatible endpoint")
  .option("-r, --retries <number>", "Global default number of retries")
  .option("--show", "Print current configuration and exit")
  .action(async (options) => {
    try {
      await setup(options);
    } catch (err) {
      console.error(chalk.red("\n✗ Setup failed:"), err.message);
      process.exit(1);
    }
  });

program
  .command("new [name]")
  .description("Scaffold a new Wish project")
  .option(
    "--yolo",
    "Generate a random name and let the LLM dream up what the app does",
  )
  .action(async (name, options) => {
    try {
      if (options.yolo) {
        const yoloName = pickName();
        console.log("");
        console.log(
          chalk.bold("🎲  Rolling the dice…  ") + chalk.cyan(yoloName),
        );
        console.log("");
        const description = await imagineApp(yoloName);
        scaffold(yoloName, { description });
      } else {
        scaffold(name);
      }
    } catch (err) {
      console.error(chalk.red("\n✗ Failed:"), err.message);
      process.exit(1);
    }
  });

program
  .command("update")
  .description("Update the wish-lang CLI to the latest version via git")
  .action(() => {
    try {
      update();
    } catch (err) {
      console.error(
        chalk.red("\n✗ Expected failure during update:"),
        err.message,
      );
      process.exit(1);
    }
  });

program.parse();

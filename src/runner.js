import { spawn } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import chalk from "chalk";

/**
 * Runs the generated Node.js project in the output directory.
 * Installs dependencies first if node_modules is missing and package.json
 * declares any dependencies.
 *
 * @param {string} outputDir - Absolute path to the generated project directory.
 */
export async function run(outputDir) {
  const absDir = resolve(outputDir);
  const pkgPath = join(absDir, "package.json");

  if (!existsSync(pkgPath)) {
    throw new Error(
      `No package.json found in output directory: "${absDir}"\n` +
        'The compiled project may be missing — try running "wish compile" first.',
    );
  }

  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  } catch (err) {
    throw new Error(`Failed to parse generated package.json: ${err.message}`);
  }

  if (!pkg?.scripts?.start) {
    throw new Error(
      'The generated package.json has no "start" script.\n' +
        "Try recompiling — the LLM should have included one.",
    );
  }

  // Install dependencies when node_modules is absent and deps are declared.
  const hasDeps =
    (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) ||
    (pkg.devDependencies && Object.keys(pkg.devDependencies).length > 0);

  const needsInstall = hasDeps && !existsSync(join(absDir, "node_modules"));

  if (needsInstall) {
    console.log("Installing dependencies...\n");
    await spawnAsync("npm", ["install"], { cwd: absDir, stdio: "inherit" });
    console.log("");
  }

  console.log(chalk.bold("\nRunning…\n"));
  await spawnAsync("npm", ["start"], { cwd: absDir, stdio: "inherit" });
}

/**
 * Runs 'npm test' inside the generated output directory.
 * Streams output directly to the user's terminal.
 *
 * @param {string} outputDir - Absolute path to the generated output directory.
 * @returns {Promise<void>}
 */
export async function runTests(outputDir) {
  const absDir = resolve(outputDir);
  const pkgPath = join(absDir, "package.json");

  if (!existsSync(pkgPath)) {
    throw new Error(
      `No package.json found in test directory: "${absDir}"\n` +
        'The test suite may not have been compiled yet — try running "wish test" first.',
    );
  }

  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  } catch (err) {
    throw new Error(`Failed to parse test package.json: ${err.message}`);
  }

  if (!pkg?.scripts?.test) {
    throw new Error(
      'The generated test package.json has no "test" script.\n' +
        "Try recompiling the tests — the LLM should have included one.",
    );
  }

  const hasDeps =
    (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) ||
    (pkg.devDependencies && Object.keys(pkg.devDependencies).length > 0);

  const needsInstall = hasDeps && !existsSync(join(absDir, "node_modules"));

  if (needsInstall) {
    console.log("Installing test dependencies...\n");
    await spawnAsync("npm", ["install"], { cwd: absDir, stdio: "inherit" });
    console.log("");
  }

  console.log(chalk.bold("Running tests...\n"));
  await spawnAsync("npm", ["test"], { cwd: absDir, stdio: "inherit" });
}

/**
 * Promisified child process spawn.
 * Resolves when the process exits with code 0, rejects otherwise.
 *
 * @param {string}   cmd
 * @param {string[]} args
 * @param {import('child_process').SpawnOptions} options
 * @returns {Promise<void>}
 */
function spawnAsync(cmd, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, options);

    child.on("error", (err) => {
      reject(new Error(`Failed to start "${cmd}": ${err.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(`"${cmd} ${args.join(" ")}" exited with code ${code}`),
        );
      }
    });
  });
}

/**
 * Runs 'npm test' inside the generated output directory and captures stdout/stderr.
 *
 * @param {string} outputDir
 * @returns {Promise<{ success: boolean, output: string }>}
 */
export async function runTestsWithCapture(outputDir) {
  const absDir = resolve(outputDir);
  const pkgPath = join(absDir, "package.json");

  if (!existsSync(pkgPath)) {
    throw new Error(
      `No package.json found in test directory: "${absDir}"\n` +
        'The test suite may not have been compiled yet — try running "wish test" first.',
    );
  }

  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  } catch (err) {
    throw new Error(`Failed to parse test package.json: ${err.message}`);
  }

  if (!pkg?.scripts?.test) {
    throw new Error(
      'The generated test package.json has no "test" script.\n' +
        "Try recompiling the tests — the LLM should have included one.",
    );
  }

  const hasDeps =
    (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) ||
    (pkg.devDependencies && Object.keys(pkg.devDependencies).length > 0);

  const needsInstall = hasDeps && !existsSync(join(absDir, "node_modules"));

  if (needsInstall) {
    console.log("Installing test dependencies...\n");
    await spawnAsync("npm", ["install"], { cwd: absDir, stdio: "inherit" });
  }

  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["test"], { cwd: absDir });

    let output = "";
    child.stdout.on("data", (data) => {
      output += data.toString();
    });
    child.stderr.on("data", (data) => {
      output += data.toString();
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to start npm test: ${err.message}`));
    });

    child.on("close", (code) => {
      // Strip out ANSI escape codes from output so the LLM doesn't get confused
      const cleanOutput = output.replace(/\x1B\[[0-9;]*[mGKHFJ]/g, "");
      resolve({
        success: code === 0,
        output: cleanOutput,
      });
    });
  });
}

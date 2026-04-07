import { writeFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import chalk from "chalk";

const WISH_TEMPLATE = (name) => `@name ${name}

Describe what your program should do here.
`;

const TEST_TEMPLATE = (name) => `Describe how ${name} should behave here.
`;

/**
 * Generates a new .🙏 wish file or .🧪 test file in the target directory.
 *
 * @param {string}  name      - Base filename (without extension).
 * @param {Object}  options
 * @param {boolean} [options.test=false] - When true, generates a .🧪 test file.
 * @param {string}  [cwd=process.cwd()]  - Directory to create the file in.
 */
export function generate(name, { test = false } = {}, cwd = process.cwd()) {
  const ext = test ? "🧪" : "🙏";
  const template = test ? TEST_TEMPLATE : WISH_TEMPLATE;
  const fileName = `${name}.${ext}`;
  const filePath = join(resolve(cwd), fileName);

  if (existsSync(filePath)) {
    throw new Error(
      `"${fileName}" already exists. Choose a different name or edit the file directly.`,
    );
  }

  writeFileSync(filePath, template(name), "utf-8");

  console.log("");
  console.log(
    `${ext}  ` +
      chalk.bold("Created ") +
      chalk.cyan(fileName),
  );
  console.log("");

  if (test) {
    console.log(
      chalk.dim("  Describe the expected behaviour of your program, then run:"),
    );
    console.log(chalk.cyan("  wish test"));
  } else {
    console.log(
      chalk.dim("  Describe what your program should do, then run:"),
    );
    console.log(chalk.cyan("  wish run"));
  }

  console.log("");
}

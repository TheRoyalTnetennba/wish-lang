import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Updates the wish-lang CLI from the git repository.
 */
export function update() {
  // src/update.js -> src -> root
  const repoDir = resolve(__dirname, '..');
  
  console.log("");
  console.log(chalk.bold("⚙️  Wish Updater"));
  console.log("");

  if (!existsSync(join(repoDir, '.git'))) {
    console.error(chalk.red("✗ Cannot automatically update: installation is not a git repository."));
    console.error(`  Please rerun the install script manually from the documentation.`);
    process.exit(1);
  }

  console.log(chalk.cyan("→ Pulling latest changes from git..."));
  try {
    execSync('git pull', { cwd: repoDir, stdio: 'inherit' });
  } catch (err) {
    console.error(chalk.red("\n✗ Failed to pull latest changes"));
    process.exit(1);
  }

  console.log(chalk.cyan("\n→ Installing dependencies..."));
  try {
    execSync('npm install', { cwd: repoDir, stdio: 'inherit' });
  } catch (err) {
    console.error(chalk.red("\n✗ Failed to install dependencies"));
    process.exit(1);
  }

  console.log(chalk.bold.green("\n✓  wish-lang updated successfully!\n"));
}

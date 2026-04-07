import chalk from "chalk";
import { loadConfig, providerLabel } from "./config.js";
import { createProvider } from "./providers/index.js";

// ---------------------------------------------------------------------------
// Word list
// ---------------------------------------------------------------------------

const WORDS = [
  // creatures
  "fox",
  "wolf",
  "hawk",
  "bear",
  "crane",
  "raven",
  "cobra",
  "lynx",
  "otter",
  "badger",
  "falcon",
  "heron",
  "bison",
  "gecko",
  "dingo",
  "finch",
  "kite",
  "ibis",
  "viper",
  "stoat",
  "panda",
  "wren",
  "moth",
  "crab",
  "pike",
  "stag",
  "newt",
  "mink",
  // colours
  "amber",
  "azure",
  "coral",
  "crimson",
  "golden",
  "indigo",
  "ivory",
  "jade",
  "scarlet",
  "silver",
  "violet",
  "onyx",
  "russet",
  "tawny",
  "chalk",
  "ochre",
  "umber",
  "sienna",
  "obsidian",
  // landforms
  "ridge",
  "grove",
  "harbor",
  "haven",
  "reef",
  "vale",
  "glade",
  "marsh",
  "peak",
  "spire",
  "hollow",
  "canyon",
  "delta",
  "basin",
  "fjord",
  "isle",
  "moor",
  "bluff",
  "crest",
  "dune",
  "tarn",
  "atoll",
  "shoal",
  "scarp",
  "butte",
  // objects & tools
  "anvil",
  "arrow",
  "beacon",
  "blade",
  "bridge",
  "chain",
  "cipher",
  "crown",
  "ember",
  "forge",
  "helm",
  "hive",
  "nexus",
  "orbit",
  "prism",
  "quill",
  "rune",
  "torch",
  "vault",
  "loom",
  "lathe",
  "auger",
  "trowel",
  "mallet",
  "chisel",
  "girder",
  // actions (used as nouns)
  "craft",
  "drift",
  "glide",
  "quest",
  "roam",
  "scout",
  "surge",
  "bloom",
  "shift",
  "flow",
  "spark",
  "weave",
  "carve",
  "churn",
  "trace",
  "chime",
  "prowl",
  "smelt",
  "hatch",
  // abstracts
  "echo",
  "frost",
  "shade",
  "storm",
  "tide",
  "dawn",
  "dusk",
  "flare",
  "pulse",
  "haze",
  "mist",
  "gust",
  "boon",
  "lull",
  "glow",
  "hush",
  "brine",
  "silt",
  "flux",
  "dross",
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Picks three distinct random words from the list and joins them as a
 * kebab-case name.
 *
 * @returns {string}  e.g. "amber-fox-cipher"
 */
export function pickName() {
  const chosen = new Set();
  while (chosen.size < 3) {
    chosen.add(WORDS[Math.floor(Math.random() * WORDS.length)]);
  }
  return [...chosen].join("-");
}

/**
 * Asks the configured LLM to imagine a creative app concept for the given
 * name and returns the specification as a plain string suitable for use as
 * the body of a .🙏 file.
 *
 * @param {string} name          - The generated app name (e.g. "amber-fox-cipher").
 * @param {string} [projectDir]  - Directory to load .env config from (default: cwd).
 * @returns {Promise<string>}    - The LLM-generated specification text.
 */
export async function imagineApp(name, projectDir = process.cwd()) {
  const config = loadConfig(projectDir);
  const provider = createProvider(config);

  console.log(
    chalk.dim(`  Asking ${providerLabel(config)} to imagine "${name}"…`),
  );

  const description = await provider.imagine(name);
  return description;
}

# Wish ✨

> The highest level programming language. Write wishes. Run JavaScript.

Describe what your program should do in a `.🙏` file. Wish compiles your instructions into a complete, 🤞runnable🤞 Node.js project. Describe expected behaviour in a `.🧪` file and Wish will generate and run a test suite too.

Get Started
```sh
curl -fsSL https://raw.githubusercontent.com/TheRoyalTnetennba/wish-lang/main/install.sh | sh
```

---

## Table of Contents

- [How It Works](#how-it-works)
- [Installation](#installation)
- [Configuration](#configuration)
- [Language](#language)
  - [🙏 Wish Files](#-wish-files)
  - [🧪 Test Files](#-test-files)
  - [Directives](#directives)
- [CLI Reference](#cli-reference)
  - [wish setup](#wish-setup)
  - [wish new](#wish-new-name)
  - [wish add / wish g](#wish-add-name--wish-g-name)
  - [wish compile](#wish-compile-dir)
  - [wish run](#wish-run-dir)
  - [wish test](#wish-test-dir)
- [Examples](#examples)
- [Multi-file Projects](#multi-file-projects)
- [The Update Flow](#the-update-flow)
- [Tips](#tips)
- [Why](#why)
- [Supported Providers](#supported-providers)
- [License](#license)

---

## How It Works

Write wishes. Run JavaScript.

1. **Write**
    - Create a new project
      ```
      $ wish new hello-world
      ```
    - Open the generated hello-world.🙏 file in your preferred editor.
    - Optionally use the [directives](#directives) `@name` and `@version` for metadata.
      ```
      @name hello-world
      @version 0.1.0
      ```
    - Describe the desired behavior
      ```
      Print out "Hello, World!"
      ```

1. **Run** 
    - Wish generates and runs a Node.js project, recompiling only when `.🙏` files have changed.
      ```
      $ wish run
      ```

1. **Test**
    - Create a test file
      ```
      $ wish add hello-world -t
      ```
    - In the generated hello-world.🧪, describe what behavior to check for:
      ```
      It should print out "Hello, World!"
      ```
    - Compile and run the test
      ```
      $ wish test
      ```

---

## Installation

```sh
curl -fsSL https://raw.githubusercontent.com/TheRoyalTnetennba/wish-lang/main/install.sh | sh
```

This will:
1. Check that Node.js ≥ 18 and git are installed
2. Clone the repository into `~/.wish-lang`
3. Install dependencies
4. Link the `wish` command into npm's global bin (usually already in your `PATH`)
5. Create `~/.config/wish/.env` — your global config file for API keys

Then run `wish setup` to add your API key.

**To update** to the latest version, just run `wish update` anywhere on your machine.

### Manual installation

If you'd rather not pipe to `sh`:

```sh
git clone https://github.com/TheRoyalTnetennba/wish-lang ~/.wish-lang
cd ~/.wish-lang
npm install
npm link
```

### Override the install directory

```sh
WISH_INSTALL_DIR=~/tools/wish-lang curl -fsSL https://raw.githubusercontent.com/TheRoyalTnetennba/wish-lang/main/install.sh | sh
```

---

## Configuration

### Quick setup

Run the interactive wizard after installing:

```sh
wish setup
```

Opens an interactive wizard. Pick a provider, enter your API key (masked), and optionally set a default model. Settings are saved to `~/.config/wish/.env` and apply to every project on your machine — no copying `.env` files between projects.

For non-interactive use (CI, dotfile bootstrapping, etc.):

```sh
wish setup --provider anthropic --key sk-ant-...
wish setup --provider openai    --key sk-...
wish setup --provider openai-compat --base-url http://localhost:11434/v1 --model qwen3-coder
wish setup --model gpt-4o-mini   # just change the model
wish setup --show                # print current config
```

### Global config file

`wish setup` writes to:

```
~/.config/wish/.env
```

You can also edit it directly — it's a standard `.env` file:

```sh
ANTHROPIC_API_KEY=sk-ant-...
# WISH_MODEL=claude-sonnet-4-6
```

> **XDG:** If `$XDG_CONFIG_HOME` is set, the config lives at `$XDG_CONFIG_HOME/wish/.env`.

### Per-project overrides

Drop a `.env` (or `.env.local`) in a project directory to override specific values — a different model, a local provider, a custom output path:

```sh
# my-project/.env
WISH_PROVIDER=openai-compat
WISH_BASE_URL=http://localhost:11434/v1
WISH_MODEL=qwen3-coder
```

Per-project values win over the global config. Everything not overridden is inherited.

### Resolution order

| Priority | Source |
|---|---|
| 1 — highest | CLI flags (`--provider`, `--model`, etc.) |
| 2 | Shell environment variables |
| 3 | `<project>/.env.local` |
| 4 | `<project>/.env` |
| 5 — lowest | `~/.config/wish/.env` |

### Auto-detection

If `WISH_PROVIDER` is not set, Wish detects the provider from whichever key is present:

1. `ANTHROPIC_API_KEY` → `anthropic`
2. `OPENAI_API_KEY` → `openai`

For local models (LM Studio, Ollama, etc.) set `WISH_PROVIDER=openai-compat` explicitly — see [Supported Providers](#supported-providers).

### Default models

| Provider        | Default model       |
|-----------------|---------------------|
| `anthropic`     | `claude-sonnet-4-6` |
| `openai`        | `gpt-4o`            |
| `openai-compat` | `local-model`       |

Override with `WISH_MODEL` in any config file, via `wish setup --model`, or with the `--model` CLI flag.

---

## Language

Two file types. No syntax to learn.

Both file types share the same simple format — comments, optional directives, and natural language.

### 🙏 Wish Files

A `.🙏` file describes what the program should do.

| Line type | Format | Behaviour |
|---|---|---|
| Comment | `# ...` | Stripped before compilation — notes to yourself |
| Directive | `@key value` | Metadata the compiler honours (see [Directives](#directives)) |
| Instruction | anything else | Natural language that becomes the specification |

**Example:**
```
# A simple hello world app
@name hello-world
@version 1.0.0

Print out "Hello, World!"
```

### 🧪 Test Files

A `.🧪` file describes how the program should behave.

**Example:**
```
# Test the hello world app
It should print out "Hello, World!"
```

### Directives

| Directive  | Value        | Effect |
|---|---|---|
| `@name`    | kebab-string | Sets the `name` field in the generated `package.json`. |
| `@version` | semver       | Sets the `version` field in `package.json` (default: `1.0.0`). |

All directives are optional. Unknown `@keys` are silently ignored.

---

## CLI Reference

Every command accepts `--help` for full option details.

### `wish setup`

Configure your LLM provider and API key. Writes to `~/.config/wish/.env`.

```sh
wish setup                                        # interactive wizard
wish setup --provider anthropic --key sk-ant-...  # set Anthropic key
wish setup --provider openai    --key sk-...      # set OpenAI key
wish setup --provider openai-compat \
  --base-url http://localhost:11434/v1 \
  --model qwen3-coder                                # local model
wish setup --model gpt-4o-mini                    # change model only
wish setup --show                                 # view current config
```

```
Options:
  -p, --provider <name>  openai | anthropic | openai-compat
  -k, --key <value>      API key for the selected provider
  -m, --model <model>    Default model to use
  -b, --base-url <url>   Base URL for an OpenAI-compatible endpoint
  -r, --retries <number> Global default number of retries
      --show             Print current configuration and exit
```

---

### `wish new [name]`

Scaffold a new Wish project. Creates a subdirectory when a name is given; scaffolds into the current directory otherwise.

```sh
wish new my-app   # creates ./my-app/ with my-app.🙏 and .env.example
wish new          # scaffolds app.🙏 and .env.example in the current dir
```

Names are automatically normalised to kebab-case (`"My App"` → `my-app`).

#### `--yolo`

Can't decide what to build? Pass `--yolo` to `wish new` and Wish picks three random words, imagines what an app with that name might do, and pre-fills the `.🙏` file with the result — ready to compile immediately.

```sh
wish new --yolo
```

```
🎲  Rolling the dice…  amber-fox-cipher

  Asking anthropic to imagine "amber-fox-cipher"…

🙏  New Wish project created!

  location  /Users/you/amber-fox-cipher
  source    amber-fox-cipher.🙏
```

Requires an API key to be configured, since Wish is invoked during scaffolding.

---

### Core commands

- `wish compile` - Transpile 🙏 files into a Node project  
- `wish run` - Compile, then execute `npm start`  
- `wish test` - Compile test descriptions, then run `npm test`  
- `wish fix` - Run tests and repair any implementation bugs  
- `wish setup` - Configure global LLM API credentials  
- `wish new <name>` - Scaffold a blank Wish pipeline  
- `wish add <name>` - Generate `name.🙏`  
- `wish update` - Updates the Wish CLI itself to the latest git branch

### `wish add <name>` / `wish g <name>`

Generate a single `.🙏` or `.🧪` file in the current directory. `wish g` is an alias for `wish add`.

```sh
wish add <name>           # creates <name>.🙏
wish add <name> --test    # creates <name>.🧪
wish add <name> -t        # same, short form
```

```sh
wish add server           # server.🙏
wish add server --test    # server.🧪
wish g payments           # payments.🙏
wish g payments -t        # payments.🧪
```

---

### `wish compile [dir]`

Scan `[dir]` (default: `.`) for `.🙏` files and compile them to a Node.js project in `out/`.

Skips recompiling if no `.🙏` files have changed since the last compile. Use `--force` to override.

```
Options:
  -o, --output <dir>     Output directory, relative to source dir  (default: "out")
  -p, --provider <name>  LLM provider: openai | anthropic | openai-compat
  -m, --model <model>    Model to use (overrides provider default)
  -b, --base-url <url>   Base URL for an OpenAI-compatible endpoint
  -r, --retries <number> Number of semantic retries during generation
  -f, --force            Recompile even if output is already up to date
```

```sh
wish compile                          # compile current directory
wish compile ./my-app                 # compile a specific directory
wish compile . --provider openai      # force a specific provider
wish compile . --model gpt-4o-mini    # use a cheaper model
wish compile . --output build         # write to ./build instead of ./out
wish compile . --force                # skip staleness check
```

---

### `wish run [dir]`

Compile (if needed) and immediately run the generated project via `npm start`. Installs `node_modules` automatically if missing.

```
Options:
  -o, --output <dir>     Output directory  (default: "out")
  -p, --provider <name>  LLM provider
  -m, --model <model>    Model to use
  -b, --base-url <url>   Base URL for an OpenAI-compatible endpoint
  -r, --retries <number> Number of semantic retries during generation
  -f, --force            Recompile even if output is already up to date
```

```sh
wish run                  # compile (if needed) and run
wish run ./my-app         # compile and run a specific directory
wish run --force        # force recompile then run
```

---

### `wish test [dir]`

Compile `.🧪` files into a `node:test` suite and run it. Requires `out/` to exist — run `wish compile` first.

Skips recompiling if neither `.🧪` nor `.🙏` files have changed since the last test compile.

```
Options:
  -o, --output <dir>       Source and test output directory  (default: "out")
  -p, --provider <name>    LLM provider
  -m, --model <model>      Model to use
  -b, --base-url <url>     Base URL for an OpenAI-compatible endpoint
  -r, --retries <number>   Number of semantic retries during generation
  -f, --force              Recompile tests even if already up to date
```

```sh
wish test                  # compile tests (if needed) and run them
wish test ./my-app         # test a specific project directory
wish test . --force        # force test recompilation then run
```

---

### `wish fix [dir]`

Automatically identify why tests are failing and try to fix them until the tests pass.

```
Options:
  -o, --output <dir>       Source and test output directory  (default: "out")
  -p, --provider <name>    LLM provider
  -m, --model <model>      Model to use
  -b, --base-url <url>     Base URL for an OpenAI-compatible endpoint
  -r, --retries <number>   Number of test-driven fix retries
```

```sh
wish fix                  # run test suite and loop fixes for any failures
wish fix ./my-app         # fix a specific project directory
```

---

## Examples

The `examples/` directory contains ready-to-run projects. Each has a `.🙏` source file and a `.🧪` test file. Cd to the directory you want to try out and run it or test it with `wish run` and `wish test` respectively.

---

## Multi-file Projects

Split a large program across multiple `.🙏` files. Wish sends all of them in one request, labelled by filename, so it can reason about how they relate.

```
my-app/
  api.🙏    ←  HTTP API layer
  db.🙏     ←  database schema and queries
  auth.🙏   ←  authentication logic
  api.🧪    ←  expected API behaviour
  .env
```

**`api.🙏`**
```
@name my-app

A server on port 3000 with the following routes:
  POST /users  — creates a new user (delegates to the auth module)
  GET  /users  — returns all users (delegates to the db module)
```

**`db.🙏`**
```
A SQLite database module supporting the creation and retrieval of users.
Store data in a file called data.db.
```

**`auth.🙏`**
```
A registration handler that validates name and email from the request body,
calls createUser from the db module, and returns the new user as JSON.
Return a 400 error if name or email is missing.
```

Wish generates a coherent, multi-file Node.js project that wires everything together.

---

## The Update Flow

### Source updates

Re-running `wish compile` when `out/` already exists triggers **update mode**. Wish passes the existing generated files back alongside your (possibly changed) `.🙏` files, updating only what has changed and leaving everything else intact.

If nothing has changed since the last compile, Wish skips recompiling:

```
✓  Already up to date.
  (No 🙏 files have changed since the last compilation.)
  Run with --force to recompile anyway.
```

### Test updates

The same staleness logic applies to `wish test`. Tests are recompiled whenever either a `.🧪` or a `.🙏` file changes — since source changes can affect what the generated tests need to import or call.

### Forcing a recompile

```sh
wish compile . --force
wish test . --force
```

---

## Tips

**Don't**

**Be specific about inputs and outputs.**
Instead of "handle errors", write "print a helpful error message and exit the program"

**Split concerns across files.**
One `.🙏` file per logical layer (HTTP, database, auth, etc.) gives Wish clearer context and produces cleaner code.

**Write test files from the outside.**
`.🧪` files should describe observable behaviour — stdout, exit codes, HTTP responses — not implementation details. Wish figures out how to assert them.

**Iterate.**
Refine your spec and recompile. The update flow adjusts only what changed.

**Avoid implementation details.**
Don't say "use a `for` loop". Focus on *what* the program should do, not *how*. That's the compiler's job.

---

## Why

🤷 - in case it's unclear, this is a somewhat tongue-in-cheek project. Thought it'd
be fun to start with the assumption that everything said about LLM's capabilities 
by the people who sell them was _literally_ true and build from there.

---

## Supported Providers

### Cloud

| Provider    | Env var             | Default model       | Notes |
|---|---|---|---|
| `anthropic` | `ANTHROPIC_API_KEY` | `claude-sonnet-4-6` | Auto-detected when key is present. |
| `openai`    | `OPENAI_API_KEY`    | `gpt-4o`            | JSON mode enabled automatically. |

### Local (no API key required)

Use `openai-compat` for any locally-running model server — LM Studio, Ollama, or anything else that speaks the OpenAI API.

| Server        | Default base URL              |
|---|---|
| LM Studio     | `http://localhost:1234/v1`    |
| Ollama        | `http://localhost:11434/v1`   |
| Anything else | wherever your server listens  |

**LM Studio**

1. Open LM Studio, load a model, and start the local server (default port 1234).
2. Copy the model identifier from the server panel.

```
WISH_PROVIDER=openai-compat
WISH_BASE_URL=http://localhost:1234/v1
WISH_MODEL=qwen/qwen3-coder-30b
```

**Ollama**

1. Install Ollama and pull a model: `ollama pull qwen3-coder`.
2. The server starts automatically on port 11434.

```
WISH_PROVIDER=openai-compat
WISH_BASE_URL=http://localhost:11434/v1
WISH_MODEL=qwen3-coder
```

Override the base URL on the fly:

```sh
wish compile . --provider openai-compat --base-url http://192.168.1.10:1234/v1 --model my-model
```

### Adding a new provider

Implement a class in `src/providers/` with two methods and register it in `src/providers/index.js`:

```js
export class MyProvider {
  // Compiles 🙏 wish files into a Node.js project.
  async compile(wishFiles, existingFiles) {
    // returns { files: [{ path, content }], explanation }
  }

  // Compiles 🧪 test files into a node:test suite.
  async compileTests(testFiles, sourceFiles, existingTestFiles) {
    // returns { files: [{ path, content }], explanation }
  }
}
```

Both methods receive arrays of `{ path, content }` objects and must return the same shape. Add a default model entry in `src/config.js` and the provider name to the supported list in `src/providers/index.js`.

---

## License

MIT

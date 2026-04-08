#!/bin/sh
# 🙏 Wish Language Installer
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/TheRoyalTnetennba/wish-lang/main/install.sh | sh
#
# Environment variables:
#   WISH_INSTALL_DIR   Override the installation directory (default: ~/.wish-lang)
#   XDG_CONFIG_HOME    Override the XDG config base directory (default: ~/.config)

set -e

REPO_URL="https://github.com/TheRoyalTnetennba/wish-lang"
INSTALL_DIR="${WISH_INSTALL_DIR:-$HOME/.wish-lang}"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/wish"
GLOBAL_ENV="$CONFIG_DIR/.env"
MIN_NODE_MAJOR=18

# ── Colours (only when writing to a terminal) ─────────────────────────────────

if [ -t 1 ]; then
  BOLD="\033[1m"
  CYAN="\033[0;36m"
  GREEN="\033[0;32m"
  YELLOW="\033[0;33m"
  RED="\033[0;31m"
  RESET="\033[0m"
else
  BOLD="" CYAN="" GREEN="" YELLOW="" RED="" RESET=""
fi

step() { printf "${CYAN}  →  ${RESET}%s\n" "$1"; }
ok()   { printf "${GREEN}  ✓  ${RESET}%s\n" "$1"; }
warn() { printf "${YELLOW}  !  ${RESET}%s\n" "$1"; }
die()  { printf "${RED}  ✗  ${RESET}%s\n" "$1" >&2; exit 1; }

# ── Try to pick up Node/npm installed via nvm ─────────────────────────────────
#
# When the script is run via `curl | sh` the shell is non-interactive, so
# .bashrc/.zshrc are not sourced. We try to source nvm manually so that a
# nvm-managed Node is visible.

try_load_nvm() {
  NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck source=/dev/null
    . "$NVM_DIR/nvm.sh"
  fi
}

try_load_nvm

# ── Helper: check if a command exists ─────────────────────────────────────────

has() { command -v "$1" >/dev/null 2>&1; }

# ── Prerequisite checks ───────────────────────────────────────────────────────

check_node() {
  if ! has node; then
    die "Node.js is required but was not found.
       Install it from https://nodejs.org
       or via nvm:  https://github.com/nvm-sh/nvm"
  fi

  node_ver=$(node --version | tr -d 'v')
  node_major=$(printf '%s' "$node_ver" | cut -d. -f1)

  if [ "$node_major" -lt "$MIN_NODE_MAJOR" ]; then
    die "Node.js >=${MIN_NODE_MAJOR} is required (found v${node_ver}).
       Update at https://nodejs.org  or run:  nvm install ${MIN_NODE_MAJOR}"
  fi
}

check_npm() {
  has npm || die "npm is required but was not found.
       It is bundled with Node.js — install it from https://nodejs.org"
}

check_git() {
  has git || die "git is required but was not found.
       Install it from https://git-scm.com"
}

# ── Banner ────────────────────────────────────────────────────────────────────

printf "\n${BOLD}🙏  Wish Installer${RESET}\n\n"

# ── Check prerequisites ───────────────────────────────────────────────────────

step "Checking prerequisites..."
check_node
check_npm
check_git
ok "Node.js $(node --version)  |  npm $(npm --version)  |  git $(git --version | cut -d' ' -f3)"

# ── Clone or update ───────────────────────────────────────────────────────────

if [ -d "$INSTALL_DIR/.git" ]; then
  step "Updating existing installation in $INSTALL_DIR ..."
  if ! git -C "$INSTALL_DIR" pull --quiet --ff-only; then
    warn "Could not fast-forward — you may have local changes in $INSTALL_DIR."
    warn "To reset:  git -C $INSTALL_DIR reset --hard origin/main"
    exit 1
  fi
  ok "Repository updated"
else
  step "Cloning wish-lang into $INSTALL_DIR ..."
  git clone --quiet --depth 1 "$REPO_URL" "$INSTALL_DIR"
  ok "Repository cloned"
fi

# ── Install dependencies ──────────────────────────────────────────────────────

step "Installing dependencies..."
npm install --prefix "$INSTALL_DIR" --silent
ok "Dependencies installed"

# ── Link the wish binary globally ─────────────────────────────────────────────
#
# `npm link` (run from the package directory) creates:
#   • a symlink in npm's global node_modules pointing to $INSTALL_DIR
#   • a symlink in npm's global bin (usually already in PATH) for the `wish` executable
#
# If it fails due to permissions, we print actionable guidance instead of
# silently succeeding or producing a confusing error.

step "Linking 'wish' command..."

link_output=$( (cd "$INSTALL_DIR" && npm link) 2>&1 ) && linked=true || linked=false

if $linked; then
  ok "'wish' linked to $(npm bin -g 2>/dev/null || npm prefix -g)/bin/wish"
else
  # Check whether it was a permissions error
  case "$link_output" in
    *EACCES*|*permission*|*Permission*)
      warn "npm link failed due to a permissions error."
      warn ""
      warn "Fix npm's global directory permissions (recommended):"
      warn "  https://docs.npmjs.com/resolving-eacces-permissions-errors"
      warn ""
      warn "Or re-run with sudo (not recommended):"
      warn "  cd $INSTALL_DIR && sudo npm link"
      ;;
    *)
      warn "npm link failed with an unexpected error:"
      printf '%s\n' "$link_output" | sed 's/^/         /' >&2
      ;;
  esac
  exit 1
fi

# ── Verify the binary is reachable ────────────────────────────────────────────

if has wish; then
  ok "'wish' is available at $(command -v wish)"
else
  npm_bin=$(npm prefix -g 2>/dev/null)/bin

  warn "'wish' was linked but is not in your PATH."
  warn "Add the following line to your shell profile (.bashrc, .zshrc, etc.):"
  warn ""
  warn "  export PATH=\"\$PATH:${npm_bin}\""
  warn ""
  warn "Then reload your shell:  source ~/.zshrc  (or ~/.bashrc)"
fi

# ── Global config ─────────────────────────────────────────────────────────────
#
# Create ~/.config/wish/.env if it doesn't exist yet. This is where users set
# their API keys once — every wish project will pick them up automatically.

step "Setting up global config..."

mkdir -p "$CONFIG_DIR"

if [ ! -f "$GLOBAL_ENV" ]; then
  cat > "$GLOBAL_ENV" << 'EOF'
# 🙏 Wish — Global Configuration
# Set your API key(s) here once. Every wish project will pick them up
# automatically. Per-project .env files override these values when present.

# ── LLM Provider ──────────────────────────────────────────────────────────────
# Auto-detected from whichever key is present below.
# Uncomment to pin a specific provider:
# WISH_PROVIDER=anthropic

# ── API Keys ──────────────────────────────────────────────────────────────────
# ANTHROPIC_API_KEY=sk-ant-...
# OPENAI_API_KEY=sk-...
# ── Local providers (no API key needed) ───────────────────────────────────────
# WISH_PROVIDER=openai-compat
# WISH_BASE_URL=http://localhost:1234/v1   # LM Studio
# WISH_BASE_URL=http://localhost:11434/v1  # Ollama

# ── Optional overrides ────────────────────────────────────────────────────────
# WISH_MODEL=claude-sonnet-4-6
# WISH_MODEL=gpt-4o
# WISH_OUTPUT_DIR=out
# WISH_TEST_OUTPUT_DIR=test-out
EOF
  ok "Created $GLOBAL_ENV"
else
  ok "Global config already exists at $GLOBAL_ENV"
fi

# ── Done ──────────────────────────────────────────────────────────────────────

printf "\n${BOLD}  Installation complete!${RESET}\n\n"

printf "  ${BOLD}Step 1 — Add your API key:${RESET}\n\n"
printf "    ${CYAN}%s${RESET}\n" "$GLOBAL_ENV"
printf "\n"
printf "  Open that file and uncomment one of:\n\n"
printf "    ANTHROPIC_API_KEY=sk-ant-...\n"
printf "    OPENAI_API_KEY=sk-...\n"
printf "\n"
printf "  ${BOLD}Step 2 — Build something:${RESET}\n\n"
printf "    ${CYAN}wish new my-app${RESET}\n"
printf "    ${CYAN}cd my-app${RESET}\n"
printf "    ${CYAN}wish run ${RESET}\n"
printf "\n"
printf "  Or let the LLM decide what to build:\n\n"
printf "    ${CYAN}wish new --yolo${RESET}\n"
printf "\n"
printf "  To update Wish later, just re-run this installer.\n\n"

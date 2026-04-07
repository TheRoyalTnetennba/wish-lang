#!/usr/bin/env bash
# scripts/test-examples.sh
#
# Smoke-test every example: wipe its output, compile fresh, then run its tests.
# Run from the repo root:  bash scripts/test-examples.sh
#
# Exit codes:
#   0  — all examples passed
#   1  — one or more examples failed (failures are listed at the end)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WISH="node $REPO_ROOT/bin/wish.js"
EXAMPLES_DIR="$REPO_ROOT/examples"

# Collect results
passed=()
failed=()

# Colour helpers
green()  { printf '\033[0;32m%s\033[0m\n' "$*"; }
red()    { printf '\033[0;31m%s\033[0m\n' "$*"; }
cyan()   { printf '\033[0;36m%s\033[0m\n' "$*"; }
bold()   { printf '\033[1m%s\033[0m\n'   "$*"; }
dim()    { printf '\033[2m%s\033[0m\n'   "$*"; }

bold "🙏  Wish examples smoke-test"
echo ""
dim  "  repo:     $REPO_ROOT"
dim  "  examples: $EXAMPLES_DIR"
echo ""

for example_dir in "$EXAMPLES_DIR"/*/; do
  name="$(basename "$example_dir")"
  out_dir="$example_dir/out"

  cyan "── $name ─────────────────────────────────────────"

  # 1. Wipe the output directory so we always do a clean compile
  if [ -d "$out_dir" ]; then
    dim "  Removing $out_dir"
    rm -rf "$out_dir"
  fi

  # 2. wish run  (compiles + executes; non-interactive programs exit on their own)
  echo ""
  dim "  → wish run $name"
  if $WISH run "$example_dir"; then
    green "  ✓  wish run passed"
  else
    red   "  ✗  wish run failed"
    failed+=("$name (wish run)")
    # Still attempt the tests so we get as much signal as possible
  fi

  # 3. wish test (compiles tests + runs them)
  echo ""
  dim "  → wish test $name"
  if $WISH test "$example_dir"; then
    green "  ✓  wish test passed"
    passed+=("$name")
  else
    red   "  ✗  wish test failed"
    failed+=("$name (wish test)")
  fi

  echo ""
done

# ── Summary ─────────────────────────────────────────────────────────────────────
bold "── Results ────────────────────────────────────────────"
echo ""

if [ ${#passed[@]} -gt 0 ]; then
  for name in "${passed[@]}"; do
    green "  ✓  $name"
  done
fi

if [ ${#failed[@]} -gt 0 ]; then
  for name in "${failed[@]}"; do
    red "  ✗  $name"
  done
  echo ""
  red "$(( ${#failed[@]} )) example(s) failed."
  exit 1
fi

echo ""
green "All $(( ${#passed[@]} )) example(s) passed."

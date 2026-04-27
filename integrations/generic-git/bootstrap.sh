#!/bin/sh
# bootstrap.sh — clone + build the user's MCP repo before starting the wrapper.
#
# Driven by env vars set at deploy time by Stashup:
#   GIT_REPO_URL    — required. Full https URL or "owner/repo" (we'll prepend github.com)
#   GIT_REF         — optional. Branch/tag/sha. Default "main"
#   MCP_RUNTIME     — optional. "node" (default) or "python"
#   MCP_BUILD_CMD   — optional. Shell command(s) run in the cloned repo.
#                     Default switches on runtime:
#                       node:   "npm install && npm run build"
#                       python: "pip install --break-system-packages -e ."
#
# After bootstrap, the wrapper itself spawns the MCP subprocess via:
#   MCP_COMMAND     — e.g. "node" or "python"
#   MCP_ARGS        — e.g. "/mcp/dist/index.js" or "-m my_mcp"
#
# Build failures exit non-zero so Railway marks the deployment failed.

set -e

RUNTIME="${MCP_RUNTIME:-node}"

case "$RUNTIME" in
  node)
    DEFAULT_BUILD_CMD="npm install && npm run build"
    ;;
  python)
    # --break-system-packages: Alpine's Python is externally-managed (PEP 668).
    # Acceptable inside this single-purpose container — there's no other Python
    # workload to collide with, and creating a venv just to skip the flag adds
    # PATH gymnastics for the run step.
    DEFAULT_BUILD_CMD="pip install --break-system-packages -e ."
    ;;
  *)
    echo "[bootstrap] ✗ unknown MCP_RUNTIME: $RUNTIME (expected 'node' or 'python')"
    exit 1
    ;;
esac

if [ -z "$GIT_REPO_URL" ]; then
  echo "[bootstrap] no GIT_REPO_URL set — running wrapper without bootstrapping a repo"
else
  REF="${GIT_REF:-main}"
  REPO="$GIT_REPO_URL"

  # Allow shorthand "owner/repo" by prepending github.com
  case "$REPO" in
    https://*|http://*|git@*) ;;
    *) REPO="https://github.com/$REPO.git" ;;
  esac

  # Clean any leftover state from a previous container restart so the clone
  # always lands in a fresh empty directory. Railway preserves the container
  # filesystem across restarts; without this, the second boot fails with
  # "destination path '/mcp' already exists".
  rm -rf /mcp

  echo "[bootstrap] cloning $REPO @ $REF into /mcp (runtime: $RUNTIME)"
  if ! git clone --depth 1 -b "$REF" "$REPO" /mcp; then
    echo "[bootstrap] ✗ clone failed — check GIT_REPO_URL and GIT_REF"
    exit 1
  fi

  cd /mcp
  BUILD_CMD="${MCP_BUILD_CMD:-$DEFAULT_BUILD_CMD}"
  echo "[bootstrap] building with: $BUILD_CMD"
  if ! sh -c "$BUILD_CMD"; then
    echo "[bootstrap] ✗ build failed"
    exit 1
  fi
  echo "[bootstrap] ✓ build complete"
fi

echo "[bootstrap] starting wrapper"
cd /app
exec node index.js

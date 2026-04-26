#!/bin/sh
# bootstrap.sh — clone + build the user's MCP repo before starting the wrapper.
#
# Driven by env vars set at deploy time by Stashup:
#   GIT_REPO_URL    — required. Full https URL or "owner/repo" (we'll prepend github.com)
#   GIT_REF         — optional. Branch/tag/sha. Default "main"
#   MCP_BUILD_CMD   — optional. Shell command(s) run in the cloned repo. Default "npm install && npm run build"
#
# After bootstrap, the wrapper itself spawns the MCP subprocess via:
#   MCP_COMMAND     — usually "node"
#   MCP_ARGS        — usually "/mcp/dist/index.js" or similar
#
# Build failures exit non-zero so Railway marks the deployment failed.

set -e

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

  echo "[bootstrap] cloning $REPO @ $REF into /mcp"
  if ! git clone --depth 1 -b "$REF" "$REPO" /mcp; then
    echo "[bootstrap] ✗ clone failed — check GIT_REPO_URL and GIT_REF"
    exit 1
  fi

  cd /mcp
  BUILD_CMD="${MCP_BUILD_CMD:-npm install && npm run build}"
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

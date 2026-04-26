# Generic MCP wrapper for any GitHub-hosted stdio MCP that isn't on npm.
#
# At deploy time, Stashup sets env vars. On container start, bootstrap.sh
# clones the user-specified repo, builds it, then hands off to the wrapper
# which spawns the built MCP via stdio.
#
# Required env vars at deploy:
#   GIT_REPO_URL    e.g. "kenazk/gong-mcp" or full https://github.com/... URL
#   GIT_REF         e.g. "master" or "main" (default: main)
#   MCP_BUILD_CMD   e.g. "npm install && npm run build" (default)
#   MCP_COMMAND     e.g. "node"
#   MCP_ARGS        e.g. "/mcp/dist/index.js"
#   AUTH_TOKEN      bearer token clients use to call /mcp
#   ... plus whatever env vars the underlying MCP itself needs
#
# First boot is slow (~3-5 min for clone + npm install + build). Subsequent
# container restarts are fast since Railway preserves the image. Different
# from the curated-preset path: there, the underlying MCP is baked into the
# image at CI time, so containers boot in seconds.

FROM node:20-alpine

WORKDIR /app

# git for cloning user repos at runtime; bash because some npm scripts assume it
RUN apk add --no-cache git bash

# Shared wrapper code
COPY shared-wrapper/package.json ./
RUN npm install --omit=dev
COPY shared-wrapper/index.js ./

# Bootstrap script that handles clone + build at container start
COPY integrations/generic-git/bootstrap.sh /usr/local/bin/bootstrap.sh
RUN chmod +x /usr/local/bin/bootstrap.sh

LABEL org.opencontainers.image.source="https://github.com/Nick-Ingenious/mcp-wrappers"
LABEL org.opencontainers.image.description="Generic MCP wrapper — clones+builds any GitHub stdio MCP at container start"
LABEL org.opencontainers.image.licenses="MIT"

EXPOSE 3000
CMD ["/usr/local/bin/bootstrap.sh"]

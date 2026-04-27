# Generic MCP wrapper for any GitHub-hosted stdio MCP — Node or Python.
#
# At deploy time, Stashup sets env vars. On container start, bootstrap.sh
# clones the user-specified repo, builds it, then hands off to the wrapper
# which spawns the built MCP via stdio.
#
# Required env vars at deploy:
#   GIT_REPO_URL    e.g. "kenazk/gong-mcp" or full https://github.com/... URL
#   GIT_REF         e.g. "master" or "main" (default: main)
#   MCP_RUNTIME     "node" (default) or "python"
#   MCP_BUILD_CMD   default switches on runtime:
#                     node:   "npm install && npm run build"
#                     python: "pip install --break-system-packages -e ."
#   MCP_COMMAND     e.g. "node" or "python"
#   MCP_ARGS        e.g. "/mcp/dist/index.js" or "-m my_mcp"
#   AUTH_TOKEN      bearer token clients use to call /mcp
#   ... plus whatever env vars the underlying MCP itself needs
#
# First boot is slow (~3-5 min for clone + install + build; longer for Python
# MCPs that need to compile native deps like grpcio from source on Alpine).
# Subsequent container restarts are fast since Railway preserves the image.
# Different from the curated-preset path: there, the underlying MCP is baked
# into the image at CI time, so containers boot in seconds.

FROM node:20-alpine

WORKDIR /app

# git: clone user repos at runtime
# bash: some build scripts assume it
# python3 + py3-pip + py3-pipx: runtime + package install for Python MCPs
# build-base + python3-dev + libffi-dev + openssl-dev: needed when Python
#   deps without manylinux wheels (grpcio, cryptography) compile from source
#   on Alpine's musl libc
RUN apk add --no-cache \
      git bash \
      python3 py3-pip py3-pipx \
      build-base python3-dev libffi-dev openssl-dev \
    && ln -sf /usr/bin/python3 /usr/local/bin/python

ENV PIPX_HOME=/opt/pipx \
    PIPX_BIN_DIR=/usr/local/bin

# Shared wrapper code
COPY shared-wrapper/package.json ./
RUN npm install --omit=dev
COPY shared-wrapper/index.js ./

# Bootstrap script that handles clone + build at container start
COPY integrations/generic-git/bootstrap.sh /usr/local/bin/bootstrap.sh
RUN chmod +x /usr/local/bin/bootstrap.sh

LABEL org.opencontainers.image.source="https://github.com/Nick-Ingenious/mcp-wrappers"
LABEL org.opencontainers.image.description="Generic MCP wrapper — clones+builds any GitHub stdio MCP (Node or Python) at container start"
LABEL org.opencontainers.image.licenses="MIT"

EXPOSE 3000
CMD ["/usr/local/bin/bootstrap.sh"]

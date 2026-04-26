# Generic MCP wrapper — runs any npm-published stdio MCP server.
#
# No MCP is baked into this image. At deploy time, Stashup sets:
#   MCP_COMMAND=npx
#   MCP_ARGS=-y <npm-package-name>
#
# The wrapper then spawns the requested package as a subprocess via npx
# and exposes it over HTTP on port 3000.
#
# This image is the engine behind Journey 2: "let any user deploy any
# community MCP" without us pre-curating per-integration Dockerfiles.

FROM node:20-alpine

WORKDIR /app

# Shared wrapper code — same source for every integration in this repo
COPY shared-wrapper/package.json ./
RUN npm install --omit=dev
COPY shared-wrapper/index.js ./

# Pre-warm the npx cache for popular MCPs to cut cold-start time on
# first request. Each line is a separate `npx -y --no-install` style probe
# but for now we leave the cache empty — the customer's first request
# will incur the npm install cost (~5-15s), then subsequent requests are
# fast since the package is cached in the container's filesystem.

LABEL org.opencontainers.image.source="https://github.com/Nick-Ingenious/mcp-wrappers"
LABEL org.opencontainers.image.description="Generic MCP wrapper — runs any npm-published stdio MCP via npx"
LABEL org.opencontainers.image.licenses="MIT"

EXPOSE 3000
CMD ["node", "index.js"]

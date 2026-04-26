# MCP wrapper for Gong (https://github.com/kenazk/gong-mcp)
#
# Pre-built image consumed by Stashup auto-deploy. Each release pushes
# ghcr.io/nick-ingenious/mcp-gong:latest and :v<sha>.
#
# Build context expected: repo root (so we can COPY ../../shared-wrapper).
# The GitHub Actions workflow sets `context: .` from repo root and provides
# `dockerfile: integrations/gong/Dockerfile`.

# Stage 1 — clone + build kenazk/gong-mcp from source.
# Pin to master via build arg so future upstream changes don't surprise users.
FROM node:20-alpine AS gong-build
ARG GONG_MCP_REF=master
WORKDIR /gong
RUN apk add --no-cache git \
 && git clone --depth 1 -b "$GONG_MCP_REF" https://github.com/kenazk/gong-mcp.git . \
 && npm install \
 && npm run build


# Stage 2 — wrapper layer + final image
FROM node:20-alpine

WORKDIR /app

# Shared wrapper code — same source for every integration in this repo
COPY shared-wrapper/package.json ./
RUN npm install --omit=dev
COPY shared-wrapper/index.js ./

# Built gong-mcp goes here. The wrapper spawns it via stdio.
COPY --from=gong-build /gong/dist /gong/dist
COPY --from=gong-build /gong/node_modules /gong/node_modules
COPY --from=gong-build /gong/package.json /gong/package.json

# Pre-configure the wrapper to spawn gong-mcp. Users only set AUTH_TOKEN,
# GONG_ACCESS_KEY, GONG_ACCESS_SECRET in env vars at deploy time.
ENV MCP_COMMAND=node
ENV MCP_ARGS=/gong/dist/index.js

# OCI labels link the image back to its source for audit/inspection
LABEL org.opencontainers.image.source="https://github.com/Nick-Ingenious/mcp-wrappers"
LABEL org.opencontainers.image.description="Gong MCP wrapper — exposes kenazk/gong-mcp as a URL-based MCP for Stashup"
LABEL org.opencontainers.image.licenses="MIT"

EXPOSE 3000
CMD ["node", "index.js"]

# mcp-wrappers

Pre-built container images for MCP servers that Stashup deploys on customers' behalf via the auto-deploy flow. Each integration is a self-contained Docker image published to GitHub Container Registry; Stashup's auto-deploy pulls the image directly into a Railway service — no GitHub access required at deploy time, no per-customer build step.

## What's here

| Integration | Image | Source MCP |
|---|---|---|
| Gong | `docker.io/<dockerhub-user>/mcp-gong:latest` | [`kenazk/gong-mcp`](https://github.com/kenazk/gong-mcp) |

## How it works

Each integration has its own `Dockerfile` under `integrations/<id>/`. Every Dockerfile follows the same pattern:

1. **Stage 1**: Clone and build the underlying stdio MCP from source (e.g., `kenazk/gong-mcp`)
2. **Stage 2**: Bundle the built MCP with the **shared wrapper** (`shared-wrapper/`) — a small Node/Express HTTP↔stdio bridge with bearer-token auth, request timeouts, and verbose request logging
3. **Result**: A container that exposes the MCP at `POST /mcp` over HTTPS, gated by the `AUTH_TOKEN` env var

When Stashup creates a Railway service for a customer's Gong connection, it points Railway at the published image — Railway pulls and runs it in ~30 seconds. No source clone, no `npm install`, no per-customer build delay.

Images are published to **Docker Hub** (free, public-by-default — anyone can pull, no GitHub or registry authentication needed).

## Adding a new integration

1. Create `integrations/<id>/Dockerfile` following the Gong example
2. Add an entry to the matrix in `.github/workflows/build-images.yml`
3. Open a PR. CI builds + publishes the image automatically on merge to `main`
4. Add a matching preset in Stashup's `lib/deployPresets.js` referencing the new image

No visibility flips, no GHCR setup — Docker Hub repos are public by default on free accounts.

## CI setup (one-time)

Two repository secrets need to be set in this repo's **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `DOCKERHUB_USERNAME` | Your Docker Hub username |
| `DOCKERHUB_TOKEN` | An access token from Docker Hub (Account Settings → Security → New Access Token, with Read/Write scope) |

Once set, every push to `main` that touches `integrations/` or `shared-wrapper/` rebuilds and re-publishes the affected images.

## Image versioning

Every push to `main` produces two tags per image:

- `:latest` — moves with `main`. Stashup's auto-deploy uses this by default.
- `:<git-sha>` — immutable. Pin a Stashup preset to a specific commit if you need stability.

Customer deployments only pull on (re)deploy, so existing services aren't affected by tag updates until they're explicitly redeployed.

## Running locally

```bash
docker build -f integrations/gong/Dockerfile -t mcp-gong .
docker run --rm -p 3000:3000 \
  -e AUTH_TOKEN=$(openssl rand -hex 32) \
  -e GONG_ACCESS_KEY=... \
  -e GONG_ACCESS_SECRET=... \
  mcp-gong
```

Then `curl -H "Authorization: Bearer <token>" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' localhost:3000/mcp`

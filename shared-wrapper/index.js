/**
 * mcp-wrapper-template — index.js
 *
 * Spawns a stdio-based MCP server as a long-lived child process and exposes it
 * as an HTTP(S) endpoint that URL-based MCP clients (Anthropic Messages API,
 * Stashup) can consume. Bearer-token auth on the public endpoint; the
 * underlying MCP gets whatever env vars you pass through.
 *
 * Designed to run on Railway/Fly/Render (long-lived process). NOT compatible
 * with serverless functions (Vercel/Lambda) — they can't keep a subprocess
 * alive across invocations.
 *
 * Required env vars:
 *   MCP_COMMAND   — binary to run (e.g. "npx", "node", "python")
 *   MCP_ARGS      — space-separated args (e.g. "-y gong-mcp")
 *   AUTH_TOKEN    — long random secret; clients pass as Authorization: Bearer <token>
 * Optional:
 *   PORT          — defaults to 3000
 *   REQUEST_TIMEOUT_MS — defaults to 60000 (1 min)
 * Plus any env vars the underlying MCP itself needs (e.g. GONG_ACCESS_KEY).
 */

import express from 'express'
import { spawn } from 'node:child_process'

const PORT = Number(process.env.PORT) || 3000
const AUTH_TOKEN = process.env.AUTH_TOKEN
const MCP_COMMAND = process.env.MCP_COMMAND
const MCP_ARGS = (process.env.MCP_ARGS || '').split(/\s+/).filter(Boolean)
// Per-call timeout for stdio MCP responses. Many Gong/CRM-style MCPs make
// network calls that legitimately take 30-90s on first hit. 180s leaves
// headroom without indefinite hangs.
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS) || 180_000

if (!AUTH_TOKEN) { console.error('FATAL: AUTH_TOKEN not set'); process.exit(1) }
if (!MCP_COMMAND) { console.error('FATAL: MCP_COMMAND not set'); process.exit(1) }

// ─── Spawn + supervise the stdio MCP subprocess ─────────────────────────────

let mcp = null
let buffer = ''
const pending = new Map() // jsonrpc id → { resolve, timeout }

function startMcp() {
  console.log(`[wrapper] Spawning: ${MCP_COMMAND} ${MCP_ARGS.join(' ')}`)
  const child = spawn(MCP_COMMAND, MCP_ARGS, {
    stdio: ['pipe', 'pipe', 'inherit'], // stderr goes to wrapper's stderr for log visibility
    env: process.env, // forward GONG_ACCESS_KEY etc.
  })

  child.on('exit', (code, signal) => {
    console.error(`[wrapper] MCP exited (code=${code} signal=${signal}). Restarting in 1s.`)
    // Reject all pending requests so callers don't hang
    for (const { resolve, timeout } of pending.values()) {
      clearTimeout(timeout)
      resolve({ jsonrpc: '2.0', error: { code: -32603, message: 'MCP subprocess crashed' } })
    }
    pending.clear()
    buffer = ''
    mcp = null
    setTimeout(startMcp, 1000)
  })

  child.stdout.on('data', chunk => {
    buffer += chunk.toString('utf8')
    // Each MCP message is a single line of JSON
    const lines = buffer.split('\n')
    buffer = lines.pop() // last segment may be incomplete
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      let msg
      try { msg = JSON.parse(trimmed) } catch (e) {
        console.error('[wrapper] Failed to parse stdout line:', trimmed.slice(0, 200))
        continue
      }
      const entry = pending.get(msg.id)
      if (entry) {
        clearTimeout(entry.timeout)
        pending.delete(msg.id)
        entry.resolve(msg)
      } else if (msg.id !== undefined) {
        console.warn('[wrapper] Got response for unknown id:', msg.id)
      }
      // Server-initiated notifications (no id) are dropped — this template
      // doesn't bridge them. Most clients don't subscribe in practice.
    }
  })

  mcp = child
}

startMcp()

// ─── HTTP server ────────────────────────────────────────────────────────────

const app = express()
app.use(express.json({ limit: '10mb' }))

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, mcpAlive: !!mcp && !mcp.killed })
})

function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token || token !== AUTH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

app.post('/mcp', requireAuth, async (req, res) => {
  if (!mcp || mcp.killed) {
    return res.status(503).json({ jsonrpc: '2.0', error: { code: -32603, message: 'MCP not ready' } })
  }
  const reqMsg = req.body
  const id = reqMsg?.id
  const method = reqMsg?.method || '?'
  const params = reqMsg?.params

  // Build a short tag describing what this RPC is doing — helps a lot when
  // tailing Railway logs to see WHICH tool call is slow.
  const callTag = method === 'tools/call' && params?.name
    ? `tools/call ${params.name}`
    : method

  if (id === undefined) {
    console.log(`[mcp] ${callTag} (notification) → fire-and-forget`)
    mcp.stdin.write(JSON.stringify(reqMsg) + '\n')
    return res.status(204).end()
  }

  console.log(`[mcp] ${callTag} (id=${id}) → forwarded to subprocess`)
  const startedAt = Date.now()

  const responsePromise = new Promise(resolve => {
    const timeout = setTimeout(() => {
      pending.delete(id)
      console.warn(`[mcp] ${callTag} (id=${id}) ✗ TIMEOUT after ${REQUEST_TIMEOUT_MS}ms`)
      resolve({ jsonrpc: '2.0', id, error: { code: -32603, message: `Timeout after ${REQUEST_TIMEOUT_MS}ms` } })
    }, REQUEST_TIMEOUT_MS)
    pending.set(id, { resolve, timeout })
  })

  mcp.stdin.write(JSON.stringify(reqMsg) + '\n')
  const response = await responsePromise
  const elapsed = Date.now() - startedAt

  // Approximate response size — gives a sense of payload weight without
  // dumping potentially-sensitive transcript text into logs.
  const payloadBytes = JSON.stringify(response).length
  const ok = !response.error
  console.log(`[mcp] ${callTag} (id=${id}) ${ok ? '✓' : '✗'} ${elapsed}ms · ${payloadBytes} bytes${ok ? '' : ` · error: ${response.error?.message}`}`)

  res.json(response)
})

app.listen(PORT, () => {
  console.log(`[wrapper] Listening on :${PORT}`)
})

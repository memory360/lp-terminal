// On-demand multi-chain indexer manager.
// Keeps zero or one indexer process per chain. Frontends ask this manager to
// start a chain before switching to it; the manager launches/stops indexers,
// reports readiness, and proxies their API on one public origin.
//
// Run: INDEXER_MANAGER_PORT=8790 pnpm indexer:manager
// API:
//   POST /api/chains/:id/start
//   POST /api/chains/:id/stop
//   GET  /api/chains/:id      -> { running, ready }
//   GET  /api/health          -> manager health + chain list
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { bsc, getAllChains, getChainById, getChainByKey, isEvmChain, robinhood, type ChainAdapter } from '../src/lib/chains'

const PORT = Number(process.env.INDEXER_MANAGER_PORT || 8790)
const DEFAULT_CHAIN_KEY = (process.env.CHAIN ?? 'robinhood').toLowerCase().trim()
const DEFAULT_CHAIN = getChainByKey(DEFAULT_CHAIN_KEY) ?? robinhood

// Internal-only ports; override them when the host already uses a default.
// The browser and nginx only talk to the manager port above.
const CHAIN_PORTS: Record<number, number> = {
  4663: Number(process.env.INDEXER_PORT_ROBINHOOD || 18787),
  56: Number(process.env.INDEXER_PORT_BSC || 18788),
  101: Number(process.env.INDEXER_PORT_SOLANA || 18789),
}

interface ManagedProcess {
  chain: ChainAdapter
  proc: ChildProcess
  port: number
  startedAt: number
  ready: boolean
  lastUsed: number
  stopping: boolean
  exited: Promise<void>
}

const processes = new Map<number, ManagedProcess>()

function log(tag: string, ...args: unknown[]) {
  console.log(new Date().toISOString().slice(11, 19), `[${tag}]`, ...args)
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(data))
}

async function healthCheck(port: number): Promise<boolean> {
  try {
    const r = await fetch(`http://localhost:${port}/api/health`, { signal: AbortSignal.timeout(2000) })
    if (!r.ok) return false
    const j = (await r.json().catch(() => ({}))) as { ready?: boolean }
    return j.ready === true
  } catch {
    return false
  }
}

async function startChain(chainId: number): Promise<{ running: boolean; ready: boolean }> {
  const existing = processes.get(chainId)
  if (existing) {
    if (existing.stopping || existing.proc.exitCode !== null || existing.proc.signalCode !== null) {
      await existing.exited
      return startChain(chainId)
    }
    existing.lastUsed = Date.now()
    if (!existing.ready) {
      existing.ready = await healthCheck(existing.port)
    }
    return { running: true, ready: existing.ready }
  }

  const chain = getChainById(chainId)
  if (!chain) throw new Error(`unsupported chain id ${chainId}`)
  const port = CHAIN_PORTS[chainId]
  if (!port) throw new Error(`no fixed indexer port for chain ${chainId}`)

  log(chain.key, `starting indexer on port ${port}`)
  const entry = isEvmChain(chain) ? 'indexer/main.ts' : `indexer/${chain.key}/main.ts`
  // Do not depend on PM2/systemd preserving npm's node_modules/.bin PATH.
  const proc = spawn(process.execPath, ['--import', 'tsx', entry], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CHAIN: chain.key,
      INDEXER_PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let markExited!: () => void
  const exited = new Promise<void>((resolve) => {
    markExited = resolve
  })
  const managed: ManagedProcess = {
    chain,
    proc,
    port,
    startedAt: Date.now(),
    ready: false,
    lastUsed: Date.now(),
    stopping: false,
    exited,
  }
  processes.set(chainId, managed)

  proc.stdout?.on('data', (d) => {
    for (const line of String(d).trimEnd().split('\n')) {
      log(`${chain.key}:out`, line)
    }
  })
  proc.stderr?.on('data', (d) => {
    for (const line of String(d).trimEnd().split('\n')) {
      log(`${chain.key}:err`, line)
    }
  })
  proc.on('exit', (code) => {
    log(chain.key, `indexer exited ${code ?? 'signal'}`)
    if (processes.get(chainId) === managed) processes.delete(chainId)
    markExited()
  })
  proc.on('error', (error) => {
    log(chain.key, `indexer spawn failed: ${error.message}`)
    if (processes.get(chainId) === managed) processes.delete(chainId)
    markExited()
  })

  // Give the child a moment to bind and backfill catalogs before claiming ready.
  await new Promise((r) => setTimeout(r, 800))
  // Process may have exited during the wait — exit handler removes it from the
  // map, so check before reporting running status to avoid false positives.
  if (processes.get(chainId) !== managed) {
    return { running: false, ready: false }
  }
  managed.ready = await healthCheck(port)
  return { running: true, ready: managed.ready }
}

function stopChain(chainId: number): { running: boolean } {
  const p = processes.get(chainId)
  if (!p) return { running: false }
  if (p.stopping) return { running: false }
  log(p.chain.key, 'stopping indexer')
  p.stopping = true
  p.proc.kill('SIGTERM')
  return { running: false }
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`)
  const parts = url.pathname.split('/').filter(Boolean)

  res.setHeader('access-control-allow-origin', '*')
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
  res.setHeader('access-control-allow-headers', 'content-type')
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (parts[0] === 'api' && parts[1] === 'chains' && parts[2]) {
    const chainId = Number(parts[2])
    const action = parts[3]
    if (Number.isNaN(chainId)) return sendJson(res, 400, { error: 'bad chain id' })
    if (!getChainById(chainId)) return sendJson(res, 404, { error: 'unsupported chain' })

    if (req.method === 'GET' && action === 'indexer') {
      const p = processes.get(chainId)
      if (!p) return sendJson(res, 503, { error: 'indexer not running' })
      const indexerPath = '/' + parts.slice(4).join('/')
      const upstream = new URL(indexerPath || '/', `http://localhost:${p.port}`)
      upstream.search = url.search
      try {
        let response: Response | undefined
        let lastError: unknown
        // A cold tsx/sqlite process can take longer than startChain's initial
        // wait to bind its port. Keep the first browser request inside the
        // manager instead of exposing that startup race as a permanent 502.
        for (let attempt = 0; attempt < 20 && !response; attempt++) {
          try {
            response = await fetch(upstream)
          } catch (error) {
            lastError = error
            if (processes.get(chainId) !== p) break
            await new Promise((resolve) => setTimeout(resolve, 250))
          }
        }
        if (!response) throw lastError ?? new Error('indexer unavailable')
        res.writeHead(response.status, {
          'content-type': response.headers.get('content-type') ?? 'application/json',
          'cache-control': response.headers.get('cache-control') ?? 'no-cache',
        })
        res.end(Buffer.from(await response.arrayBuffer()))
      } catch (e) {
        sendJson(res, 502, { error: String(e) })
      }
      return
    }

    if (req.method === 'POST' && action === 'start') {
      try {
        const status = await startChain(chainId)
        return sendJson(res, 200, status)
      } catch (e) {
        log('mgr', `start ${chainId} failed:`, String(e))
        return sendJson(res, 500, { error: String(e) })
      }
    }
    if (req.method === 'POST' && action === 'stop') {
      return sendJson(res, 200, stopChain(chainId))
    }
    if (req.method === 'GET' && !action) {
      const p = processes.get(chainId)
      const ready = p ? await healthCheck(p.port) : false
      if (p) p.ready = ready
      return sendJson(res, 200, { running: !!p, ready })
    }
  }

  if (req.method === 'POST' && parts[0] === 'api' && parts[1] === 'chains') {
    // POST /api/chains with { chainId } body
    try {
      const body = await readBody(req)
      const json = JSON.parse(body || '{}') as { chainId?: number }
      if (!json.chainId) return sendJson(res, 400, { error: 'missing chainId' })
      const status = await startChain(json.chainId)
      return sendJson(res, 200, status)
    } catch (e) {
      return sendJson(res, 500, { error: String(e) })
    }
  }

  if (req.method === 'GET' && parts[0] === 'api' && parts[1] === 'health') {
    return sendJson(res, 200, {
      ok: true,
      chains: [...processes.entries()].map(([id, p]) => ({ id, key: p.chain.key, ready: p.ready })),
    })
  }

  sendJson(res, 404, { error: 'not found' })
})

server.listen(PORT, async () => {
  log('mgr', `indexer manager listening on ${PORT}`)
  try {
    const status = await startChain(DEFAULT_CHAIN.id)
    log('mgr', `default chain ${DEFAULT_CHAIN.key} running=${status.running} ready=${status.ready}`)
  } catch (e) {
    log('mgr', `default chain ${DEFAULT_CHAIN.key} start failed:`, String(e))
  }
})

function shutdown() {
  log('mgr', 'shutting down')
  for (const [, p] of processes) {
    p.proc.kill('SIGTERM')
  }
  server.close(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

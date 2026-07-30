// Solana indexer entry point.
// Run via the indexer manager (CHAIN=solana -> indexer/solana/main.ts) or
// directly: CHAIN=solana INDEXER_PORT=8789 pnpm tsx indexer/solana/main.ts
import { createServer } from 'node:http'
import { connection, log, PORT, sleep, TUNE } from './config'
import { syncRaydiumAmmV4, syncRaydiumClmm } from './catalog'
import { syncTokenPrices } from './prices'
import { allPoolAddrs, db, listPools, poolCounts } from './store'

let ready = false

function startApi(): void {
  const server = createServer((req, res) => {
    res.setHeader('access-control-allow-origin', '*')
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
    res.setHeader('access-control-allow-headers', 'content-type')
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const url = new URL(req.url || '/', `http://localhost:${PORT}`)
    if (req.method === 'GET' && url.pathname === '/api/health') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, ready }))
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/pools/counts') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(poolCounts()))
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/pools') {
      const limit = Math.min(Number(url.searchParams.get('limit') ?? '50'), 200)
      const offset = Math.max(Number(url.searchParams.get('offset') ?? '0'), 0)
      const mint = url.searchParams.get('mint') ?? undefined
      const rows = listPools({ limit, offset, mint })
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ pools: rows, limit, offset }))
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/tokens') {
      const rows = db.prepare('SELECT mint, symbol, decimals, price_usd FROM sol_tokens ORDER BY symbol').all() as {
        mint: string
        symbol: string
        decimals: number
        price_usd: number | null
      }[]
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ tokens: rows }))
      return
    }

    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'not found' }))
  })

  server.listen(PORT, () => {
    log('[sol-main]', `Solana indexer API listening on ${PORT}`)
  })
}

async function catalogLoop(): Promise<void> {
  for (;;) {
    try {
      await syncRaydiumAmmV4()
      await syncRaydiumClmm()
      ready = allPoolAddrs().length > 0
    } catch (e) {
      log('[sol-main] catalog sync failed:', String(e))
    }
    await sleep(TUNE.catalogMs)
  }
}

async function priceLoop(): Promise<void> {
  // Prices are slow-moving relative to reserves; refresh every 60s.
  for (;;) {
    try {
      await syncTokenPrices()
    } catch (e) {
      log('[sol-main] price sync failed:', String(e))
    }
    await sleep(TUNE.catalogMs)
  }
}

async function boot(): Promise<void> {
  log('[sol-main]', `starting — chain=solana — rpc=${connection.rpcEndpoint.replace(/\/v2\/.*/, '/v2/...')}`)
  startApi()
  // First scan blocks readiness until we have at least some pools.
  await syncRaydiumAmmV4().catch((e) => log('[sol-main] initial scan failed:', String(e)))
  await syncRaydiumClmm().catch((e) => log('[sol-main] initial CLMM scan failed:', String(e)))
  // Raydium supplies metadata, reserves and TVL; prices use HTTP APIs too.
  await syncTokenPrices().catch((e) => log('[sol-main] initial price sync failed:', String(e)))
  ready = allPoolAddrs().length > 0
  catalogLoop()
  priceLoop()
}

boot().catch((e) => {
  console.error(e)
  process.exit(1)
})

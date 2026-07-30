// UP33 LP-terminal pool indexer — catalog (factory events/enumeration) +
// on-chain state sweeps + GT enrichment, served over a tiny read-only API.
// Run: `npm run indexer` (tsx). Data lives in indexer/data/index.db (SQLite).
//
// Boot: catalog → GT active set → bounded metadata/state sweep → ready.
// Loops: tail 10s · hot sweep 60s · active sweep 60min · GT stats 5min.
// The API starts listening immediately; `ready:false` in responses tells the
// frontend to keep using its client-side fallback until the first pass lands.
import { currentChain } from './chains'
import { log, PORT, TUNE } from './config'
import { formatRpcError, usingPrivateRpc } from './rpc'
import { backfillV3, syncV2, tailV3 } from './catalog'
import { computeTvlFor, ensureTokenMeta, reprice, sweepState } from './state'
import { gtCycle } from './stats'
import { activeAddrs, db, featuredAddrs, hotAddrs, kvGet, kvSet, poolCounts } from './store'
import { startApi } from './api'
import { backfillVirtuals, tailVirtuals } from './virtuals'

/** setTimeout-chained loop — never overlaps itself, logs failures and keeps going */
function loop(name: string, ms: number, fn: () => Promise<void>): void {
  const tick = async () => {
    try {
      await fn()
    } catch (e) {
      log(`[${name}] error:`, String(e).slice(0, 200))
    }
    setTimeout(tick, ms)
  }
  setTimeout(tick, ms)
}

const timed = async <T,>(fn: () => Promise<T>): Promise<[T, number]> => {
  const t0 = Date.now()
  const r = await fn()
  return [r, Date.now() - t0]
}

async function boot(): Promise<void> {
  log(`up33 lp-indexer starting — chain=${currentChain.key} (${currentChain.id}) —`, usingPrivateRpc ? 'rpc: private (.env)' : 'rpc: public')
  startApi()

  await backfillVirtuals().catch((e) => log('[virtuals] history failed:', String(e).slice(0, 120)))

  const [addedV3, msV3] = await timed(backfillV3)
  if (addedV3 > 0 || !kvGet('v3_boot_logged')) {
    log(`[catalog] univ3 backfill done: +${addedV3} pools (${(msV3 / 1000).toFixed(0)}s)`)
    kvSet('v3_boot_logged', '1')
  }
  const [freshV2, msV2] = await timed(() => syncV2(true))
  if (freshV2.length) log(`[catalog] univ2 sync: +${freshV2.length} pairs (${(msV2 / 1000).toFixed(0)}s)`)
  log('[catalog]', poolCounts().map((c) => `${c.proto}=${c.n}`).join(' '))

  // The catalog remains complete, but expensive metadata/state reads are
  // bounded to pools surfaced by the HTTP stats lists. Long-tail pools are
  // hydrated only when they are newly created.
  await gtCycle().catch((e) => log('[stats] gt cycle failed:', String(e).slice(0, 120)))
  const featured = featuredAddrs()
  const [metaN, msMeta] = await timed(() => ensureTokenMeta(featured))
  if (metaN) log(`[tokens] metadata fetched for ${metaN} tokens (${(msMeta / 1000).toFixed(0)}s)`)

  const [, msSweep] = await timed(() => sweepState(featured))
  log(`[sweep] featured ${featured.length} pools (${(msSweep / 1000).toFixed(0)}s)`)
  const pr = reprice()
  log(`[price] ${pr.priced} tokens priced · tvl on ${pr.tvlPools} pools`)

  kvSet('ready', '1')
  log(`READY — http://localhost:${PORT}/api/health`)

  loop('tail', TUNE.tailMs, async () => {
    const fresh = [...(await tailV3()), ...(await syncV2())]
    if (fresh.length) {
      log(`[tail] ${fresh.length} new pools`)
      await ensureTokenMeta(fresh)
      await sweepState(fresh)
      computeTvlFor(fresh)
    }
  })
  loop('hot', TUNE.hotSweepMs, async () => {
    const hot = hotAddrs()
    await sweepState(hot)
    computeTvlFor(hot)
  })
  loop('active', TUNE.fullSweepMs, async () => {
    const addrs = activeAddrs()
    const [, ms] = await timed(() => sweepState(addrs))
    const p = reprice()
    log(`[sweep] active ${addrs.length} pools (${(ms / 1000).toFixed(0)}s) · ${p.priced} tokens priced · tvl on ${p.tvlPools}`)
  })
  loop('stats', TUNE.statsMs, async () => {
    await gtCycle()
    reprice()
  })
  loop('virtuals', TUNE.virtualsMs, async () => {
    await tailVirtuals()
  })
}

process.on('SIGINT', () => {
  log('shutting down')
  db.close()
  process.exit(0)
})
process.on('SIGTERM', () => {
  db.close()
  process.exit(0)
})

boot().catch((e) => {
  log('FATAL boot:', formatRpcError(e))
  process.exit(1)
})

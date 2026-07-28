// Indexer constants + tuning. Contract addresses come from the shared frontend
// config — src/config/addresses.ts and src/abi are pure modules and load fine
// under node/tsx. src/config/env.ts does NOT (import.meta.env is vite-only),
// which is why the public RPC is duplicated here instead of imported.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { currentChain } from './chains'
import { isEvmChain } from '../src/lib/chains'

export const PUBLIC_RPC = currentChain.publicRpc
export const BLOCKSCOUT = isEvmChain(currentChain) ? currentChain.explorerApi.base : ''
export const GT = 'https://api.geckoterminal.com/api/v2'

export const PORT = Number(process.env.INDEXER_PORT || 8787)
export const DB_PATH =
  process.env.INDEXER_DB || fileURLToPath(new URL(`./data/index-${currentChain.key}.db`, import.meta.url))

export const TUNE = {
  tailMs: 10_000, // factory tail + v2 allPairsLength poll
  hotSweepMs: 60_000, // state refresh for hot pools
  fullSweepMs: 3_600_000, // state refresh for ACTIVE pools (≥$100 TVL or <48h old)
  censusMs: 21_600_000, // 6h full-catalog dust census (~114k pools and growing)
  statsMs: 300_000, // GeckoTerminal enrichment cycle
  virtualsMs: 60_000, // low-frequency Virtuals launch tag refresh
  gtPaceMs: 2_600, // ≥2.6s between GT calls (free tier: 30/min)
  batch: 400, // calls per multicall aggregate
  batchGapMs: 40, // pause between aggregates (gentle on the RPC)
  hotTvlUsd: 10_000, // pools at/above this TVL refresh every hotSweepMs
  minDepthUsd: 300, // min priced-side USD depth to propagate a price through a pool
  gtFreshSecs: 1_800, // GT prices younger than this are never overwritten by propagation
}

/** repo-root .env `RPC_{CHAIN_KEY}` then `RPC` (SECRET — never log/print it). Fallback: key-free public RPC. */
export function rpcUrl(): string {
  const key = currentChain.key.toUpperCase()
  const env = process.env[`RPC_${key}`]?.trim() || (currentChain.key === 'robinhood' ? process.env.RPC?.trim() : '')
  if (env) return env
  try {
    const text = readFileSync(new URL('../.env', import.meta.url), 'utf8')
    const chainRpc = text.match(new RegExp(`^\\s*RPC_${key}\\s*=\\s*(\\S+)\\s*$`, 'm'))
    const m = chainRpc ?? (currentChain.key === 'robinhood' ? text.match(/^\s*RPC\s*=\s*(\S+)\s*$/m) : null)
    if (m) return m[1]
  } catch {
    /* no repo .env — public RPC below */
  }
  return PUBLIC_RPC
}

export const now = () => Math.floor(Date.now() / 1000)

/** terminal-style timestamped log line */
export const log = (...a: unknown[]) =>
  console.log(new Date().toISOString().slice(11, 19), ...a)

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

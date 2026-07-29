// Solana indexer config.
// Mirrors indexer/config.ts but uses Solana-specific tuning and reads
// RPC_SOLANA from .env / process.env.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Connection } from '@solana/web3.js'
import { currentChain } from '../chains'

export const PORT = Number(process.env.INDEXER_PORT || 8789)
export const DB_PATH =
  process.env.INDEXER_DB || fileURLToPath(new URL(`./data/index-${currentChain.key}.db`, import.meta.url))

export const TUNE = {
  /** How often to re-scan Raydium AMM program accounts. */
  catalogMs: 60_000,
  /** How often to refresh pool state (vault balances, price). */
  stateMs: 15_000,
  /** Concurrency limit for getMultipleAccounts batches. */
  batch: 100,
}

/** Solana RPC URL: env var wins, then .env, then public fallback. */
export function rpcUrl(): string {
  const env = process.env.RPC_SOLANA?.trim()
  if (env) return env
  try {
    const text = readFileSync(new URL('../../.env', import.meta.url), 'utf8')
    const m = text.match(/^\s*RPC_SOLANA\s*=\s*(\S+)\s*$/m)
    if (m) return m[1]
  } catch {
    /* no repo .env */
  }
  return currentChain.publicRpc
}

export let connection = new Connection(rpcUrl(), 'confirmed')

/** Open the server-side circuit after quota/rate-limit failures too. */
export async function withRpcFallback<T>(request: (rpc: Connection) => Promise<T>): Promise<T> {
  try {
    return await request(connection)
  } catch (error) {
    const message = String(error)
    if (connection.rpcEndpoint === currentChain.publicRpc || !/(?:429|too many requests|compute units|quota)/i.test(message)) {
      throw error
    }
    log('[sol-rpc]', `configured RPC limited; switching permanently to public RPC (${currentChain.publicRpc})`)
    connection = new Connection(currentChain.publicRpc, 'confirmed')
    return request(connection)
  }
}

export const now = () => Math.floor(Date.now() / 1000)

export const log = (...a: unknown[]) =>
  console.log(new Date().toISOString().slice(11, 19), ...a)

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

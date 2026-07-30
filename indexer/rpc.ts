import { createPublicClient, http, type PublicClient, type Transport } from 'viem'
import { currentChain } from './chains'
import { requireEvmChain } from '../src/lib/chains'
import { log, PUBLIC_RPC, TUNE, rpcUrl, sleep } from './config'

const url = rpcUrl()
export const usingPrivateRpc = url !== PUBLIC_RPC
let publicOnly = !usingPrivateRpc

/** Alchemy and other providers do not use one stable error shape for quota
 * failures, so inspect the complete error (including nested JSON-RPC data). */
export const isRpcLimitedError = (error: unknown): boolean =>
  /(?:\b429\b|too many requests|capacity limit|compute units|rate limit|quota)/i.test(String(error))

/** A process-lifetime circuit breaker. Once the configured RPC reports a
 * quota/rate-limit failure it is never probed again; the failed request and
 * all later requests go directly to the key-free public node. */
function circuitBreakingTransport(): Transport {
  const primary = http(url, { timeout: 10_000, retryCount: 0 })
  const fallback = http(PUBLIC_RPC, { timeout: 15_000, retryCount: 2, retryDelay: 600 })
  return (config) => {
    const primaryClient = primary(config)
    const fallbackClient = fallback(config)
    return {
      ...primaryClient,
      key: `rpc-circuit-${currentChain.id}`,
      name: `RPC circuit breaker ${currentChain.name}`,
      request: async (args) => {
        if (publicOnly) return fallbackClient.request(args)
        try {
          return await primaryClient.request(args)
        } catch (error) {
          if (!isRpcLimitedError(error)) throw error
          publicOnly = true
          log('[rpc] configured RPC limited; switching permanently to public RPC')
          return fallbackClient.request(args)
        }
      },
    }
  }
}
// timeout is deliberately tight: a healthy 400-call aggregate answers in 2-4s
// (measured 2026-07-16); a stalled attempt should fail fast and retry, not
// pin the whole boot for 30s. Bad chunks degrade to sub-chunks in mc().
export const pc: PublicClient = createPublicClient({
  chain: requireEvmChain(currentChain).viemChain,
  transport: circuitBreakingTransport(),
})

/** error text safe to log — the RPC url (secret) is redacted */
export const formatRpcError = (e: unknown) =>
  String(e instanceof Error ? `${e.name}: ${e.message.split('\n')[0]}` : e)
    .replaceAll(url, '<rpc>')
    .slice(0, 120)

// loose call shape — abi fragments come from parseAbi, results are narrowed by ok<T>()
export type Call = { abi: unknown; address: `0x${string}`; functionName: string; args?: unknown[] }
export type McRes = { status: 'success' | 'failure'; result?: unknown }

const agg = async (chunk: Call[]): Promise<McRes[]> =>
  (await pc.multicall({ contracts: chunk as never, batchSize: 250_000 })) as McRes[]

/**
 * Chunked multicall: fixed TUNE.batch calls per aggregate3 (batchSize is set
 * high so viem never sub-chunks by calldata bytes), allowFailure semantics,
 * gentle pacing between chunks. A failing chunk is retried once, then split
 * into 100-call sub-chunks so one bad call can only take 100 results down
 * with it — mc() never throws, it returns per-call failures instead.
 */
export async function mc(calls: Call[]): Promise<McRes[]> {
  const out: McRes[] = []
  for (let i = 0; i < calls.length; i += TUNE.batch) {
    const chunk = calls.slice(i, i + TUNE.batch)
    const t0 = Date.now()
    try {
      out.push(...(await agg(chunk)))
    } catch (e) {
      log('[rpc] chunk failed, retrying:', formatRpcError(e))
      await sleep(600)
      try {
        out.push(...(await agg(chunk)))
      } catch {
        for (let j = 0; j < chunk.length; j += 100) {
          const part = chunk.slice(j, j + 100)
          try {
            out.push(...(await agg(part)))
          } catch (e2) {
            log(`[rpc] dropped ${part.length}-call sub-chunk:`, formatRpcError(e2))
            out.push(...part.map(() => ({ status: 'failure' as const })))
          }
        }
      }
    }
    const ms = Date.now() - t0
    if (ms > 8_000) log(`[rpc] slow chunk: ${ms}ms (${chunk.length} calls)`)
    if (i + TUNE.batch < calls.length) await sleep(TUNE.batchGapMs)
  }
  return out
}

export const ok = <T,>(r?: McRes): T | undefined =>
  r && r.status === 'success' ? (r.result as T) : undefined

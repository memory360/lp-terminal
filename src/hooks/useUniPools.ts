import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import type { PublicClient } from 'viem'
import { fetchUniBrowse } from '../lib/uniBrowse'
import { fetchUniIndex } from '../lib/uniIndex'
import type { PoolStat } from '../lib/poolstats'
import type { Pool, TokenInfo } from '../types'
import { useCurrentChain } from './useChain'

export type UniPoolsData = {
  pools: Pool[]
  tokens: Record<string, TokenInfo>
  stats: Record<string, PoolStat>
  total: number // matches before the page limit (index) / pre-cap candidates (fallback)
  indexed: number // full catalog size; 0 in fallback mode
  dropped: number // fallback only: spoof candidates dropped by factory.getPool
  source: 'index' | 'fallback'
}

/**
 * Uniswap pool browser — `query`: token address / pool address / symbol /
 * "sym0/sym1"; '' = whole catalog by TVL. Primary source is the pool-indexer
 * API (full v2+v3 catalog, factory-event-authentic). When the indexer is down
 * or warming up it falls back to client-side dexscreener discovery with
 * on-chain factory.getPool verification (v3 only, top 30).
 */
export function useUniPools(query: string, minTvl: number, proto?: 'univ2' | 'univ3') {
  const chain = useCurrentChain()
  const pc = usePublicClient({ chainId: chain.id })
  return useQuery<UniPoolsData>({
    queryKey: ['uniPools', chain.id, query.trim().toLowerCase(), minTvl, proto ?? 'all'],
    enabled: !!pc,
    refetchInterval: 30_000,
    queryFn: async () => {
      const idx = await fetchUniIndex(query, minTvl, proto, 120, chain.indexerUrl)
      if (idx) return { ...idx, dropped: 0, source: 'index' }
      const legacy = await fetchUniBrowse(pc as PublicClient, query, chain)
      return {
        pools: legacy.pools,
        tokens: legacy.tokens,
        stats: legacy.stats,
        total: legacy.candidates,
        indexed: 0,
        dropped: legacy.dropped,
        source: 'fallback',
      }
    },
  })
}

import { useQuery } from '@tanstack/react-query'
import { fetchPoolStats } from '../lib/poolstats'
import { useCurrentChain } from './useChain'
import { usePools } from './usePools'

/** 24h volume / liquidity USD per pool (dexscreener + official v2 subgraph) */
export function usePoolStats() {
  const pools = usePools()
  const chain = useCurrentChain()
  return useQuery({
    queryKey: ['poolStats', chain.id],
    enabled: !!pools.data,
    refetchInterval: 60_000,
    staleTime: 45_000,
    retry: 1,
    queryFn: () => fetchPoolStats(pools.data!.pools, chain),
  })
}

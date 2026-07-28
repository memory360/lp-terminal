import { useQuery } from '@tanstack/react-query'
import { parseUnits } from 'viem'
import { kyberRoute } from '../lib/kyber'
import { requireEvmChain } from '../lib/chains'
import { useCurrentChain } from './useChain'

/** USD price of 1 UP via a kyber UP->USDG quote (display only). null on chains without UP. */
export function useUpPrice() {
  const chain = requireEvmChain(useCurrentChain())
  return useQuery({
    queryKey: ['upPrice', chain.id],
    enabled: !!chain.anchors.up,
    refetchInterval: 60_000,
    staleTime: 50_000,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
    queryFn: async () => {
      if (!chain.anchors.up) return null
      // applyFee: false — this is a price display, not an executable quote
      const r = await kyberRoute(
        chain.anchors.up,
        chain.anchors.stable,
        parseUnits('1', 18),
        { applyFee: false, chain: chain.kyberChain },
      )
      const usd = Number(r.routeSummary.amountOutUsd ?? NaN)
      if (Number.isFinite(usd) && usd > 0) return usd
      return Number(r.routeSummary.amountOut) / 1e6 // stable has 6 decimals
    },
  })
}

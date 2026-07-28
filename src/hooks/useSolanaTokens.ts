import { useQuery } from '@tanstack/react-query'
import { useCurrentChain } from './useChain'
import { isSolanaChain } from '../lib/chains'
import { fetchJson } from '../lib/fetchJson'

export type SolTokenInfo = {
  mint: string
  symbol: string
  decimals: number
  priceUsd: number | null
}

async function fetchSolTokens(baseUrl: string): Promise<SolTokenInfo[]> {
  const json = await fetchJson<{ tokens: Array<{ mint: string; symbol: string; decimals: number; price_usd: number | null }> }>(
    `${baseUrl}/api/tokens`,
    { signal: AbortSignal.timeout(8_000) },
  )
  return json.tokens.map((t) => ({ ...t, priceUsd: t.price_usd }))
}

export function useSolanaTokens() {
  const chain = useCurrentChain()
  return useQuery<SolTokenInfo[]>({
    queryKey: ['solana-tokens', chain.id],
    queryFn: () => fetchSolTokens(chain.indexerUrl ?? ''),
    enabled: isSolanaChain(chain),
    refetchInterval: (query) => (query.state.status === 'error' ? false : 60_000),
    staleTime: 30_000,
  })
}

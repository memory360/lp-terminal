import { useQuery } from '@tanstack/react-query'
import { useCurrentChain } from './useChain'
import { isSolanaChain } from '../lib/chains'

export type SolTokenInfo = {
  mint: string
  symbol: string
  decimals: number
  priceUsd: number | null
}

async function fetchSolTokens(baseUrl: string): Promise<SolTokenInfo[]> {
  const res = await fetch(`${baseUrl}/api/tokens`)
  if (!res.ok) throw new Error(`Solana indexer error: ${res.status}`)
  const json = (await res.json()) as { tokens: Array<{ mint: string; symbol: string; decimals: number; price_usd: number | null }> }
  return json.tokens.map((t) => ({ ...t, priceUsd: t.price_usd }))
}

export function useSolanaTokens() {
  const chain = useCurrentChain()
  return useQuery<SolTokenInfo[]>({
    queryKey: ['solana-tokens', chain.id],
    queryFn: () => fetchSolTokens(chain.indexerUrl ?? ''),
    enabled: isSolanaChain(chain),
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
}

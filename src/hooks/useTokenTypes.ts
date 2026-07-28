import { useQuery } from '@tanstack/react-query'
import { useCurrentChain } from './useChain'

export type TokenType = 'virtuals'

type TokenTypeResponse = {
  chainId: number
  type: string
  tokens: string[] // lowercase addresses
}

async function fetchTokenTypes(type: TokenType, indexerBase?: string): Promise<Set<string>> {
  const u = new URL(`${indexerBase ?? ''}/api/type/${type}`, location.origin)
  const r = await fetch(u)
  if (!r.ok) throw new Error(`token-types ${type}: ${r.status}`)
  const j = (await r.json()) as TokenTypeResponse
  return new Set(j.tokens)
}

/** Fetch a token origin-type set from the indexer on demand (no RPC cost). */
export function useTokenTypes(type: TokenType) {
  const chain = useCurrentChain()
  return useQuery<Set<string>>({
    queryKey: ['tokenTypes', chain.id, type],
    queryFn: () => fetchTokenTypes(type, chain.indexerUrl),
    staleTime: 5 * 60 * 1000, // 5 min: these sets change slowly
    refetchInterval: 60_000,
  })
}

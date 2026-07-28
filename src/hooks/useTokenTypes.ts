import { useQuery } from '@tanstack/react-query'
import { useCurrentChain } from './useChain'
import { fetchJson } from '../lib/fetchJson'
import { isEvmChain } from '../lib/chains'

export type TokenType = 'virtuals'

type TokenTypeResponse = {
  chainId: number
  type: string
  tokens: string[] // lowercase addresses
}

async function fetchTokenTypes(type: TokenType, indexerBase?: string): Promise<Set<string>> {
  const u = new URL(`${indexerBase ?? ''}/api/type/${type}`, location.origin)
  const j = await fetchJson<TokenTypeResponse>(u.toString(), { signal: AbortSignal.timeout(8_000) })
  return new Set(j.tokens)
}

/** Fetch a token origin-type set from the indexer on demand (no RPC cost). */
export function useTokenTypes(type: TokenType) {
  const chain = useCurrentChain()
  return useQuery<Set<string>>({
    queryKey: ['tokenTypes', chain.id, type],
    queryFn: () => fetchTokenTypes(type, chain.indexerUrl),
    enabled: isEvmChain(chain) && !!chain.protocols?.virtuals,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 min: these sets change slowly
    refetchInterval: (query) => (query.state.status === 'error' ? false : 60_000),
  })
}

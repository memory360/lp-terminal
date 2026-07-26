import { useQuery } from '@tanstack/react-query'

export type TokenType = 'virtuals'

type TokenTypeResponse = {
  type: string
  tokens: string[] // lowercase addresses
}

async function fetchTokenTypes(type: TokenType): Promise<Set<string>> {
  const u = new URL(`/api/type/${type}`, location.origin)
  const r = await fetch(u)
  if (!r.ok) throw new Error(`token-types ${type}: ${r.status}`)
  const j = (await r.json()) as TokenTypeResponse
  return new Set(j.tokens)
}

/** Fetch a token origin-type set from the indexer on demand (no RPC cost). */
export function useTokenTypes(type: TokenType) {
  return useQuery<Set<string>>({
    queryKey: ['tokenTypes', type],
    queryFn: () => fetchTokenTypes(type),
    staleTime: 5 * 60 * 1000, // 5 min: these sets change slowly
    refetchInterval: 60_000,
  })
}

import { useQuery } from '@tanstack/react-query'
import type { SolPool } from '../types'
import { isSolanaChain } from '../lib/chains'
import { useCurrentChain } from './useChain'

type SolPoolApiRow = {
  address: string
  program: string
  pool_type: string
  token_a: string
  token_b: string
  decimals_a: number | null
  decimals_b: number | null
  symbol_a: string | null
  symbol_b: string | null
  vault_a: string | null
  vault_b: string | null
  lp_mint: string | null
  lp_total_supply: string | null
  fee_bps: number | null
  reserve_a: string
  reserve_b: string
  tvl_usd: number | null
  updated: number
}

type SolPoolsResponse = { pools: SolPoolApiRow[]; limit: number; offset: number }

function rowToPool(r: SolPoolApiRow): SolPool {
  return {
    kind: 'solana',
    address: r.address,
    program: r.program,
    poolType: r.pool_type,
    tokenA: { mint: r.token_a, symbol: r.symbol_a ?? '?', decimals: r.decimals_a ?? 9 },
    tokenB: { mint: r.token_b, symbol: r.symbol_b ?? '?', decimals: r.decimals_b ?? 9 },
    vaultA: r.vault_a ?? '',
    vaultB: r.vault_b ?? '',
    lpMint: r.lp_mint,
    lpTotalSupply: r.lp_total_supply,
    feeBps: r.fee_bps,
    reserveA: r.reserve_a,
    reserveB: r.reserve_b,
    tvlUsd: r.tvl_usd,
    updated: r.updated,
  }
}

async function fetchSolPools(baseUrl: string): Promise<SolPool[]> {
  const res = await fetch(`${baseUrl}/api/pools?limit=200`)
  if (!res.ok) throw new Error(`Solana indexer error: ${res.status}`)
  const json = (await res.json()) as SolPoolsResponse
  return json.pools.map(rowToPool)
}

export function useSolanaPools() {
  const chain = useCurrentChain()
  return useQuery<SolPool[]>({
    queryKey: ['solana-pools', chain.id],
    queryFn: () => fetchSolPools(chain.indexerUrl ?? ''),
    enabled: isSolanaChain(chain),
    refetchInterval: 15_000,
    staleTime: 10_000,
  })
}

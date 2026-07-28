// Solana LP positions hook.
// Currently supports AMM V4 pools where positions are represented by SPL LP
// token balances. CLMM/Whirlpool/DLMM positions (NFTs) are deferred.
import { useQuery } from '@tanstack/react-query'
import { Connection, PublicKey } from '@solana/web3.js'
import { useMemo } from 'react'
import { useCurrentChain } from './useChain'
import { useSolanaWallet } from './useSolanaWallet'
import { useSolanaPools } from './useSolanaPools'
import { isSolanaChain } from '../lib/chains'
import type { SolPool } from '../types'
import { rpcUrlForChain } from '../config/env'
import { customRpc } from '../lib/rpcPref'

export type SolPosition = {
  pool: SolPool
  lpBalance: bigint
  lpTotalSupply: bigint
  share: number // 0..1
  amountA: number
  amountB: number
  valueUsd: number | null
}

function useSolConnection() {
  const chain = useCurrentChain()
  return useMemo(() => {
    if (!isSolanaChain(chain)) return null
    return new Connection(customRpc(chain.id) || rpcUrlForChain(chain.key) || chain.publicRpc, 'confirmed')
  }, [chain])
}

async function fetchLpBalances(connection: Connection, owner: string): Promise<Map<string, bigint>> {
  const parsed = await connection.getParsedTokenAccountsByOwner(new PublicKey(owner), { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') })
  const out = new Map<string, bigint>()
  for (const { account } of parsed.value) {
    const info = account.data.parsed.info
    const mint = info.mint as string
    const amount = BigInt(info.tokenAmount.amount)
    if (amount > 0n) {
      const existing = out.get(mint) ?? 0n
      out.set(mint, existing + amount)
    }
  }
  return out
}

export function useSolanaPositions() {
  const chain = useCurrentChain()
  const wallet = useSolanaWallet()
  const pools = useSolanaPools()
  const connection = useSolConnection()

  return useQuery<SolPosition[]>({
    queryKey: ['solana-positions', chain.id, wallet.publicKey],
    queryFn: async () => {
      if (!wallet.publicKey || !connection || !pools.data) return []
      const balances = await fetchLpBalances(connection, wallet.publicKey)
      const poolByLpMint = new Map<string, SolPool>()
      for (const pool of pools.data) {
        if (pool.lpMint) poolByLpMint.set(pool.lpMint, pool)
      }

      const positions: SolPosition[] = []
      for (const [mint, lpBalance] of balances) {
        const pool = poolByLpMint.get(mint)
        if (!pool || !pool.lpTotalSupply) continue
        const lpTotalSupply = BigInt(pool.lpTotalSupply)
        if (lpTotalSupply === 0n) continue
        const share = Number(lpBalance) / Number(lpTotalSupply)
        const reserveA = BigInt(pool.reserveA)
        const reserveB = BigInt(pool.reserveB)
        const amountA = (Number(reserveA) * share) / 10 ** pool.tokenA.decimals
        const amountB = (Number(reserveB) * share) / 10 ** pool.tokenB.decimals

        let valueUsd: number | null = null
        // value is already pre-computed as pool.tvlUsd from the indexer.
        if (pool.tvlUsd != null && pool.tvlUsd > 0) {
          valueUsd = pool.tvlUsd * share
        }

        positions.push({ pool, lpBalance, lpTotalSupply, share, amountA, amountB, valueUsd })
      }

      return positions.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0))
    },
    enabled: isSolanaChain(chain) && wallet.connected && !!pools.data && !!connection,
    refetchInterval: 15_000,
    staleTime: 10_000,
  })
}

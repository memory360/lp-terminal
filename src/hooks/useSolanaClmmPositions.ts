// Raydium CLMM NFT position hook.
// Fetches the connected wallet's personal position accounts from the CLMM
// program, computes underlying token amounts from liquidity + current pool
// price, and estimates accrued fees from the position's owed-fee fields.
import { useQuery } from '@tanstack/react-query'
import { Connection, PublicKey } from '@solana/web3.js'
import { useMemo } from 'react'
import { useCurrentChain } from './useChain'
import { useSolanaWallet } from './useSolanaWallet'
import { useSolanaPools } from './useSolanaPools'
import { getRaydium } from '../lib/raydium'
import { isSolanaChain } from '../lib/chains'
import { bigintToNumber } from '../lib/format'
import type { SolPool } from '../types'
import { rpcUrlForChain } from '../config/env'
import { customRpc } from '../lib/rpcPref'

export type SolClmmPosition = {
  pool: SolPool
  nftMint: string
  tickLower: number
  tickUpper: number
  priceLower: number
  priceUpper: number
  liquidity: bigint
  amountA: number
  amountB: number
  feeOwedA: number
  feeOwedB: number
  inRange: boolean
  valueUsd: number | null
}

function useSolConnection() {
  const chain = useCurrentChain()
  return useMemo(() => {
    if (!isSolanaChain(chain)) return null
    return new Connection(customRpc(chain.id) || rpcUrlForChain(chain.key) || chain.publicRpc, 'confirmed')
  }, [chain])
}

export function useSolanaClmmPositions() {
  const chain = useCurrentChain()
  const wallet = useSolanaWallet()
  const pools = useSolanaPools()
  const connection = useSolConnection()

  return useQuery<SolClmmPosition[]>({
    queryKey: ['solana-clmm-positions', chain.id, wallet.publicKey],
    queryFn: async () => {
      if (!isSolanaChain(chain) || !wallet.publicKey || !connection || !pools.data) return []

      const programId = chain.programs.raydiumClmm
      if (!programId) throw new Error('Solana adapter missing raydiumClmm program id')

      const owner = new PublicKey(wallet.publicKey)
      const { LiquidityMathUtil, TickUtil } = await import('@raydium-io/raydium-sdk-v2')
      const raydium = await getRaydium(owner)
      const positions = await raydium.clmm.getOwnerPositionInfo({ programId: new PublicKey(programId) })

      const poolByAddress = new Map<string, SolPool>()
      for (const pool of pools.data) {
        if (pool.program === 'raydium-clmm') poolByAddress.set(pool.address, pool)
      }

      const out: SolClmmPosition[] = []
      for (const pos of positions) {
        const pool = poolByAddress.get(pos.poolId.toBase58())
        if (!pool) continue

        const poolRpc = await raydium.clmm.getRpcClmmPoolInfo({ poolId: pos.poolId.toBase58() })
        const sqrtPriceCurrent = poolRpc.sqrtPriceX64
        const sqrtPriceLower = TickUtil.getSqrtPriceAtTick(pos.tickLower)
        const sqrtPriceUpper = TickUtil.getSqrtPriceAtTick(pos.tickUpper)
        const { amountA, amountB } = LiquidityMathUtil.getAmountsForLiquidity(
          sqrtPriceCurrent,
          sqrtPriceLower,
          sqrtPriceUpper,
          pos.liquidity,
          false,
        )

        const amountANum = bigintToNumber(BigInt(amountA.toString()), pool.tokenA.decimals)
        const amountBNum = bigintToNumber(BigInt(amountB.toString()), pool.tokenB.decimals)
        const feeOwedANum = bigintToNumber(BigInt(pos.tokenFeesOwedA.toString()), pool.tokenA.decimals)
        const feeOwedBNum = bigintToNumber(BigInt(pos.tokenFeesOwedB.toString()), pool.tokenB.decimals)

        const priceLower = TickUtil.tickToPrice(pos.tickLower, pool.tokenA.decimals, pool.tokenB.decimals)
        const priceUpper = TickUtil.tickToPrice(pos.tickUpper, pool.tokenA.decimals, pool.tokenB.decimals)

        const inRange = poolRpc.tickCurrent >= pos.tickLower && poolRpc.tickCurrent < pos.tickUpper

        // Concentrated liquidity is not fungible; do not present a misleading
        // pro-rata pool TVL as the position value.
        const valueUsd: number | null = null

        out.push({
          pool,
          nftMint: pos.nftMint.toBase58(),
          tickLower: pos.tickLower,
          tickUpper: pos.tickUpper,
          priceLower: Number(priceLower.toString()),
          priceUpper: Number(priceUpper.toString()),
          liquidity: BigInt(pos.liquidity.toString()),
          amountA: amountANum,
          amountB: amountBNum,
          feeOwedA: feeOwedANum,
          feeOwedB: feeOwedBNum,
          inRange,
          valueUsd,
        })
      }

      return out.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0))
    },
    enabled: isSolanaChain(chain) && wallet.connected && !!pools.data && !!connection,
    refetchInterval: 15_000,
    staleTime: 10_000,
  })
}

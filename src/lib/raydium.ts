// Raydium AMM V4 liquidity service.
// Wraps @raydium-io/raydium-sdk-v2 to add/remove liquidity for Solana pools
// indexed by our application. Handles ATA creation and WSOL wrapping.
import { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js'
import type { ApiV3PoolInfoStandardItem, Raydium } from '@raydium-io/raydium-sdk-v2'
import { requireSolanaChain } from './chains'
import { solana } from './chains'
import type { SolPool } from '../types'
import { rpcUrlForChain } from '../config/env'
import { customRpc } from './rpcPref'

const solanaChain = requireSolanaChain(solana)

export async function getRaydium(owner: PublicKey): Promise<Raydium> {
  const { Raydium } = await import('@raydium-io/raydium-sdk-v2')
  const connection = new Connection(customRpc(solanaChain.id) || rpcUrlForChain(solanaChain.key) || solanaChain.publicRpc, 'confirmed')
  return Raydium.load({
    connection,
    owner,
    cluster: 'mainnet',
    disableLoadToken: true,
  })
}

async function fetchPoolInfo(raydium: Raydium, poolId: string): Promise<ApiV3PoolInfoStandardItem> {
  const pools = await raydium.api.fetchPoolById({ ids: poolId })
  const info = pools.find((p) => p.id === poolId)
  if (!info) throw new Error(`Pool ${poolId} not found in Raydium API`)
  if (info.type !== 'Standard' || !('marketId' in info)) throw new Error(`Pool ${poolId} is not a Raydium AMM V4 pool`)
  return info
}

export type LiquidityResult = { txid: string }

export async function addRaydiumLiquidity(args: {
  pool: SolPool
  amountA: bigint
  amountB: bigint
  fixedSide: 'a' | 'b'
  slippage: number // 0.01 = 1%
  owner: string
    signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>
}): Promise<LiquidityResult> {
  const owner = new PublicKey(args.owner)
  if (args.pool.poolType !== 'amm' || args.pool.program !== 'raydium-amm-v4') throw new Error('Only Raydium AMM V4 pools are supported')
  const { Token, TokenAmount, TxVersion } = await import('@raydium-io/raydium-sdk-v2')
  const raydium = await getRaydium(owner)
  const poolInfo = await fetchPoolInfo(raydium, args.pool.address)

  const tokenA = new Token({ mint: args.pool.tokenA.mint, decimals: args.pool.tokenA.decimals })
  const tokenB = new Token({ mint: args.pool.tokenB.mint, decimals: args.pool.tokenB.decimals })
  const amountInA = new TokenAmount(tokenA, args.amountA.toString(), true)
  const amountInB = new TokenAmount(tokenB, args.amountB.toString(), true)

  // otherAmountMin protects against slippage on the non-fixed side.
  const fixed = args.fixedSide === 'a' ? amountInA : amountInB
  const other = args.fixedSide === 'a' ? amountInB : amountInA
  const minOther = new TokenAmount(
    args.fixedSide === 'a' ? tokenB : tokenA,
    (BigInt(other.raw.toString()) * BigInt(Math.floor((1 - args.slippage) * 10000)) / 10000n).toString(),
    true,
  )

  const txData = await raydium.liquidity.addLiquidity({
    poolInfo,
    amountInA,
    amountInB,
    otherAmountMin: minOther,
    fixedSide: args.fixedSide,
    txVersion: TxVersion.V0,
  })

  const tx = txData.transaction as VersionedTransaction
  const signed = await args.signTransaction(tx)
  const txid = await raydium.connection.sendTransaction(signed, { maxRetries: 3 })
  await raydium.connection.confirmTransaction(txid, 'confirmed')
  return { txid }
}

export async function removeRaydiumLiquidity(args: {
  pool: SolPool
  lpAmount: bigint
  slippage: number
  owner: string
    signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>
}): Promise<LiquidityResult> {
  const owner = new PublicKey(args.owner)
  if (args.pool.poolType !== 'amm' || args.pool.program !== 'raydium-amm-v4' || !args.pool.lpMint) throw new Error('Only Raydium AMM V4 pools are supported')
  const { Token, TokenAmount, TxVersion } = await import('@raydium-io/raydium-sdk-v2')
  const raydium = await getRaydium(owner)
  const poolInfo = await fetchPoolInfo(raydium, args.pool.address)

  // Estimate min output using current reserves and share.
  const reserveA = BigInt(args.pool.reserveA)
  const reserveB = BigInt(args.pool.reserveB)
  const lpTotal = args.pool.lpTotalSupply ? BigInt(args.pool.lpTotalSupply) : 0n
  if (lpTotal === 0n) throw new Error('Pool LP total supply unavailable')

  const outA = (reserveA * args.lpAmount) / lpTotal
  const outB = (reserveB * args.lpAmount) / lpTotal
  const slippageFactor = BigInt(Math.floor((1 - args.slippage) * 10000))
  const minA = (outA * slippageFactor) / 10000n
  const minB = (outB * slippageFactor) / 10000n

  const txData = await raydium.liquidity.removeLiquidity({
    poolInfo,
    lpAmount: new TokenAmount(
      new Token({ mint: args.pool.lpMint, decimals: poolInfo.lpMint.decimals }),
      args.lpAmount.toString(),
      true,
    ),
    baseAmountMin: new TokenAmount(
      new Token({ mint: args.pool.tokenA.mint, decimals: args.pool.tokenA.decimals }),
      minA.toString(),
      true,
    ),
    quoteAmountMin: new TokenAmount(
      new Token({ mint: args.pool.tokenB.mint, decimals: args.pool.tokenB.decimals }),
      minB.toString(),
      true,
    ),
    txVersion: TxVersion.V0,
  })

  const tx = txData.transaction as VersionedTransaction
  const signed = await args.signTransaction(tx)
  const txid = await raydium.connection.sendTransaction(signed, { maxRetries: 3 })
  await raydium.connection.confirmTransaction(txid, 'confirmed')
  return { txid }
}

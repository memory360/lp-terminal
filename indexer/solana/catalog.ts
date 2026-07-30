// Low-cost Raydium catalog. The official API is the primary inventory source;
// private RPC is reserved for wallet positions and transaction-time reads.
import { parseUnits } from 'viem'
import { currentChain } from '../chains'
import { requireSolanaChain } from '../../src/lib/chains'
import { log } from './config'
import { insertPool, upsertState, upsertTokenMeta } from './store'

const chain = requireSolanaChain(currentChain)
const API = 'https://api-v3.raydium.io/pools/info/list'
// ponytail: top 1000 by liquidity per type covers the UI; add cursor paging
// only when long-tail pool/address lookup is required.
const PAGE_SIZE = 1000

type Mint = { address: string; symbol: string; decimals: number }
type ApiPool = {
  id: string
  programId: string
  mintA: Mint
  mintB: Mint
  mintAmountA: number
  mintAmountB: number
  feeRate: number
  tvl: number
  lpMint?: Mint
  lpAmount?: number
}
type ApiResponse = { success: boolean; msg?: string; data?: { data: ApiPool[] } }

function raw(amount: number | undefined, decimals: number): bigint | undefined {
  if (amount == null || !Number.isFinite(amount) || amount < 0) return undefined
  try {
    return parseUnits(amount.toFixed(decimals), decimals)
  } catch {
    return undefined
  }
}

async function sync(poolType: 'standard' | 'concentrated', programId: string, program: string, kind: 'amm' | 'clmm') {
  const url = new URL(API)
  url.search = new URLSearchParams({
    poolType,
    poolSortField: 'liquidity',
    sortType: 'desc',
    pageSize: String(PAGE_SIZE),
    page: '1',
  }).toString()
  const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`Raydium API ${response.status}`)
  const json = await response.json() as ApiResponse
  if (!json.success || !json.data) throw new Error(`Raydium API: ${json.msg ?? 'invalid response'}`)

  let synced = 0
  for (const pool of json.data.data) {
    if (pool.programId !== programId) continue
    insertPool({
      address: pool.id,
      program,
      poolType: kind,
      tokenA: pool.mintA.address,
      tokenB: pool.mintB.address,
      decimalsA: pool.mintA.decimals,
      decimalsB: pool.mintB.decimals,
      symbolA: pool.mintA.symbol,
      symbolB: pool.mintB.symbol,
      lpMint: pool.lpMint?.address,
      lpDecimals: pool.lpMint?.decimals,
      feeBps: Math.round(pool.feeRate * 10_000),
    })
    upsertTokenMeta(pool.mintA.address, pool.mintA.symbol, pool.mintA.decimals)
    upsertTokenMeta(pool.mintB.address, pool.mintB.symbol, pool.mintB.decimals)
    upsertState(pool.id, {
      reserveA: raw(pool.mintAmountA, pool.mintA.decimals),
      reserveB: raw(pool.mintAmountB, pool.mintB.decimals),
      lpTotalSupply: raw(pool.lpAmount, pool.lpMint?.decimals ?? 0),
      tvlUsd: pool.tvl,
    })
    synced++
  }
  log('[sol-catalog]', `${program}: ${synced} pools synced from Raydium API`)
  return { added: synced, total: synced }
}

export const syncRaydiumAmmV4 = () => {
  if (!chain.programs.raydiumAmm) throw new Error('Solana adapter missing raydiumAmm program id')
  return sync('standard', chain.programs.raydiumAmm, 'raydium-amm-v4', 'amm')
}

export const syncRaydiumClmm = () => {
  if (!chain.programs.raydiumClmm) throw new Error('Solana adapter missing raydiumClmm program id')
  return sync('concentrated', chain.programs.raydiumClmm, 'raydium-clmm', 'clmm')
}

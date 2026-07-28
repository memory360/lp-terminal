// Solana pool TVL calculator.
// Uses cached token prices (sol_tokens.price_usd) and latest vault reserves
// (sol_pool_state) to compute pool TVL and writes it back.
import { log } from './config'
import { allPoolAddrs, poolRow, poolState, tokenByMint, upsertState } from './store'

function reserveToUsd(raw: bigint, decimals: number | null, priceUsd: number | null): number | null {
  if (decimals == null || priceUsd == null) return null
  return (Number(raw) / 10 ** decimals) * priceUsd
}

export async function computePoolTvls(): Promise<void> {
  const addrs = allPoolAddrs()
  let updated = 0
  for (const addr of addrs) {
    const pool = poolRow(addr)
    const state = poolState(addr)
    if (!pool || !state) continue
    const tokenA = tokenByMint(pool.token_a)
    const tokenB = tokenByMint(pool.token_b)
    if (!tokenA || !tokenB) continue

    const reserveA = BigInt(state.reserve_a ?? '0')
    const reserveB = BigInt(state.reserve_b ?? '0')
    const usdA = reserveToUsd(reserveA, pool.decimals_a ?? tokenA.decimals, tokenA.price_usd)
    const usdB = reserveToUsd(reserveB, pool.decimals_b ?? tokenB.decimals, tokenB.price_usd)

    const tvlUsd = usdA != null && usdB != null ? usdA + usdB : usdA ?? usdB ?? null
    upsertState(addr, { reserveA, reserveB, tvlUsd })
    if (tvlUsd != null) updated++
  }
  log('[sol-tvl] computed', updated, '/', addrs.length, 'pool TVLs')
}

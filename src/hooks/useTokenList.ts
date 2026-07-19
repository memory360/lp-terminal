import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { ADDR, EXPLORER } from '../config/addresses'
import { NATIVE, kyberTokenList } from '../lib/kyber'
import { walletTokensOf } from '../lib/walletTokens'
import type { TokenInfo } from '../types'
import { usePools } from './usePools'

const PINNED: string[] = [NATIVE, ADDR.WETH, ADDR.USDG, ADDR.UP].map((a) => a.toLowerCase())

/** merged token list for the swap picker: ETH + pool tokens + ks-setting registry */
export function useTokenList(user?: Address): TokenInfo[] {
  const pools = usePools()
  const kyber = useQuery({
    queryKey: ['kyberTokens'],
    staleTime: 10 * 60_000,
    refetchInterval: false,
    queryFn: kyberTokenList,
  })
  const wallet = useQuery({
    queryKey: ['walletTokens', user],
    enabled: !!user,
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: 1,
    queryFn: async () => {
      const r = await fetch(`${EXPLORER}/api/v2/addresses/${user}/token-balances`)
      if (!r.ok) throw new Error(`blockscout ${r.status}`)
      return walletTokensOf(await r.json())
    },
  })

  const map = new Map<string, TokenInfo>()
  map.set(NATIVE.toLowerCase(), {
    address: NATIVE as Address,
    symbol: 'ETH',
    decimals: 18,
    native: true,
  })
  if (pools.data) {
    for (const [k, t] of Object.entries(pools.data.tokens)) map.set(k, t)
  }
  for (const t of kyber.data ?? []) {
    const k = t.address.toLowerCase()
    if (k === NATIVE.toLowerCase()) continue
    if (!map.has(k)) map.set(k, { address: t.address, symbol: t.symbol, decimals: t.decimals })
  }
  for (const t of wallet.data ?? []) {
    const k = t.info.address.toLowerCase()
    if (!map.has(k)) map.set(k, t.info)
  }

  const held = new Set((wallet.data ?? []).map((t) => t.info.address.toLowerCase()))
  const list = [...map.values()]
  list.sort((a, b) => {
    const ai = PINNED.indexOf(a.address.toLowerCase())
    const bi = PINNED.indexOf(b.address.toLowerCase())
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    const ah = held.has(a.address.toLowerCase())
    const bh = held.has(b.address.toLowerCase())
    if (ah !== bh) return ah ? -1 : 1
    return a.symbol.localeCompare(b.symbol)
  })
  return list
}

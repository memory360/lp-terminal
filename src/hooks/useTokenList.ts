import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { NATIVE, kyberTokenList } from '../lib/kyber'
import { walletTokensOf } from '../lib/walletTokens'
import type { TokenInfo } from '../types'
import { requireEvmChain } from '../lib/chains'
import { useCurrentChain } from './useChain'
import { usePools } from './usePools'

/** merged token list for the swap picker: ETH + pool tokens + ks-setting registry */
export function useTokenList(user?: Address): TokenInfo[] {
  const chain = requireEvmChain(useCurrentChain())
  const pools = usePools()
  const pinned = [
    NATIVE,
    chain.anchors.weth,
    chain.anchors.stable,
    chain.anchors.up,
  ].filter(Boolean) as Address[]
  const pinnedSet = new Set(pinned.map((a) => a.toLowerCase()))

  const kyber = useQuery({
    queryKey: ['kyberTokens', chain.id],
    staleTime: 10 * 60_000,
    refetchInterval: false,
    queryFn: async () => kyberTokenList(chain.id),
  })
  const wallet = useQuery({
    queryKey: ['walletTokens', chain.id, user],
    enabled: !!user && !!chain.explorerApi.walletTokenBalancesUrl,
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: 1,
    queryFn: async () => {
      const url = chain.explorerApi.walletTokenBalancesUrl?.(user!)
      if (!url) return []
      const r = await fetch(url)
      if (!r.ok) throw new Error(`explorer ${r.status}`)
      return walletTokensOf(await r.json())
    },
  })

  const map = new Map<string, TokenInfo>()
  map.set(NATIVE.toLowerCase(), {
    address: NATIVE as Address,
    symbol: chain.nativeCurrency.symbol,
    decimals: chain.nativeCurrency.decimals,
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
  const pinnedOrder = Array.from(pinnedSet)
  const list = [...map.values()]
  list.sort((a, b) => {
    const ai = pinnedOrder.indexOf(a.address.toLowerCase())
    const bi = pinnedOrder.indexOf(b.address.toLowerCase())
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    const ah = held.has(a.address.toLowerCase())
    const bh = held.has(b.address.toLowerCase())
    if (ah !== bh) return ah ? -1 : 1
    return a.symbol.localeCompare(b.symbol)
  })
  return list
}

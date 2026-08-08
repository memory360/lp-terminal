// Robinhood-only compatibility exports for component labs and maintenance
// scripts. Runtime application code must use ChainAdapter instead.
import type { Address } from 'viem'
import { robinhood } from '../chains/robinhood'
import { requireEvmChain } from '../lib/chains'

const rh = requireEvmChain(robinhood)
const up33 = rh.up33!

/** Native currency sentinel used by Kyber / bridge providers */
export const NATIVE = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' as Address

export const ADDR = {
  ...up33,
  WETH: rh.anchors.weth,
  USDG: rh.anchors.stable,
} as const

export const UNI = {
  V3_FACTORY: rh.uniswap.v3Factory,
  V3_NPM: rh.uniswap.v3Npm,
  V2_FACTORY: rh.uniswap.v2Factory,
  V2_ROUTER: rh.uniswap.v2Router,
} as const

export const EXPLORER = rh.explorerUrl
export const DEXSCREENER = `https://dexscreener.com/${rh.dexScreenerChain}`
export const WEEK = 604800
export const CHAIN_ID = rh.id

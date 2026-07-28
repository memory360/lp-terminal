// Indexer-side chain selection. One indexer process indexes exactly one chain;
// set CHAIN=bsc (or CHAIN=robinhood) when starting it. The frontend switches
// between indexer endpoints; see src/lib/chains.ts for the shared adapters.
import { bsc, getChainById, getChainByKey, robinhood, type ChainAdapter } from '../src/lib/chains'

const CHAIN_KEY = (process.env.CHAIN ?? 'robinhood').toLowerCase().trim()

export const currentChain: ChainAdapter = getChainByKey(CHAIN_KEY) ?? robinhood

export const CHAIN_ID = currentChain.id

export function requireChainId(id: number): ChainAdapter {
  const c = getChainById(id)
  if (!c) throw new Error(`unsupported chain id ${id}`)
  return c
}

import { bsc } from '../chains/bsc'
import { robinhood } from '../chains/robinhood'
import { solana } from '../chains/solana'
import type {
  ChainAdapter,
  ChainId,
  EvmChainAdapter,
  ExplorerApiType,
  SolanaChainAdapter,
} from '../chains/types'
import { isEvmChain, isSolanaChain } from '../chains/types'

const CHAINS: ChainAdapter[] = [robinhood, bsc, solana]

export const getChainById = (id: number | string): ChainAdapter | undefined =>
  CHAINS.find((chain) => chain.id === Number(id))

export const getChainByKey = (key: string): ChainAdapter | undefined =>
  CHAINS.find((chain) => chain.key === key.toLowerCase())

export const getAllChains = (): ChainAdapter[] => CHAINS

export function requireEvmChain(chain: ChainAdapter): EvmChainAdapter {
  if (!isEvmChain(chain)) throw new Error(`Expected EVM chain, got ${chain.key} (${chain.paradigm})`)
  return chain
}

export function requireSolanaChain(chain: ChainAdapter): SolanaChainAdapter {
  if (!isSolanaChain(chain)) throw new Error(`Expected Solana chain, got ${chain.key} (${chain.paradigm})`)
  return chain
}

export { bsc, robinhood, solana, isEvmChain, isSolanaChain }
export type { ChainAdapter, ChainId, EvmChainAdapter, ExplorerApiType, SolanaChainAdapter }

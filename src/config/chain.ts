// Re-export EVM chain definitions from the shared adapter registry for wagmi.
// Runtime chain selection is handled by src/hooks/useChain.ts.
// Solana is excluded here because it is not EVM-compatible and uses its own
// wallet/transport stack.
import { bsc as bscAdapter, getAllChains, requireEvmChain, robinhood as robinhoodAdapter } from '../lib/chains'
import { isEvmChain } from '../lib/chains'

export const robinhood = { ...requireEvmChain(robinhoodAdapter).viemChain, id: 4663 } as const
export const bsc = { ...requireEvmChain(bscAdapter).viemChain, id: 56 } as const

export const supportedChains = getAllChains()
  .filter(isEvmChain)
  .map((c) => ({ ...c.viemChain, id: c.id }))

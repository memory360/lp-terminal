import type { Address, Chain } from 'viem'

export type ExplorerApiType = 'blockscout' | 'etherscan'

/** EVM chain IDs plus Solana. Solana uses 101 (mainnet-beta) as its
 *  wallet-visible identifier in this codebase. */
export type ChainId = 4663 | 56 | 101

export type ChainParadigm = 'evm' | 'solana'

// ------------------------------------------------------------------
// Shared fields for every supported chain.
// ------------------------------------------------------------------
export interface ChainAdapterBase {
  id: ChainId
  key: string
  name: string
  /** Runtime paradigm discriminator. */
  paradigm: ChainParadigm
  nativeCurrency: { name: string; symbol: string; decimals: number }
  wrappedNativeSymbol: string
  publicRpc: string
  /** Optional same-origin server proxy used when no build-time RPC is set. */
  rpcProxyUrl?: string
  explorerUrl: string
  dexScreenerChain: string
  geckoTerminalNetwork: string
  /** Browser-facing indexer URL. Omit to use same-origin /api. */
  indexerUrl?: string
}

// ------------------------------------------------------------------
// EVM chain adapter (Robinhood, BSC, and future EVM chains).
// ------------------------------------------------------------------
export interface EvmChainAdapter extends ChainAdapterBase {
  paradigm: 'evm'
  explorerApi: {
    type: ExplorerApiType
    base: string
    apiKey?: string
    logsUrl(args: { fromBlock: number; address: Address; topic0: `0x${string}` }): string
    walletTokenBalancesUrl?(owner: Address): string
  }
  /** Optional Uniswap V2 subgraph endpoint for 24h volume/liquidity stats.
   *  When unset, V2 pools fall back to DexScreener only (no volume history). */
  v2SubgraphUrl?: string
  anchors: { weth: Address; stable: Address; up?: Address }
  up33?: {
    UP: Address
    VE_UP: Address
    VOTER: Address
    MINTER: Address
    V2_FACTORY: Address
    V2_ROUTER: Address
    CL_FACTORY: Address
    CL_PM: Address
    CL_SWAP_ROUTER: Address
    CL_QUOTER: Address
  }
  uniswap: {
    v3Factory: Address
    v3Npm: Address
    v2Factory: Address
    v2Router: Address
    feeTiers: { feePpm: number; tickSpacing: number }[]
  }
  protocols?: {
    virtuals?: { launcher: Address; preLaunchedTopic: `0x${string}` }
  }
  kyberChain: string
  viemChain: Chain & { id: ChainId }
}

// ------------------------------------------------------------------
// Solana chain adapter.
// ------------------------------------------------------------------
export type SolanaTokenMint = string // base58
export type SolanaProgramId = string // base58

export interface SolanaChainAdapter extends ChainAdapterBase {
  paradigm: 'solana'
  /** Wrapped SOL mint (e.g. So1111...). */
  wrappedNative: SolanaTokenMint
  /** Stablecoin anchor (e.g. USDC EPjF...). */
  stable: SolanaTokenMint
  /** DEX program IDs we know how to index/decode. */
  programs: {
    /** Raydium V4 AMM pools. */
    raydiumAmm?: SolanaProgramId
    /** Raydium CLMM (Concentrated Liquidity Market Maker). */
    raydiumClmm?: SolanaProgramId
    /** Orca Whirlpools. */
    orcaWhirlpools?: SolanaProgramId
    /** Meteora DLMM. */
    meteoraDlmm?: SolanaProgramId
    /** Jupiter aggregator program (for swap routing). */
    jupiter?: SolanaProgramId
  }
  /** Jupiter Swap API base URL or a same-origin proxy. */
  jupiterBase: string
}

/** Union type used throughout the app. */
export type ChainAdapter = EvmChainAdapter | SolanaChainAdapter

// ------------------------------------------------------------------
// Type guards
// ------------------------------------------------------------------
export function isEvmChain(chain: ChainAdapter): chain is EvmChainAdapter {
  return chain.paradigm === 'evm'
}

export function isSolanaChain(chain: ChainAdapter): chain is SolanaChainAdapter {
  return chain.paradigm === 'solana'
}

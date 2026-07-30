import type { ChainAdapter } from '../types'

// Well-known Solana mainnet addresses.
export const SOL_MINT = 'So11111111111111111111111111111111111111112'
export const WRAPPED_SOL_MINT = 'So11111111111111111111111111111111111111112' // native SOL wraps into this ATA mint
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

export const RAYDIUM_AMM_V4 = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'
export const RAYDIUM_CLMM = 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK'
export const ORCA_WHIRLPOOLS = 'whirLbMiicvqgQ7QJF8ij1Q1UXUk1D8tQyHcKjn4Gjg'
export const METEORA_DLMM = 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo'
export const JUPITER_AGG_V6 = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'

// Helius free tier is the default public RPC; apps should set RPC_SOLANA in .env
// for a dedicated endpoint because getProgramAccounts is heavy.
export const solana: ChainAdapter = {
  id: 101,
  key: 'solana',
  name: 'Solana',
  paradigm: 'solana',
  nativeCurrency: { name: 'Solana', symbol: 'SOL', decimals: 9 },
  wrappedNativeSymbol: 'WSOL',
  publicRpc: 'https://api.mainnet-beta.solana.com',
  explorerUrl: 'https://solscan.io',
  dexScreenerChain: 'solana',
  geckoTerminalNetwork: 'solana',
  indexerUrl: '/api/chains/101/indexer',
  wrappedNative: WRAPPED_SOL_MINT,
  stable: USDC_MINT,
  programs: {
    raydiumAmm: RAYDIUM_AMM_V4,
    raydiumClmm: RAYDIUM_CLMM,
    orcaWhirlpools: ORCA_WHIRLPOOLS,
    meteoraDlmm: METEORA_DLMM,
    jupiter: JUPITER_AGG_V6,
  },
  jupiterBase:
    (typeof import.meta.env !== 'undefined' ? import.meta.env.JUPITER_API_BASE ?? '' : '').trim() ||
    'https://api.jup.ag/swap/v1',
}

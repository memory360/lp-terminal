// Solana pool catalog — Raydium AMM V4 and CLMM.
// Uses getProgramAccounts to discover pools on-chain and decodes the token
// mints, vaults, and state. Pools are idempotently inserted into the SQLite
// store.
import { PublicKey } from '@solana/web3.js'
import { liquidityStateV4Layout, PoolInfoLayout } from '@raydium-io/raydium-sdk-v2'
import { currentChain } from '../chains'
import { requireSolanaChain } from '../../src/lib/chains'
import { connection, log } from './config'
import { insertPool, upsertState } from './store'

const solanaChain = requireSolanaChain(currentChain)
const RAYDIUM_AMM_V4 = solanaChain.programs.raydiumAmm
const RAYDIUM_CLMM = solanaChain.programs.raydiumClmm
if (!RAYDIUM_AMM_V4) throw new Error('Solana adapter missing raydiumAmm program id')
if (!RAYDIUM_CLMM) throw new Error('Solana adapter missing raydiumClmm program id')

const AMM_V4_PROGRAM_ID = new PublicKey(RAYDIUM_AMM_V4)
const CLMM_PROGRAM_ID = new PublicKey(RAYDIUM_CLMM)

// Expected account data length for a Raydium AMM V4 pool.
const AMM_V4_DATA_LEN = 752

type DecodedAmmV4 = {
  baseDecimal: { toString(): string }
  quoteDecimal: { toString(): string }
  baseMint: PublicKey
  quoteMint: PublicKey
  lpMint: PublicKey
  baseVault: PublicKey
  quoteVault: PublicKey
}

function decodeAmmV4(data: Buffer): DecodedAmmV4 | null {
  if (data.length !== AMM_V4_DATA_LEN) return null
  try {
    const decoded = liquidityStateV4Layout.decode(data) as DecodedAmmV4
    return decoded
  } catch {
    return null
  }
}

/** Fetch all AMM V4 pool accounts and persist the ones we haven't seen. */
export async function syncRaydiumAmmV4(): Promise<{ added: number; total: number }> {
  log('[sol-catalog] scanning Raydium AMM V4 pools...')
  const accounts = await connection.getProgramAccounts(AMM_V4_PROGRAM_ID, {
    filters: [{ dataSize: AMM_V4_DATA_LEN }],
    commitment: 'confirmed',
    encoding: 'base64',
  })

  let added = 0
  let skipped = 0
  for (const { pubkey, account } of accounts) {
    const decoded = decodeAmmV4(Buffer.from(account.data))
    if (!decoded) {
      skipped++
      continue
    }
    const isNew = insertPool({
      address: pubkey.toBase58(),
      program: 'raydium-amm-v4',
      poolType: 'amm',
      tokenA: decoded.baseMint.toBase58(),
      tokenB: decoded.quoteMint.toBase58(),
      vaultA: decoded.baseVault.toBase58(),
      vaultB: decoded.quoteVault.toBase58(),
      lpMint: decoded.lpMint.toBase58(),
      decimalsA: Number(decoded.baseDecimal.toString()),
      decimalsB: Number(decoded.quoteDecimal.toString()),
    })
    if (isNew) added++
  }

  const total = accounts.length
  log(`[sol-catalog] raydium-amm-v4: ${total} accounts, ${added} new, ${skipped} skipped`)
  return { added, total }
}

const CLMM_DATA_LEN = 1544

function decodeClmm(data: Buffer): { tokenA: string; tokenB: string; vaultA: string; vaultB: string; decimalsA: number; decimalsB: number; sqrtPrice: string; tickCurrent: number; liquidity: string } | null {
  if (data.length !== CLMM_DATA_LEN) return null
  try {
    const decoded = PoolInfoLayout.decode(data) as {
      mintA: PublicKey
      mintB: PublicKey
      vaultA: PublicKey
      vaultB: PublicKey
      mintDecimalsA: number
      mintDecimalsB: number
      sqrtPriceX64: { toString(): string }
      tickCurrent: number
      liquidity: { toString(): string }
    }
    return {
      tokenA: decoded.mintA.toBase58(),
      tokenB: decoded.mintB.toBase58(),
      vaultA: decoded.vaultA.toBase58(),
      vaultB: decoded.vaultB.toBase58(),
      decimalsA: decoded.mintDecimalsA,
      decimalsB: decoded.mintDecimalsB,
      sqrtPrice: decoded.sqrtPriceX64.toString(),
      tickCurrent: decoded.tickCurrent,
      liquidity: decoded.liquidity.toString(),
    }
  } catch {
    return null
  }
}

/** Fetch all Raydium CLMM pool accounts and persist the ones we haven't seen. */
export async function syncRaydiumClmm(): Promise<{ added: number; total: number }> {
  log('[sol-catalog] scanning Raydium CLMM pools...')
  const accounts = await connection.getProgramAccounts(CLMM_PROGRAM_ID, {
    filters: [{ dataSize: CLMM_DATA_LEN }],
    commitment: 'confirmed',
    encoding: 'base64',
  })

  let added = 0
  let skipped = 0
  for (const { pubkey, account } of accounts) {
    const decoded = decodeClmm(Buffer.from(account.data))
    if (!decoded) {
      skipped++
      continue
    }
    const isNew = insertPool({
      address: pubkey.toBase58(),
      program: 'raydium-clmm',
      poolType: 'clmm',
      tokenA: decoded.tokenA,
      tokenB: decoded.tokenB,
      vaultA: decoded.vaultA,
      vaultB: decoded.vaultB,
      decimalsA: decoded.decimalsA,
      decimalsB: decoded.decimalsB,
    })
    upsertState(pubkey.toBase58(), {
      sqrtPrice: BigInt(decoded.sqrtPrice),
      tickCurrent: decoded.tickCurrent,
      liquidity: BigInt(decoded.liquidity),
    })
    if (isNew) added++
  }

  const total = accounts.length
  log(`[sol-catalog] raydium-clmm: ${total} accounts, ${added} new, ${skipped} skipped`)
  return { added, total }
}

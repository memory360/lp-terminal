// Solana pool state refresher.
// Reads vault token-account balances for every known pool and writes them to
// sol_pool_state. Prices/TVL are intentionally left for a later phase.
import { PublicKey } from '@solana/web3.js'
import { connection, log, TUNE } from './config'
import { allPoolAddrs, poolRow, upsertState } from './store'

// SPL Token Account layout: amount is a u64 at offset 64.
const TOKEN_ACCOUNT_AMOUNT_OFFSET = 64
// SPL Mint layout: supply is a u64 at offset 36.
const MINT_SUPPLY_OFFSET = 36

function readTokenAmount(data: Buffer): bigint | null {
  if (data.length < TOKEN_ACCOUNT_AMOUNT_OFFSET + 8) return null
  return data.readBigUInt64LE(TOKEN_ACCOUNT_AMOUNT_OFFSET)
}

function readMintSupply(data: Buffer): bigint | null {
  if (data.length < MINT_SUPPLY_OFFSET + 8) return null
  return data.readBigUInt64LE(MINT_SUPPLY_OFFSET)
}

/** Read vault balances and LP mint supplies for all pools in batches. */
export async function refreshPoolState(): Promise<void> {
  const addrs = allPoolAddrs()
  if (!addrs.length) return

  const pools: { addr: string; vaultA: string; vaultB: string; lpMint: string | null }[] = []
  for (const addr of addrs) {
    const row = poolRow(addr)
    if (!row?.vault_a || !row?.vault_b) continue
    pools.push({ addr, vaultA: row.vault_a, vaultB: row.vault_b, lpMint: row.lp_mint })
  }

  const vaultPubkeys = pools.flatMap((p) => [new PublicKey(p.vaultA), new PublicKey(p.vaultB)])
  const lpMintPubkeys = pools.map((p) => (p.lpMint ? new PublicKey(p.lpMint) : null)).filter(Boolean) as PublicKey[]
  const balances = new Map<string, bigint>()
  const supplies = new Map<string, bigint>()

  async function fetchBatch(keys: PublicKey[], reader: (d: Buffer) => bigint | null, target: Map<string, bigint>) {
    for (let i = 0; i < keys.length; i += TUNE.batch) {
      const batch = keys.slice(i, i + TUNE.batch)
      const infos = await connection.getMultipleAccountsInfo(batch, 'confirmed')
      for (let j = 0; j < batch.length; j++) {
        const info = infos[j]
        const key = batch[j].toBase58()
        if (!info?.data) {
          target.set(key, 0n)
          continue
        }
        target.set(key, reader(Buffer.from(info.data)) ?? 0n)
      }
    }
  }

  await fetchBatch(vaultPubkeys, readTokenAmount, balances)
  await fetchBatch(lpMintPubkeys, readMintSupply, supplies)

  let updated = 0
  for (const p of pools) {
    const reserveA = balances.get(p.vaultA) ?? 0n
    const reserveB = balances.get(p.vaultB) ?? 0n
    const lpTotalSupply = p.lpMint ? (supplies.get(p.lpMint) ?? null) : null
    upsertState(p.addr, { reserveA, reserveB, lpTotalSupply: lpTotalSupply ?? undefined })
    updated++
  }

  log('[sol-state] refreshed', updated, 'pool states')
}

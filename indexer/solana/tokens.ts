// Solana token metadata fetcher.
// Decimals are read on-chain from SPL Mint accounts. Symbols are fetched from
// Jupiter's token list (best-effort; unknown mints keep '?' until listed).
import { PublicKey } from '@solana/web3.js'
import { connection, log, sleep } from './config'
import { missingMetaMints, upsertTokenMeta } from './store'

const SPL_TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
const TOKEN_LIST_URL = 'https://token.jup.ag/all'

let symbolCache: Map<string, string> | null = null

async function loadSymbolCache(): Promise<Map<string, string>> {
  if (symbolCache) return symbolCache
  symbolCache = new Map<string, string>()
  try {
    const r = await fetch(TOKEN_LIST_URL, {
      headers: { accept: 'application/json' },
    })
    if (!r.ok) throw new Error(`jupiter token list ${r.status}`)
    const list = (await r.json()) as Array<{ address: string; symbol: string }>
    for (const t of list) {
      if (t.address && t.symbol) symbolCache.set(t.address, t.symbol)
    }
    log('[sol-tokens] loaded', symbolCache.size, 'symbols from Jupiter list')
  } catch (e) {
    log('[sol-tokens] failed to load Jupiter token list:', String(e))
  }
  return symbolCache
}

/** Read decimals from SPL Mint accounts in batches. */
async function fetchMintDecimals(mints: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  for (let i = 0; i < mints.length; i += 100) {
    const batch = mints.slice(i, i + 100).map((m) => new PublicKey(m))
    const infos = await connection.getMultipleAccountsInfo(batch, 'confirmed')
    for (let j = 0; j < batch.length; j++) {
      const info = infos[j]
      if (!info?.data) continue
      // SPL Mint layout: decimals is a u8 at offset 44.
      if (info.data.length < 45) continue
      const decimals = info.data.readUInt8(44)
      out.set(batch[j].toBase58(), decimals)
    }
  }
  return out
}

/** Fetch and persist decimals + symbols for all unknown mints. */
export async function syncTokenMetadata(): Promise<void> {
  const mints = missingMetaMints()
  if (!mints.length) return

  const symbols = await loadSymbolCache()
  const decimals = await fetchMintDecimals(mints)

  let updated = 0
  for (const mint of mints) {
    const dec = decimals.get(mint)
    if (dec === undefined) continue
    const symbol = symbols.get(mint) ?? '?'
    upsertTokenMeta(mint, symbol, dec)
    updated++
  }
  log('[sol-tokens] updated', updated, '/', mints.length, 'mint metadatas')
}

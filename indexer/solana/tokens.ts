// Solana token metadata fetcher.
// Decimals are read on-chain from SPL Mint accounts. Symbols are fetched from
// Jupiter Tokens V2 (best-effort; unknown mints keep '?' until listed).
import { PublicKey } from '@solana/web3.js'
import { connection, log } from './config'
import { missingMetaMints, upsertTokenMeta } from './store'

const TOKEN_SEARCH_URL = 'https://api.jup.ag/tokens/v2/search'

async function fetchSymbols(mints: string[]): Promise<Map<string, string>> {
  const symbols = new Map<string, string>()
  const apiKey = process.env.JUPITER_API_KEY?.trim()
  for (let i = 0; i < mints.length; i += 100) {
    const query = encodeURIComponent(mints.slice(i, i + 100).join(','))
    const r = await fetch(`${TOKEN_SEARCH_URL}?query=${query}`, {
      headers: { accept: 'application/json', ...(apiKey ? { 'x-api-key': apiKey } : {}) },
    })
    if (!r.ok) throw new Error(`jupiter token search ${r.status}`)
    const list = (await r.json()) as Array<{ id: string; symbol: string }>
    for (const token of list) if (token.id && token.symbol) symbols.set(token.id, token.symbol)
  }
  return symbols
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

  let symbols = new Map<string, string>()
  try {
    symbols = await fetchSymbols(mints)
  } catch (e) {
    log('[sol-tokens] failed to load Jupiter token metadata:', String(e))
  }
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

// Solana token price oracle.
// Primary: Jupiter Price API (free, mint->usd). Fallback: DexScreener token
// endpoint. Prices are cached in sol_tokens.price_usd and used by the TVL
// calculator.
import { log } from './config'
import { allPoolMints, setTokenPrice } from './store'

const JUPITER_PRICE_URL = 'https://api.jup.ag/price/v3'
const DEXSCREENER_TOKEN_URL = 'https://api.dexscreener.com/latest/dex/tokens'

// Jupiter Price V3 accepts up to 50 ids per call.
const JUPITER_BATCH = 50

async function fetchJupiter(mints: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (!mints.length) return out
  for (let i = 0; i < mints.length; i += JUPITER_BATCH) {
    const batch = mints.slice(i, i + JUPITER_BATCH)
    const url = `${JUPITER_PRICE_URL}?ids=${batch.join(',')}`
    try {
      const apiKey = process.env.JUPITER_API_KEY?.trim()
      const r = await fetch(url, {
        headers: { accept: 'application/json', ...(apiKey ? { 'x-api-key': apiKey } : {}) },
      })
      if (!r.ok) throw new Error(`jupiter ${r.status}`)
      const json = (await r.json()) as Record<string, { usdPrice: number } | undefined>
      for (const [mint, info] of Object.entries(json)) {
        if (info?.usdPrice) out.set(mint, info.usdPrice)
      }
    } catch (e) {
      log('[sol-prices] Jupiter batch failed:', String(e))
    }
  }
  return out
}

// DexScreener token endpoint accepts comma-separated mints (observed limit ~30).
const DEXS_BATCH = 30

async function fetchDexScreener(mints: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (!mints.length) return out
  for (let i = 0; i < mints.length; i += DEXS_BATCH) {
    const batch = mints.slice(i, i + DEXS_BATCH)
    const url = `${DEXSCREENER_TOKEN_URL}/${batch.join(',')}`
    try {
      const r = await fetch(url, { headers: { accept: 'application/json' } })
      if (!r.ok) throw new Error(`dexscreener ${r.status}`)
      const json = (await r.json()) as {
        pairs?: Array<{
          baseToken: { address: string }
          quoteToken: { address: string }
          priceUsd?: string
          liquidity?: { usd?: number }
        }>
      }
      // For each mint, keep the pair with highest reported liquidity.
      const best = new Map<string, { price: number; liq: number }>()
      for (const pair of json.pairs ?? []) {
        const price = Number(pair.priceUsd ?? '0')
        if (!price) continue
        const liq = pair.liquidity?.usd ?? 0
        const cur = best.get(pair.baseToken.address)
        if (!cur || liq > cur.liq) best.set(pair.baseToken.address, { price, liq })
      }
      for (const [mint, info] of best) out.set(mint, info.price)
    } catch (e) {
      log('[sol-prices] DexScreener batch failed:', String(e))
    }
  }
  return out
}

/** Fetch USD prices for mints, preferring Jupiter then DexScreener. */
export async function fetchTokenPrices(mints: string[]): Promise<Map<string, number>> {
  const unique = [...new Set(mints)]
  const jup = await fetchJupiter(unique)
  const missing = unique.filter((m) => !jup.has(m))
  const dexs = missing.length ? await fetchDexScreener(missing) : new Map<string, number>()
  const merged = new Map(jup)
  for (const [m, p] of dexs) merged.set(m, p)
  return merged
}

/** Update sol_tokens.price_usd for all mints that we have metadata for. */
export async function syncTokenPrices(): Promise<void> {
  const mints = allPoolMints()
  if (!mints.length) return

  const prices = await fetchTokenPrices(mints)
  let updated = 0
  for (const [mint, price] of prices) {
    setTokenPrice(mint, price)
    updated++
  }
  log('[sol-prices] updated', updated, '/', mints.length, 'prices')
}

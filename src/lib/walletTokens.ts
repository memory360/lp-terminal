import { isAddress } from 'viem'
import type { TokenInfo } from '../types'

export type WalletToken = { info: TokenInfo; balance: bigint }

export function walletTokensOf(raw: unknown): WalletToken[] {
  if (!Array.isArray(raw)) return []
  const out: WalletToken[] = []
  for (const row of raw) {
    const r = row as { value?: unknown; token?: Record<string, unknown> }
    const token = r.token
    const address = token?.address_hash
    const symbol = token?.symbol
    const decimals = Number(token?.decimals)
    let balance = 0n
    try {
      balance = BigInt(String(r.value ?? '0'))
    } catch {
      continue
    }
    if (
      token?.type !== 'ERC-20' ||
      typeof address !== 'string' ||
      !isAddress(address) ||
      typeof symbol !== 'string' ||
      !symbol.trim() ||
      !Number.isInteger(decimals) ||
      decimals < 0 ||
      decimals > 255 ||
      balance <= 0n
    )
      continue
    out.push({ info: { address, symbol: symbol.trim(), decimals }, balance })
  }
  return out
}

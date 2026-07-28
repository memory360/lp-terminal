// user-selectable RPC endpoint, persisted per-browser (localStorage).
// Read once at startup by config/wagmi.ts (highest-priority transport);
// changes apply via page reload.

const KEY = 'up33.rpcUrl.v2'
const HEALTH_KEY = 'up33.rpcHealth.v2'
const HEALTH_TTL = 5 * 60 * 1000 // successful probes may be refreshed periodically

export function customRpc(chainId: number): string {
  try {
    return (localStorage.getItem(`${KEY}.${chainId}`) ?? '').trim()
  } catch {
    return ''
  }
}

export function setCustomRpc(chainId: number, url: string) {
  try {
    const v = url.trim()
    if (v) localStorage.setItem(`${KEY}.${chainId}`, v)
    else localStorage.removeItem(`${KEY}.${chainId}`)
  } catch {
    /* storage unavailable — ignore */
  }
}

export function isValidRpcUrl(u: string): boolean {
  try {
    const p = new URL(u)
    return p.protocol === 'https:' || p.protocol === 'http:'
  } catch {
    return false
  }
}

/** cheap sanity check before saving: endpoint answers eth_chainId with the right chain */
export async function probeRpc(
  url: string,
  expectChainId: number,
  timeoutMs = 6_000,
): Promise<{ ok: true } | { ok: false; err: string }> {
  try {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), timeoutMs)
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
      signal: ctl.signal,
    })
    clearTimeout(t)
    const j = await r.json().catch(() => null)
    const id = typeof j?.result === 'string' ? parseInt(j.result, 16) : NaN
    if (!r.ok || !Number.isFinite(id)) return { ok: false, err: `no eth_chainId answer (http ${r.status})` }
    if (id !== expectChainId) return { ok: false, err: `wrong chain: got ${id}, need ${expectChainId}` }
    return { ok: true }
  } catch {
    return { ok: false, err: 'unreachable (network/CORS)' }
  }
}

/** Solana equivalent of probeRpc: getGenesisHash is cheap and chain-specific. */
export async function probeSolanaRpc(
  url: string,
  timeoutMs = 6_000,
): Promise<{ ok: true } | { ok: false; err: string }> {
  try {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), timeoutMs)
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getGenesisHash', params: [] }),
      signal: ctl.signal,
    })
    clearTimeout(t)
    const j = await r.json().catch(() => null)
    if (!r.ok || typeof j?.result !== 'string') return { ok: false, err: `no getGenesisHash answer (http ${r.status})` }
    return { ok: true }
  } catch {
    return { ok: false, err: 'unreachable (network/CORS)' }
  }
}

// RPC health status with timestamp for TTL
export type RpcHealth = {
  chainId: number
  url: string
  ok: boolean
  err?: string
  timestamp: number
}

// Save RPC health status to localStorage
export function saveRpcHealth(health: RpcHealth) {
  try {
    localStorage.setItem(`${HEALTH_KEY}.${health.chainId}`, JSON.stringify(health))
  } catch {
    /* storage unavailable — ignore */
  }
}

// Get cached RPC health status if still valid
export function getCachedRpcHealth(chainId: number, url: string): RpcHealth | null {
  try {
    const raw = localStorage.getItem(`${HEALTH_KEY}.${chainId}`)
    if (!raw) return null
    const health = JSON.parse(raw) as RpcHealth
    if (health.chainId !== chainId || health.url !== url) return null
    // Failed RPCs stay circuit-broken until the user clicks Retry. Automatically
    // expiring this record causes quota-exhausted endpoints to be hammered again.
    if (health.ok && Date.now() - health.timestamp > HEALTH_TTL) return null
    return health
  } catch {
    return null
  }
}

// Clear cached RPC health status for all chains — used by resetRpcHealth
export function clearAllRpcHealth(chainIds: number[]): void {
  try {
    for (const id of chainIds) {
      localStorage.removeItem(`${HEALTH_KEY}.${id}`)
    }
  } catch {
    /* storage unavailable — ignore */
  }
}

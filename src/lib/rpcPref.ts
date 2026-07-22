// user-selectable RPC endpoint, persisted per-browser (localStorage).
// Read once at startup by config/wagmi.ts (highest-priority transport);
// changes apply via page reload.

const KEY = 'up33.rpcUrl.v1'
const HEALTH_KEY = 'up33.rpcHealth.v1'
const HEALTH_TTL = 5 * 60 * 1000 // 5 minutes cache

export function customRpc(): string {
  try {
    return (localStorage.getItem(KEY) ?? '').trim()
  } catch {
    return ''
  }
}

export function setCustomRpc(url: string) {
  try {
    const v = url.trim()
    if (v) localStorage.setItem(KEY, v)
    else localStorage.removeItem(KEY)
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

// RPC health status with timestamp for TTL
export type RpcHealth = {
  url: string
  ok: boolean
  err?: string
  timestamp: number
}

// Save RPC health status to localStorage
export function saveRpcHealth(health: RpcHealth) {
  try {
    localStorage.setItem(HEALTH_KEY, JSON.stringify(health))
  } catch {
    /* storage unavailable — ignore */
  }
}

// Get cached RPC health status if still valid
export function getCachedRpcHealth(url: string): RpcHealth | null {
  try {
    const raw = localStorage.getItem(HEALTH_KEY)
    if (!raw) return null
    const health = JSON.parse(raw) as RpcHealth
    if (health.url !== url) return null
    if (Date.now() - health.timestamp > HEALTH_TTL) return null
    return health
  } catch {
    return null
  }
}

// Check if a URL is likely blocked (rate limited, quota exceeded) based on error
export function isBlockedError(err: string): boolean {
  const blockedPatterns = [
    '429', 'rate limit', 'quota', 'limit exceeded', 'too many requests',
    'exceeded', 'insufficient', 'service unavailable', '503', '500',
    'invalid api key', 'authentication', 'permission', 'access denied',
    'project id', 'api key', 'invalid key', 'key expired', 'rejected',
  ]
  return blockedPatterns.some(p => err.toLowerCase().includes(p))
}

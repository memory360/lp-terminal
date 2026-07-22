import { useEffect, useState } from 'react'
import { robinhood } from '../config/chain'
import { ENV, PUBLIC_RPC } from '../config/env'
import { customRpc, probeRpc, saveRpcHealth, getCachedRpcHealth, isBlockedError } from '../lib/rpcPref'

export type RpcStatus = 'checking' | 'healthy' | 'fallback' | 'unavailable'

export type RpcHealthState = {
  status: RpcStatus
  currentRpc: string
  usedFallback: boolean
  error?: string
}

/**
 * Hook that checks RPC availability on app startup.
 * If the configured RPC (ENV or user custom) is unhealthy, it updates the
 * health cache so wagmi will use the fallback transport.
 * 
 * This runs once per page load and:
 * 1. Checks if there's a cached health status (valid for 5 minutes)
 * 2. If no cache, probes the RPC endpoint
 * 3. If unhealthy and the error indicates blocking (rate limit, quota),
 *    updates the cache to skip this RPC on next page load
 * 4. Returns the current RPC status for UI display
 */
export function useRpcHealth(): RpcHealthState {
  const [state, setState] = useState<RpcHealthState>({
    status: 'checking',
    currentRpc: '',
    usedFallback: false,
  })

  useEffect(() => {
    let mounted = true
    
    const checkRpc = async () => {
      const userRpc = customRpc()
      const targetRpc = userRpc || ENV.rpcUrl
      const chainId = robinhood.id

      // No RPC configured, just use public
      if (!targetRpc) {
        if (mounted) {
          setState({
            status: 'healthy',
            currentRpc: PUBLIC_RPC,
            usedFallback: false,
          })
        }
        return
      }

      // Check cached health first
      const cached = getCachedRpcHealth(targetRpc)
      if (cached) {
        if (mounted) {
          setState({
            status: cached.ok ? 'healthy' : 'fallback',
            currentRpc: cached.ok ? targetRpc : PUBLIC_RPC,
            usedFallback: !cached.ok,
            error: cached.ok ? undefined : cached.err,
          })
        }
        return
      }

      // Probe the RPC endpoint
      const result = await probeRpc(targetRpc, chainId)
      
      if (!mounted) return

      // If unhealthy and likely blocked, save to cache to skip on next load
      if (!result.ok && isBlockedError(result.err)) {
        saveRpcHealth({
          url: targetRpc,
          ok: false,
          err: result.err,
          timestamp: Date.now(),
        })
      }

      setState({
        status: result.ok ? 'healthy' : 'fallback',
        currentRpc: result.ok ? targetRpc : PUBLIC_RPC,
        usedFallback: !result.ok,
        error: result.ok ? undefined : result.err,
      })
    }

    checkRpc()

    return () => {
      mounted = false
    }
  }, [])

  return state
}

/**
 * Reset the cached RPC health status, forcing a re-check on next page load.
 * This is useful when the user wants to retry a previously unhealthy RPC.
 */
export function resetRpcHealth() {
  try {
    localStorage.removeItem('up33.rpcHealth.v1')
  } catch {
    /* storage unavailable — ignore */
  }
}
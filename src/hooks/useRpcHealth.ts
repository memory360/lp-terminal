import { useEffect, useState } from 'react'
import { rpcUrlForChain } from '../config/env'
import {
  clearAllRpcHealth,
  customRpc,
  getCachedRpcHealth,
  isBlockedError,
  probeRpc,
  probeSolanaRpc,
  saveRpcHealth,
} from '../lib/rpcPref'
import { useCurrentChain } from './useChain'
import { getAllChains } from '../lib/chains'

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
  const chain = useCurrentChain()
  const [state, setState] = useState<RpcHealthState>({
    status: 'checking',
    currentRpc: '',
    usedFallback: false,
  })

  useEffect(() => {
    let mounted = true
    
    const checkRpc = async () => {
      const userRpc = customRpc(chain.id)
      const targetRpc = userRpc || rpcUrlForChain(chain.key)
      const chainId = chain.id

      // No RPC configured, just use public
      if (!targetRpc) {
        if (mounted) {
          setState({
            status: 'healthy',
            currentRpc: chain.publicRpc,
            usedFallback: false,
          })
        }
        return
      }

      // Check cached health first
      const cached = getCachedRpcHealth(chain.id, targetRpc)
      if (cached) {
        if (mounted) {
          setState({
            status: cached.ok ? 'healthy' : 'fallback',
            currentRpc: cached.ok ? targetRpc : chain.publicRpc,
            usedFallback: !cached.ok,
            error: cached.ok ? undefined : cached.err,
          })
        }
        return
      }

      // Probe the RPC endpoint
      const result = chain.paradigm === 'solana' ? await probeSolanaRpc(targetRpc) : await probeRpc(targetRpc, chainId)
      
      if (!mounted) return

      // If unhealthy and likely blocked, save to cache to skip on next load
      if (!result.ok && isBlockedError(result.err)) {
        saveRpcHealth({
          chainId,
          url: targetRpc,
          ok: false,
          err: result.err,
          timestamp: Date.now(),
        })
      }

      setState({
        status: result.ok ? 'healthy' : 'fallback',
        currentRpc: result.ok ? targetRpc : chain.publicRpc,
        usedFallback: !result.ok,
        error: result.ok ? undefined : result.err,
      })
    }

    checkRpc()

    return () => {
      mounted = false
    }
  }, [chain])

  return state
}

/**
 * Reset the cached RPC health status, forcing a re-check on next page load.
 * This is useful when the user wants to retry a previously unhealthy RPC.
 */
export function resetRpcHealth() {
  clearAllRpcHealth(getAllChains().map((c) => c.id))
  location.reload()
}

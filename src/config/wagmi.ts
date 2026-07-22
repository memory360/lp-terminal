import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { fallback, http, type Transport } from 'wagmi'
import { customRpc, getCachedRpcHealth } from '../lib/rpcPref'
import { robinhood } from './chain'
import { ENV, PUBLIC_RPC } from './env'

/**
 * Build transport list with automatic fallback.
 * If ENV RPC is cached as unhealthy, skip it and use public RPC.
 */
function buildTransport(): Transport {
  const userRpc = customRpc()
  
  // User-set custom RPC always wins
  if (userRpc) {
    const health = getCachedRpcHealth(userRpc)
    if (health && !health.ok) {
      // User RPC is known to be unhealthy, fall back to public
      return http(PUBLIC_RPC, { batch: true })
    }
    // Try user RPC first, fall back to public
    return fallback([http(userRpc, { batch: true }), http(PUBLIC_RPC, { batch: true })])
  }
  
  // ENV RPC from .env
  if (ENV.rpcUrl) {
    const health = getCachedRpcHealth(ENV.rpcUrl)
    if (health && !health.ok) {
      // ENV RPC is known to be unhealthy, skip it
      return import.meta.env.PROD
        ? fallback([http('/rpc', { batch: true }), http(PUBLIC_RPC, { batch: true })])
        : http(PUBLIC_RPC, { batch: true })
    }
    // Try ENV RPC first, fall back to public/proxy
    const backups: Transport[] = []
    if (import.meta.env.PROD) {
      backups.push(http('/rpc', { batch: true }))
    }
    backups.push(http(PUBLIC_RPC, { batch: true }))
    return fallback([http(ENV.rpcUrl, { batch: true }), ...backups])
  }
  
  // No ENV RPC configured
  return import.meta.env.PROD
    ? fallback([http('/rpc', { batch: true }), http(PUBLIC_RPC, { batch: true })])
    : http(PUBLIC_RPC, { batch: true })
}

// Read-transport resolution (one build works in every deployment):
//  - user-set custom RPC (footer control, localStorage) -> always wins
//  - RPC set in .env (personal/local build)  -> use it directly with fallback
//    to public RPC if unhealthy
//  - production build without RPC (server)   -> same-origin /rpc proxy (nginx keeps
//    the key server-side), falling back to the public RPC when no proxy exists
//    (plain static hosting)
//  - dev without RPC                          -> public RPC
//  - If any RPC is cached as unhealthy, it's skipped automatically
const transport = buildTransport()

export const wagmiConfig = getDefaultConfig({
  appName: 'UP33 Terminal',
  projectId: ENV.wcProjectId,
  chains: [robinhood],
  transports: { [robinhood.id]: transport },
  ssr: false,
})

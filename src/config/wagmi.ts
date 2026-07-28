import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { fallback, http, type Transport } from 'wagmi'
import { customRpc, getCachedRpcHealth } from '../lib/rpcPref'
import { robinhood, supportedChains } from './chain'
import { ENV, rpcUrlForChain } from './env'
import { getChainById } from '../lib/chains'

function chainPublicRpc(chainId: number): string {
  return supportedChains.find((chain) => chain.id === chainId)!.rpcUrls.default.http[0]
}

/**
 * Build transport list with automatic fallback for a specific chain.
 * - user-set custom RPC (footer control) wins for every chain
 * - ENV RPC is chain-agnostic legacy override (only used on robinhood id)
 * - public RPC is always the final fallback
 */
function buildTransport(chainId: number): Transport {
  const publicRpc = chainPublicRpc(chainId)
  const userRpc = customRpc(chainId)
  const adapter = getChainById(chainId)!
  const envRpc = rpcUrlForChain(adapter.key)

  if (userRpc) {
    const health = getCachedRpcHealth(chainId, userRpc)
    if (health && !health.ok) return http(publicRpc, { batch: true })
    return fallback([http(userRpc, { batch: true }), http(publicRpc, { batch: true })])
  }

  if (envRpc) {
    const health = getCachedRpcHealth(chainId, envRpc)
    if (health && !health.ok) {
      return http(publicRpc, { batch: true })
    }
    return fallback([http(envRpc, { batch: true }), http(publicRpc, { batch: true })])
  }

  return import.meta.env.PROD && adapter.rpcProxyUrl
    ? fallback([http(adapter.rpcProxyUrl, { batch: true }), http(publicRpc, { batch: true })])
    : http(publicRpc, { batch: true })
}

export const wagmiConfig = getDefaultConfig({
  appName: 'UP33 Terminal',
  projectId: ENV.wcProjectId,
  chains: supportedChains as unknown as readonly [typeof robinhood, ...typeof supportedChains],
  transports: Object.fromEntries(supportedChains.map((c) => [c.id, buildTransport(c.id)])),
  ssr: false,
})

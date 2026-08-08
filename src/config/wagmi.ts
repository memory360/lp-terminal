import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { fallback, http, type Transport } from 'wagmi'
import { arbitrum, base, mainnet, optimism } from 'wagmi/chains'
import { customRpc, getCachedRpcHealth } from '../lib/rpcPref'
import { robinhood, supportedChains } from './chain'
import { ENV, rpcUrlForChain } from './env'
import { getChainById } from '../lib/chains'

function chainPublicRpc(chainId: number): string {
  return supportedChains.find((chain) => chain.id === chainId)!.rpcUrls.default.http[0]
}

/** Re-check the shared health circuit on every request so a probe performed
 * after wagmi initialization can immediately stop traffic to a dead RPC. */
function healthAwareRpc(chainId: number, rpc: string, publicRpc: string): Transport {
  const primary = http(rpc, { batch: true })
  const publicNode = http(publicRpc, { batch: true })
  return (config) => {
    const primaryValue = primary(config)
    const publicValue = publicNode(config)
    return {
      ...primaryValue,
      key: `health-aware-${chainId}`,
      name: `Health-aware RPC ${chainId}`,
      request: (args) =>
        getCachedRpcHealth(chainId, rpc)?.ok === false
          ? publicValue.request(args)
          : primaryValue.request(args),
    }
  }
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
    return fallback([healthAwareRpc(chainId, userRpc, publicRpc), http(publicRpc, { batch: true })])
  }

  if (envRpc) {
    return fallback([healthAwareRpc(chainId, envRpc, publicRpc), http(publicRpc, { batch: true })])
  }

  return import.meta.env.PROD && adapter.rpcProxyUrl
    ? fallback([http(adapter.rpcProxyUrl, { batch: true }), http(publicRpc, { batch: true })])
    : http(publicRpc, { batch: true })
}

// Remote chains exist only as BRIDGE counterparties (origin-side sends +
// balance reads). They use their public RPCs; no custom RPC or env override.
const remoteTransport = (publics: string[]): Transport =>
  fallback(publics.map((u) => http(u, { batch: true })))

const remoteChains = [mainnet, arbitrum, base, optimism] as const

const configuredChains = [robinhood, ...supportedChains.filter((c) => c.id !== robinhood.id), ...remoteChains]

export const wagmiConfig = getDefaultConfig({
  appName: 'UP33 Terminal',
  projectId: ENV.wcProjectId,
  chains: configuredChains as unknown as readonly [typeof robinhood, ...typeof configuredChains],
  transports: {
    ...Object.fromEntries(supportedChains.map((c) => [c.id, buildTransport(c.id)])),
    [mainnet.id]: remoteTransport([
      'https://ethereum-rpc.publicnode.com',
      'https://eth.drpc.org',
      'https://eth.merkle.io',
    ]),
    [arbitrum.id]: remoteTransport([
      'https://arb1.arbitrum.io/rpc',
      'https://arbitrum-one-rpc.publicnode.com',
    ]),
    [base.id]: remoteTransport([
      'https://mainnet.base.org',
      'https://base-rpc.publicnode.com',
    ]),
    [optimism.id]: remoteTransport([
      'https://mainnet.optimism.io',
      'https://optimism-rpc.publicnode.com',
    ]),
  },
  ssr: false,
})

/** a chain id this wagmi config can actually serve (bridge steps come from
 *  provider APIs as plain numbers — validate before handing them to wagmi) */
export type ConfiguredChainId = (typeof wagmiConfig)['chains'][number]['id']

export function asConfiguredChain(id: number): ConfiguredChainId {
  const known = wagmiConfig.chains.find((c) => c.id === id)
  if (!known) throw new Error(`chain ${id} is not configured in this terminal`)
  return known.id
}

// Multi-provider Solana wallet hook.
// Detects Phantom, OKX, and Solflare providers in the browser and exposes a
// unified connect / disconnect / signTransaction interface. No
// @solana/wallet-adapter-react dependency needed.
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { VersionedTransaction } from '@solana/web3.js'

export type SolanaProviderName = 'phantom' | 'okx' | 'solflare'

export type SolanaProviderInfo = {
  name: SolanaProviderName
  label: string
  detected: boolean
}

type RawSolanaProvider = {
  publicKey?: { toBase58(): string } | null
  isConnected?: boolean
  connect: (opts?: { onlyIfTrusted: boolean }) => Promise<{ publicKey: { toBase58(): string } }>
  disconnect: () => Promise<void>
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>
  on: (event: string, cb: () => void) => void
  removeListener: (event: string, cb: () => void) => void
}

type OkxWallet = {
  solana?: RawSolanaProvider
}

declare global {
  interface Window {
    solana?: RawSolanaProvider & { isPhantom?: boolean; isSolflare?: boolean }
    okxwallet?: OkxWallet
    solflare?: RawSolanaProvider
  }
}

function detectProviders(): Map<SolanaProviderName, RawSolanaProvider> {
  const map = new Map<SolanaProviderName, RawSolanaProvider>()
  if (typeof window === 'undefined') return map

  // Phantom explicitly marks itself. OKX sometimes also injects into
  // window.solana, so check the dedicated flag first to avoid mis-attribution.
  if (window.solana?.isPhantom) {
    map.set('phantom', window.solana)
  }

  // OKX Solana provider lives under window.okxwallet.solana.
  if (window.okxwallet?.solana) {
    map.set('okx', window.okxwallet.solana)
  }

  // Solflare marks itself and also often injects as window.solflare.
  if (window.solflare) {
    map.set('solflare', window.solflare)
  }

  // Fallback: if window.solana exists but wasn't claimed by Phantom/OKX/Solflare,
  // treat it as a generic Solana provider labeled as Phantom for compatibility.
  if (window.solana && !map.has('phantom') && !map.has('solflare')) {
    map.set('phantom', window.solana)
  }

  return map
}

function labelOf(name: SolanaProviderName): string {
  switch (name) {
    case 'phantom':
      return 'Phantom'
    case 'okx':
      return 'OKX Wallet'
    case 'solflare':
      return 'Solflare'
  }
}

export type SolanaWallet = {
  providers: SolanaProviderInfo[]
  connected: boolean
  connecting: boolean
  publicKey: string | null
  activeProvider: SolanaProviderName | null
  connect: (name: SolanaProviderName) => Promise<void>
  disconnect: () => Promise<void>
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>
}

function useSolanaWalletState(): SolanaWallet {
  const [providersMap, setProvidersMap] = useState<Map<SolanaProviderName, RawSolanaProvider>>(detectProviders)
  const [active, setActive] = useState<SolanaProviderName | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [publicKey, setPublicKey] = useState<string | null>(null)

  const refresh = useCallback(() => {
    const map = detectProviders()
    setProvidersMap((previous) => {
      const unchanged = previous.size === map.size && [...map].every(([name, provider]) => previous.get(name) === provider)
      return unchanged ? previous : map
    })
    if (active && map.has(active)) {
      const p = map.get(active)!
      setPublicKey(p.publicKey?.toBase58() ?? null)
    } else if (active) {
      setActive(null)
      setPublicKey(null)
    }
  }, [active])

  useEffect(() => {
    refresh()
    // Detect wallets injected after page load. 2s is infrequent enough to
    // avoid wasted renders while still catching late injections.
    const interval = setInterval(refresh, 2_000)
    return () => clearInterval(interval)
  }, [refresh])

  useEffect(() => {
    if (!active) return
    const p = providersMap.get(active)
    if (!p) return
    const onConnect = () => refresh()
    const onDisconnect = () => refresh()
    const onAccountChange = () => refresh()
    p.on('connect', onConnect)
    p.on('disconnect', onDisconnect)
    p.on('accountChanged', onAccountChange)
    return () => {
      p.removeListener('connect', onConnect)
      p.removeListener('disconnect', onDisconnect)
      p.removeListener('accountChanged', onAccountChange)
    }
  }, [active, providersMap, refresh])

  const connect = useCallback(
    async (name: SolanaProviderName) => {
      const p = providersMap.get(name)
      if (!p) throw new Error(`${labelOf(name)} not installed`)
      setConnecting(true)
      try {
        await p.connect()
        setActive(name)
        setPublicKey(p.publicKey?.toBase58() ?? null)
      } finally {
        setConnecting(false)
      }
    },
    [providersMap],
  )

  const disconnect = useCallback(async () => {
    if (!active) return
    const p = providersMap.get(active)
    if (p) await p.disconnect()
    setActive(null)
    setPublicKey(null)
  }, [active, providersMap])

  const signTransaction = useCallback(
    async (tx: VersionedTransaction): Promise<VersionedTransaction> => {
      if (!active) throw new Error('No Solana wallet connected')
      const p = providersMap.get(active)
      if (!p) throw new Error('Wallet provider not available')
      return p.signTransaction(tx)
    },
    [active, providersMap],
  )

  const providers = useMemo<SolanaProviderInfo[]>(
    () =>
      (['phantom', 'okx', 'solflare'] as SolanaProviderName[]).map((name) => ({
        name,
        label: labelOf(name),
        detected: providersMap.has(name),
      })),
    [providersMap],
  )

  return {
    providers,
    connected: !!publicKey,
    connecting,
    publicKey,
    activeProvider: active,
    connect,
    disconnect,
    signTransaction,
  }
}

const SolanaWalletContext = createContext<SolanaWallet | null>(null)

export function SolanaWalletProvider({ children }: { children: ReactNode }) {
  return createElement(SolanaWalletContext.Provider, { value: useSolanaWalletState() }, children)
}

export function useSolanaWallet(): SolanaWallet {
  const wallet = useContext(SolanaWalletContext)
  if (!wallet) throw new Error('useSolanaWallet must be used inside SolanaWalletProvider')
  return wallet
}

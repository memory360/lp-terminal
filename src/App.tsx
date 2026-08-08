import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { WagmiProvider, useAccount, useSwitchChain } from 'wagmi'
import { QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import { wagmiConfig } from './config/wagmi'
import { queryClient } from './config/query'
import { currentLang } from './i18n'
import { allChains, ensureCurrentChainIndexer, setCurrentChain, useCurrentChain, useIndexerSwitching } from './hooks/useChain'
import { Header, type TabId } from './components/Header'
import { LangControl } from './components/LangControl'
import { RpcControl } from './components/RpcControl'
import { ThemeControl } from './components/ThemeControl'
import { THEMES, useTheme } from './lib/theme'
import { TxLogPanel } from './components/TxLogPanel'
import { LabTab } from './components/tabs/LabTab'
import { PoolsTab } from './components/tabs/PoolsTab'
import { PositionsTab } from './components/tabs/PositionsTab'
import { SolanaLiquidityTab } from './components/tabs/SolanaLiquidityTab'
import { SolanaPoolsTab } from './components/tabs/SolanaPoolsTab'
import { SolanaPositionsTab } from './components/tabs/SolanaPositionsTab'
import { SolanaSwapTab } from './components/tabs/SolanaSwapTab'
import { SwapTab } from './components/tabs/SwapTab'
import { BridgeTab } from './components/tabs/BridgeTab'
import { Btn } from './components/ui'
import { isEvmChain, isSolanaChain } from './lib/chains'
import { useRpcHealth, resetRpcHealth } from './hooks/useRpcHealth'
import { txlog } from './lib/txlog'
import { SolanaWalletProvider } from './hooks/useSolanaWallet'

export default function App() {
  const theme = useTheme() // wallet modal accent follows the terminal theme
  const { i18n } = useTranslation() // wallet modal language follows too
  void i18n.language
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: THEMES[theme].acc,
            accentColorForeground: THEMES[theme].accFg,
            borderRadius: 'none',
            overlayBlur: 'small',
          })}
          locale={currentLang() === 'zh' ? 'zh-CN' : 'en-US'}
          modalSize="compact"
        >
          <SolanaWalletProvider>
            <Shell />
          </SolanaWalletProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

const KEYS: Record<string, TabId> = { '1': 'pools', '2': 'positions', '3': 'swap', '4': 'liquidity', '5': 'bridge' }

const validTab = (h: string): TabId | null => {
  if (h === 'limit') return 'swap' // LIMIT mode is a sub-view of the swap tab
  if (h === 'lab') return 'pools' // hidden component lab rides the pools slot
  return (['pools', 'positions', 'swap', 'liquidity', 'bridge'] as const).includes(h as TabId) ? (h as TabId) : null
}

function ChainControl() {
  const { t } = useTranslation()
  const chain = useCurrentChain()
  const [busy, setBusy] = useState(false)
  return (
    <select
      className="chain-select"
      value={chain.id}
      disabled={busy}
      onChange={async (e) => {
        const c = allChains.find((c) => c.id === Number(e.target.value))
        if (!c || c.id === chain.id) return
        setBusy(true)
        try {
          await setCurrentChain(c)
        } catch (err) {
          txlog.push('err', t('app.chainSwitchFailed', { chain: c.name, err: (err as Error).message }))
        } finally {
          setBusy(false)
        }
      }}
    >
      {allChains.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  )
}

function Shell() {
  const { t } = useTranslation()
  const [tab, setTabState] = useState<TabId>(() => validTab(location.hash.slice(1)) ?? 'pools')
  const setTab = (t: TabId) => {
    setTabState(t)
    history.replaceState(null, '', '#' + t)
  }
  const { isConnected, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const rpcHealth = useRpcHealth()
  const chain = useCurrentChain()
  const indexerSwitching = useIndexerSwitching()
  const lastChainId = useRef(chain.id)
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    ensureCurrentChainIndexer().catch(() => undefined)
  }, [])

  useEffect(() => {
    if (chain.id !== lastChainId.current) {
      lastChainId.current = chain.id
      setSwitching(true)
      const h = setTimeout(() => setSwitching(false), 450)
      return () => clearTimeout(h)
    }
  }, [chain.id])

  useEffect(() => {
    const onHash = () => {
      const t = validTab(location.hash.slice(1))
      if (t) setTabState(t)
    }
    window.addEventListener('hashchange', onHash)
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '4') {
        // LIMIT is a sub-view of swap; location.hash fires hashchange so the
        // mounted SwapTab syncs its mode too
        setTabState('swap')
        location.hash = 'limit'
        return
      }
      const t = KEYS[e.key]
      if (t) {
        setTabState(t)
        history.replaceState(null, '', '#' + t)
      }
    }
    window.addEventListener('keydown', h)
    return () => {
      window.removeEventListener('hashchange', onHash)
      window.removeEventListener('keydown', h)
    }
  }, [])

  return (
    <div className="app">
      <Header tab={tab} onTab={setTab} chainControl={<ChainControl />} />
      <div className="main">
        {/* RPC health banner */}
        {rpcHealth.status === 'fallback' && (
          <div className="banner warn">
            {t('app.rpcFallback')}
            <Btn onClick={() => resetRpcHealth()}>{t('app.retryRpc')}</Btn>
          </div>
        )}
        {isEvmChain(chain) && isConnected && chainId !== chain.id && (
          <div className="banner">
            {t('app.wrongNetwork', { chain: chain.name })}
            <Btn onClick={() => switchChain({ chainId: chain.id })}>{t('app.switch')}</Btn>
          </div>
        )}
        {rpcHealth.status !== 'checking' && tab === 'pools' &&
          (location.hash === '#lab' ? <LabTab /> : isSolanaChain(chain) ? <SolanaPoolsTab /> : <PoolsTab />)}
        {rpcHealth.status !== 'checking' && tab === 'positions' && (isEvmChain(chain) ? <PositionsTab /> : <SolanaPositionsTab />)}
        {rpcHealth.status !== 'checking' && tab === 'swap' && (isEvmChain(chain) ? <SwapTab /> : <SolanaSwapTab />)}
        {rpcHealth.status !== 'checking' && tab === 'liquidity' && (isSolanaChain(chain) ? <SolanaLiquidityTab /> : <div className="dim">EVM liquidity management coming soon.</div>)}
        {rpcHealth.status !== 'checking' && tab === 'bridge' && (isEvmChain(chain) ? <BridgeTab /> : <div className="dim">Bridge is only available on Robinhood Chain.</div>)}
      </div>
      {(switching || indexerSwitching) && (
        <div className="chain-switch-overlay">
          <div className="chain-switch-spinner" />
          <span>{t('app.switchingChain', { chain: chain.name })}</span>
        </div>
      )}
      <TxLogPanel />
      <div className="footer">
        <span>{t('app.tagline')}</span>
        <span>{t('app.keys')}</span>
        {isEvmChain(chain) && <RpcControl />}
        <ThemeControl />
        <LangControl />
        <a href={chain.explorerUrl} target="_blank" rel="noreferrer">
          {t('app.blockscout')}
        </a>
      </div>
    </div>
  )
}

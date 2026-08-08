import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useTranslation } from 'react-i18next'
import { fmtDur } from '../lib/format'
import { useEpoch } from '../hooks/useEpoch'
import { usePools } from '../hooks/usePools'
import { useCurrentChain } from '../hooks/useChain'
import { useSolanaWallet } from '../hooks/useSolanaWallet'
import { isSolanaChain } from '../lib/chains'
import { shortAddr } from '../lib/format'
import { txlog } from '../lib/txlog'
import type { ReactNode } from 'react'

export type TabId = 'pools' | 'positions' | 'swap' | 'liquidity' | 'bridge'
const TABS = [
  { id: 'pools', labelKey: 'hdr.pools', key: '1' },
  { id: 'positions', labelKey: 'hdr.positions', key: '2' },
  { id: 'swap', labelKey: 'hdr.swap', key: '3' },
  { id: 'liquidity', labelKey: 'hdr.liquidity', key: '4' },
  { id: 'bridge', labelKey: 'hdr.bridge', key: '5' },
] as const

export function Header(props: { tab: TabId; onTab: (t: TabId) => void; chainControl: ReactNode }) {
  const { t } = useTranslation()
  const epoch = useEpoch()
  const pools = usePools()
  const p = pools.data?.protocol
  const chain = useCurrentChain()

  return (
    <div className="hdr">
      <span className="brand">
        LP<span className="cursor">▮</span>TERMINAL
      </span>
      <div className="tabs">
        {TABS.map((tb) => (
          <button
            key={tb.id}
            className={`tab ${props.tab === tb.id ? 'active' : ''}`}
            onClick={() => props.onTab(tb.id)}
          >
            <span className="key">[{tb.key}]</span>
            {t(tb.labelKey)}
          </button>
        ))}
      </div>
      <span className="hdr-meta">
        {t('hdr.epoch')} <b>{p ? p.epochCount : '…'}</b> · {t('hdr.flip')} <b>{fmtDur(epoch.secsLeft)}</b>
        {p ? (
          <>
            {' '}
            · {t('hdr.blk')} <b>{p.blockNumber.toString()}</b>
          </>
        ) : null}
      </span>
      {props.chainControl}
      {isSolanaChain(chain) ? <SolanaConnect /> : <EvmConnect />}
    </div>
  )
}

function SolanaConnect() {
  const { t } = useTranslation()
  const wallet = useSolanaWallet()
  const connect = (name: Parameters<typeof wallet.connect>[0]) =>
    wallet.connect(name).catch((error) => txlog.push('err', String(error)))
  if (wallet.connected)
    return (
      <button className="btn ghost" onClick={() => void wallet.disconnect()} title={wallet.publicKey ?? undefined}>
        [{shortAddr(wallet.publicKey!)}]
      </button>
    )

  const providers = wallet.providers.filter((provider) => provider.detected)
  if (providers.length === 0) return <button className="btn" disabled>{t('hdr.noSolanaWallet')}</button>
  if (providers.length === 1)
    return (
      <button className="btn" disabled={wallet.connecting} onClick={() => void connect(providers[0].name)}>
        {wallet.connecting ? '…' : t('hdr.connect')}
      </button>
    )

  return (
    <select
      className="btn"
      value=""
      disabled={wallet.connecting}
      onChange={(event) => {
        if (event.target.value) void connect(event.target.value as typeof providers[number]['name'])
      }}
    >
      <option value="">{wallet.connecting ? '…' : t('hdr.connect')}</option>
      {providers.map((provider) => <option key={provider.name} value={provider.name}>{provider.label}</option>)}
    </select>
  )
}

function EvmConnect() {
  const { t } = useTranslation()
  return (
    <ConnectButton.Custom>
        {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
          if (!mounted) return <button className="btn ghost">…</button>
          if (!account)
            return (
              <button className="btn" onClick={openConnectModal}>
                {t('hdr.connect')}
              </button>
            )
          if (chain?.unsupported)
            return (
              <button className="btn danger" onClick={openChainModal}>
                {t('hdr.wrongChain')}
              </button>
            )
          return (
            <button className="btn ghost" onClick={openAccountModal}>
              [{account.displayName}
              {account.displayBalance ? ` · ${account.displayBalance}` : ''}]
            </button>
          )
        }}
      </ConnectButton.Custom>
  )
}

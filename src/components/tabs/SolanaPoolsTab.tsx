// Read-only Solana pool list.
// Displays Raydium/Orca/Meteora pools served by the Solana indexer.
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCurrentChain } from '../../hooks/useChain'
import { useSolanaPools } from '../../hooks/useSolanaPools'
import { fmtAmount, fmtUsd, shortAddr } from '../../lib/format'
import { Badge, Btn } from '../ui'

export function SolanaPoolsTab() {
  const { t } = useTranslation()
  const chain = useCurrentChain()
  const pools = useSolanaPools()
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    if (!q.trim()) return pools.data ?? []
    const needle = q.trim().toLowerCase()
    return (pools.data ?? []).filter(
      (p) =>
        p.address.toLowerCase().includes(needle) ||
        p.tokenA.symbol.toLowerCase().includes(needle) ||
        p.tokenB.symbol.toLowerCase().includes(needle) ||
        p.tokenA.mint.toLowerCase().includes(needle) ||
        p.tokenB.mint.toLowerCase().includes(needle),
    )
  }, [pools.data, q])

  if (pools.isLoading) {
    return (
      <div className="dim">
        {t('pos.scanning')} <span className="spin">▮</span>
      </div>
    )
  }
  if (pools.isError) {
    return (
      <div className="red">
        {String(pools.error)}{' '}
        <Btn busy={pools.isFetching} onClick={() => void pools.refetch()}>{t('common.retry')}</Btn>
      </div>
    )
  }

  return (
    <div>
      <div className="pool-toolbar">
        <input
          className="search"
          placeholder={t('pools.searchPlaceholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="dim mono-sm">{filtered.length} pools</span>
      </div>

      <table className="pool-table">
        <thead>
          <tr>
            <th>{t('pools.thPair')}</th>
            <th>Program</th>
            <th>{t('pos.fees')}</th>
            <th className="num">Reserve A</th>
            <th className="num">Reserve B</th>
            <th className="num">{t('pools.thTvl')}</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((p) => (
            <tr key={p.address}>
              <td>
                <a
                  href={`${chain.explorerUrl}/account/${p.address}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mono"
                >
                  {p.tokenA.symbol}/{p.tokenB.symbol}
                </a>
                <div className="mono-sm dim">
                  {shortAddr(p.tokenA.mint)} / {shortAddr(p.tokenB.mint)}
                </div>
              </td>
              <td>
                <Badge>{p.program}</Badge>
              </td>
              <td>{p.feeBps ? `${(p.feeBps / 100).toFixed(2)}%` : '—'}</td>
              <td className="num">
                {fmtAmount(BigInt(p.reserveA), p.tokenA.decimals)} {p.tokenA.symbol}
              </td>
              <td className="num">
                {fmtAmount(BigInt(p.reserveB), p.tokenB.decimals)} {p.tokenB.symbol}
              </td>
              <td className="num">{p.tvlUsd ? fmtUsd(p.tvlUsd) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {filtered.length === 0 && (
        <div className="amber mono-sm">
          {t('pools.solanaEmpty')}
        </div>
      )}
    </div>
  )
}

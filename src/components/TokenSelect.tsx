import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Address } from 'viem'
import { ADDR } from '../config/addresses'
import { NATIVE } from '../lib/kyber'
import { shortAddr } from '../lib/format'
import type { TokenInfo } from '../types'

/** addresses of tokens that have an "official" / verified deployment on this chain.
 *  Used to highlight legitimate listings when scam forks of common symbols appear
 *  in the token registry (observed live for USDG, WETH, etc.). */
const VERIFIED_ADDRS = new Set<string>([ADDR.WETH.toLowerCase(), ADDR.USDG.toLowerCase()])

export function TokenSelect(props: {
  list: TokenInfo[]
  value: TokenInfo
  exclude?: Address
  onChange: (t: TokenInfo) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const filtered = useMemo(() => {
    const ex = props.exclude?.toLowerCase()
    let l = props.list.filter((t) => t.address.toLowerCase() !== ex)
    if (q) {
      const s = q.toLowerCase()
      l = l.filter((t) => t.symbol.toLowerCase().includes(s) || t.address.toLowerCase() === s)
    }
    return l.slice(0, 80)
  }, [props.list, props.exclude, q])

  return (
    <div className="tsel">
      <button className="tsel-btn" onClick={() => setOpen(!open)}>
        {props.value.symbol} ▾
      </button>
      {open && (
        <>
          <div className="tsel-backdrop" onClick={() => setOpen(false)} />
          <div className="tsel-pop">
            <div className="filter">
              <input
                className="input"
                autoFocus
                placeholder={t('common.tokenSearch')}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
              />
            </div>
            {filtered.map((tok) => {
              const verified = VERIFIED_ADDRS.has(tok.address.toLowerCase())
              return (
                <div
                  key={tok.address}
                  className={`tsel-item ${verified ? 'verified' : ''}`}
                  onClick={() => {
                    props.onChange(tok)
                    setOpen(false)
                    setQ('')
                  }}
                >
                  <span className={verified ? 'verified-sym' : ''}>
                    {tok.symbol} {verified && <span className="verified-badge">✓</span>}{' '}
                    {tok.native && <span className="dim">{t('common.gasToken')}</span>}
                  </span>
                  <span className={`dim mono-sm ${verified ? 'verified-addr' : ''}`}>
                    {tok.native ? NATIVE.slice(0, 8) : shortAddr(tok.address)}
                  </span>
                </div>
              )
            })}
            {filtered.length === 0 && <div className="tsel-item dim">{t('common.noMatch')}</div>}
          </div>
        </>
      )}
    </div>
  )
}

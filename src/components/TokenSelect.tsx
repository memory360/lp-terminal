import { useMemo, useRef, useState, useLayoutEffect } from 'react'
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

const POP_W = 300
const POP_MAX_H = 320

export function TokenSelect(props: {
  list: TokenInfo[]
  value: TokenInfo
  exclude?: Address
  onChange: (t: TokenInfo) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const btnRef = useRef<HTMLButtonElement>(null)
  const [popStyle, setPopStyle] = useState<React.CSSProperties>({})

  const filtered = useMemo(() => {
    const ex = props.exclude?.toLowerCase()
    let l = props.list.filter((t) => t.address.toLowerCase() !== ex)
    if (q) {
      const s = q.toLowerCase()
      l = l.filter((t) => t.symbol.toLowerCase().includes(s) || t.address.toLowerCase() === s)
    }
    return l.slice(0, 80)
  }, [props.list, props.exclude, q])

  // position: fixed escapes parent overflow-y:auto containers — absolute does not
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - r.bottom
    const showBelow = spaceBelow >= Math.min(POP_MAX_H, 200) || spaceBelow >= r.top
    const top = showBelow ? r.bottom + 4 : Math.max(4, r.top - POP_MAX_H - 4)
    let left = r.left
    if (left + POP_W > window.innerWidth) left = window.innerWidth - POP_W - 8
    setPopStyle({ position: 'fixed', top, left, width: POP_W })
  }, [open])

  return (
    <div className="tsel">
      <button ref={btnRef} className="tsel-btn" onClick={() => setOpen(!open)}>
        {props.value.symbol} ▾
      </button>
      {open && (
        <>
          <div className="tsel-backdrop" onClick={() => setOpen(false)} />
          <div className="tsel-pop" style={popStyle}>
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

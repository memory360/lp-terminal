import { formatUnits } from 'viem'

/** Safely convert a BigInt raw amount to a display Number without precision
 *  loss for values within Number.MAX_SAFE_INTEGER after decimal scaling.
 *  Divides using BigInt first so the whole part never overflows Number. */
export function bigintToNumber(raw: bigint, decimals: number): number {
  return Number(formatUnits(raw, decimals))
}

/** significant-digit number formatting with thousands separators */
export function fmtNum(x: number, sig = 5): string {
  if (!Number.isFinite(x)) return '—'
  if (x === 0) return '0'
  sig = Math.max(1, Math.min(sig, 21)) // toPrecision throws outside [1,100]
  const neg = x < 0
  const a = Math.abs(x)
  let s: string
  if (a >= 1) {
    const intDigits = Math.floor(Math.log10(a)) + 1
    const frac = Math.max(0, Math.min(sig - intDigits, 8))
    s = a.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: frac })
  } else {
    s = a.toPrecision(sig)
    if (s.includes('e')) {
      const exp = Math.ceil(-Math.log10(a))
      s = a.toFixed(Math.min(exp + sig, 18))
    }
    s = s.replace(/\.?0+$/, '')
  }
  return (neg ? '-' : '') + s
}

export function fmtAmount(v: bigint, decimals: number, sig = 5): string {
  return fmtNum(Number(formatUnits(v, decimals)), sig)
}

/** exact decimal-point shift for scientific-notation pastes — string math only,
 *  a float round-trip would corrupt exactly the tiny amounts this serves */
function shiftDecimal(int: string, frac: string, exp: number): string | null {
  if (!Number.isFinite(exp) || Math.abs(exp) > 30) return null
  const digits = int + frac
  const point = int.length + exp
  if (point <= 0) return `0.${'0'.repeat(-point)}${digits}`
  if (point >= digits.length) return digits + '0'.repeat(point - digits.length)
  return `${digits.slice(0, point)}.${digits.slice(point)}`
}

/** normalize user-typed token amounts (the web3 small-amount conventions):
 *  whitespace stripped, decimal comma → dot, pasted scientific notation
 *  ("5e-5") expanded exactly, and the fraction CLAMPED to the token's decimals
 *  — text the token cannot represent must not sit in the box silently quoting
 *  zero. Returns the normalized string, or null when the text is not an amount
 *  (caller keeps the previous value, the controlled input swallows the key). */
export function sanitizeAmountInput(raw: string, decimals: number): string | null {
  let s = raw
    .replace(/\s+/g, '')
    // Chinese-IME width normalization: with an IME active the digit/dot keys
    // emit fullwidth ０-９／。／．／，— rejecting just the dot turned a typed
    // "0。05" into "005", a 100× amount error, so map instead of reject
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
    .replace(/[。．]/g, '.')
    .replace('，', ',')
    .replace(',', '.')
  if (s === '') return ''
  const sci = s.match(/^(\d*)\.?(\d*)[eE]([+-]?\d+)$/)
  if (sci && (sci[1] || sci[2])) {
    const shifted = shiftDecimal(sci[1], sci[2], Number(sci[3]))
    if (shifted === null) return null
    s = shifted
  }
  if (!/^\d*\.?\d*$/.test(s)) return null
  const [int, frac = ''] = s.split('.')
  if (frac.length > decimals) return decimals === 0 ? int : `${int}.${frac.slice(0, decimals)}`
  return s
}

/** compact amount for dense table cells: 24.9M, 338.4K, 12.4, 0.0421 */
export function fmtCompact(x: number): string {
  if (!Number.isFinite(x)) return '—'
  if (x !== 0 && Math.abs(x) < 1) return fmtNum(x, 3)
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(x)
}

export function fmtCompactAmount(v: bigint, decimals: number): string {
  return fmtCompact(Number(formatUnits(v, decimals)))
}

export function fmtUsd(x: number | string | undefined): string {
  const n = typeof x === 'string' ? Number(x) : x
  if (n === undefined || !Number.isFinite(n)) return ''
  // bounded width: sub-cent USD precision is noise everywhere in this app,
  // and long fractions (dust TVLs) were stretching table columns
  if (n > 0 && n < 0.01) return '<$0.01'
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: n >= 1000 ? 0 : 2 })
}

export function fmtPct(x: number, dp = 2): string {
  if (!Number.isFinite(x)) return '—'
  return x.toFixed(dp) + '%'
}

export function shortAddr(a: string): string {
  return a.slice(0, 6) + '…' + a.slice(-4)
}

export function fmtDur(seconds: number): string {
  if (seconds <= 0) return '0s'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function fmtPoolAge(createdAtMs: number, nowMs = Date.now(), justNow = '刚刚'): string {
  const age = Math.max(0, nowMs - createdAtMs)
  if (age >= 3 * 86_400_000) return new Date(createdAtMs).toISOString().slice(0, 10)
  const days = Math.floor(age / 86_400_000)
  const hours = Math.floor((age % 86_400_000) / 3_600_000)
  const mins = Math.floor((age % 3_600_000) / 60_000)
  if (days >= 2) return `${days}days+`
  if (days) return `${days}days ${hours} hours`
  if (hours) return `${hours} hours`
  if (mins) return `${mins}mins`
  return justNow
}

/** signed bps difference of a vs b (positive = a better) */
export function bpsDiff(a: bigint, b: bigint): number {
  if (b === 0n) return 0
  return Number(((a - b) * 1_000_000n) / b) / 100
}

export function nowSec(): number {
  return Math.floor(Date.now() / 1000)
}

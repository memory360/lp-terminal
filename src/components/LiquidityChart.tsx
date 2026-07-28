import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { usePublicClient } from 'wagmi'
import type { PublicClient } from 'viem'
import { clPoolAbi, uniV3PoolAbi } from '../abi'
import { MAX_TICK, MIN_TICK, tickToPrice } from '../lib/clmath'
import { fmtNum } from '../lib/format'
import type { ClPool, TokenInfo } from '../types'
import { useCurrentChain } from '../hooks/useChain'
import { Btn } from './ui'

type TickLiquidity = { tick: number; net: bigint }
type Distribution = { lower: number; upper: number; ticks: TickLiquidity[] }

const WORD_RADIUS = 12 // 25 bitmap calls max, about ±30% around the current price

export function LiquidityChart(props: {
  pool: ClPool
  t0: TokenInfo
  t1: TokenInfo
  selected?: { lower: number; upper: number } | null
}) {
  const { pool, t0, t1, selected } = props
  const { t } = useTranslation()
  const chain = useCurrentChain()
  const pc = usePublicClient({ chainId: chain.id })
  const query = useQuery({
    queryKey: ['liquidity-distribution', chain.id, pool.address],
    enabled: !!pc,
    staleTime: Infinity,
    queryFn: () => fetchDistribution(pc as PublicClient, pool),
  })

  if (query.isLoading)
    return <div className="liq-chart-state dim">{t('add.liquidityLoading')} <span className="spin">▮</span></div>
  if (query.isError || !query.data)
    return (
      <div className="liq-chart-state red">
        {t('add.liquidityError')}{' '}
        <Btn busy={query.isFetching} onClick={() => query.refetch()}>{t('add.liquidityRetry')}</Btn>
      </div>
    )

  const { lower, upper, ticks } = query.data
  const points = liquidityPoints(lower, upper, pool.tick, pool.liquidity, ticks)
  const max = Math.max(...points.map((p) => Number(p.liquidity)), 1)
  const x = (tick: number) => 16 + ((tick - lower) / (upper - lower)) * 688
  const y = (liquidity: bigint) => 176 - (Number(liquidity) / max) * 148
  const path = points.reduce(
    (d, p, i) => `${d}${i === 0 ? `M${x(p.tick)},176 L${x(p.tick)},${y(p.liquidity)}` : ` H${x(p.tick)} V${y(p.liquidity)}`}`,
    '',
  ) + ` L704,176 Z`
  const selectedLeft = selected ? x(Math.max(lower, selected.lower)) : 0
  const selectedRight = selected ? x(Math.min(upper, selected.upper)) : 0
  const price = (tick: number) => fmtNum(tickToPrice(tick, t0.decimals, t1.decimals), 5)

  return (
    <div className="liq-chart">
      <div className="liq-chart-head">
        <span>{t('add.liquidityTitle')}</span>
        <button className="chip" onClick={() => query.refetch()} disabled={query.isFetching}>
          {query.isFetching ? <span className="spin">▮</span> : t('add.liquidityRefresh')}
        </button>
      </div>
      <svg viewBox="0 0 720 210" role="img" aria-label={t('add.liquidityTitle')}>
        <line x1="16" y1="176" x2="704" y2="176" className="liq-axis" />
        <line x1="16" y1="102" x2="704" y2="102" className="liq-grid" />
        <path d={path} className="liq-area" />
        {selected && selectedRight > selectedLeft && (
          <rect x={selectedLeft} y="18" width={selectedRight - selectedLeft} height="158" className="liq-selected" />
        )}
        <line x1={x(pool.tick)} y1="18" x2={x(pool.tick)} y2="176" className="liq-current" />
        <text x="16" y="198" textAnchor="start">{price(lower)}</text>
        <text x={x(pool.tick)} y="198" textAnchor="middle">{price(pool.tick)}</text>
        <text x="704" y="198" textAnchor="end">{price(upper)}</text>
      </svg>
      <div className="liq-chart-caption">{t('add.liquidityPair', { quote: t1.symbol, base: t0.symbol })}</div>
    </div>
  )
}

async function fetchDistribution(pc: PublicClient, pool: ClPool): Promise<Distribution> {
  const spacing = pool.tickSpacing
  const compressed = Math.floor(pool.tick / spacing)
  const centerWord = compressed >> 8
  const firstWord = Math.max(-32768, centerWord - WORD_RADIUS)
  const lastWord = Math.min(32767, centerWord + WORD_RADIUS)
  const words = Array.from({ length: lastWord - firstWord + 1 }, (_, i) => firstWord + i)
  const abi = pool.protocol === 'univ3' ? uniV3PoolAbi : clPoolAbi
  const bitmaps = (await pc.multicall({
    contracts: words.map((word) => ({ abi, address: pool.address, functionName: 'tickBitmap', args: [word] })) as never,
    allowFailure: true,
  })) as { status: string; result?: bigint }[]

  const initialized: number[] = []
  bitmaps.forEach((result, wordIndex) => {
    if (result.status !== 'success' || result.result === undefined) return
    for (let bit = 0; bit < 256; bit++)
      if ((result.result & (1n << BigInt(bit))) !== 0n) initialized.push(((words[wordIndex] << 8) + bit) * spacing)
  })

  const tickResults = initialized.length
    ? ((await pc.multicall({
        contracts: initialized.map((tick) => ({ abi, address: pool.address, functionName: 'ticks', args: [tick] })) as never,
        allowFailure: true,
      })) as { status: string; result?: readonly [bigint, bigint, ...unknown[]] }[])
    : []
  const ticks = initialized.flatMap((tick, i) =>
    tickResults[i]?.status === 'success' && tickResults[i].result ? [{ tick, net: tickResults[i].result![1] }] : [],
  )
  return {
    lower: Math.max(MIN_TICK, firstWord * 256 * spacing),
    upper: Math.min(MAX_TICK, ((lastWord + 1) * 256 - 1) * spacing),
    ticks,
  }
}

export function liquidityPoints(lower: number, upper: number, current: number, active: bigint, ticks: TickLiquidity[]) {
  const sorted = ticks.filter((x) => x.tick >= lower && x.tick <= upper).sort((a, b) => a.tick - b.tick)
  let liquidity = active
  for (const item of sorted) if (item.tick >= lower && item.tick <= current) liquidity -= item.net
  const points = [{ tick: lower, liquidity: liquidity < 0n ? 0n : liquidity }]
  for (const item of sorted) {
    if (item.tick === lower) {
      liquidity += item.net
      points[0].liquidity = liquidity < 0n ? 0n : liquidity
    }
    else {
      liquidity += item.net
      points.push({ tick: item.tick, liquidity: liquidity < 0n ? 0n : liquidity })
    }
  }
  points.push({ tick: upper, liquidity: points.at(-1)?.liquidity ?? 0n })
  return points
}

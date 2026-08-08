import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { usePublicClient } from 'wagmi'
import type { PublicClient } from 'viem'
import { clPoolAbi, uniV3PoolAbi } from '../abi'
import { MAX_TICK, MIN_TICK, tickDeltaForPct, tickToPrice } from '../lib/clmath'
import { fmtNum } from '../lib/format'
import type { ClPool, TokenInfo } from '../types'
import { useCurrentChain } from '../hooks/useChain'
import { Btn } from './ui'

type TickLiquidity = { tick: number; net: bigint }
type Distribution = { lower: number; upper: number; ticks: TickLiquidity[] }
type LiquidityPoint = { tick: number; liquidity: bigint }

const VIEW_PCT = 0.35 // enough padding around the widest ±30% preset
const BAR_COUNT = 36
const SELECTED_VIEW_MULTIPLIER = 2.3

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
  const view = chartView(lower, upper, pool.tick, selected)
  // UP33/Sliipstream track staked liquidity separately; include it so the chart
  // reflects the real depth available to swappers and incoming LPs.
  const activeLiquidity = pool.liquidity + pool.stakedLiquidity
  const points = liquidityPoints(view.lower, view.upper, pool.tick, activeLiquidity, ticks)
  const bars = liquidityBars(view.lower, view.upper, points, BAR_COUNT)
  const max = Math.max(...bars.map((p) => p.liquidity), 1)
  const x = (tick: number) => 16 + ((tick - view.lower) / (view.upper - view.lower)) * 688
  const y = (liquidity: bigint | number) => 176 - (Number(liquidity) / max) * 154
  const path = points.reduce(
    (d, p, i) => `${d}${i === 0 ? `M${x(p.tick)},176 L${x(p.tick)},${y(p.liquidity)}` : ` H${x(p.tick)} V${y(p.liquidity)}`}`,
    '',
  ) + ` L704,176 Z`
  const selectedLeft = selected ? x(Math.max(view.lower, selected.lower)) : 0
  const selectedRight = selected ? x(Math.min(view.upper, selected.upper)) : 0
  const price = (tick: number) => fmtNum(tickToPrice(tick, t0.decimals, t1.decimals), 5)

  return (
    <div className="liq-chart">
      <div className="liq-chart-head">
        <span>{t('add.liquidityTitle')}</span>
        <button className="chip" onClick={() => query.refetch()} disabled={query.isFetching}>
          {query.isFetching ? <span className="spin">▮</span> : t('add.liquidityRefresh')}
        </button>
      </div>
      <svg viewBox="0 0 720 214" role="img" aria-label={t('add.liquidityTitle')}>
        <line x1="16" y1="176" x2="704" y2="176" className="liq-axis" />
        <line x1="16" y1="102" x2="704" y2="102" className="liq-grid" />
        {selected && selectedRight > selectedLeft && (
          <rect x={selectedLeft} y="18" width={selectedRight - selectedLeft} height="158" className="liq-selected" />
        )}
        {bars.map((bar) => {
          const left = x(bar.lower)
          const right = x(bar.upper)
          const top = y(bar.liquidity)
          return (
            <rect
              key={bar.lower}
              x={left + 1}
              y={top}
              width={Math.max(1, right - left - 2)}
              height={176 - top}
              className="liq-bar"
            />
          )
        })}
        {selected && selectedRight > selectedLeft && (
          <>
            <line x1={selectedLeft} y1="18" x2={selectedLeft} y2="176" className="liq-selected-edge" />
            <line x1={selectedRight} y1="18" x2={selectedRight} y2="176" className="liq-selected-edge" />
          </>
        )}
        <path d={path} className="liq-area" />
        <line x1={x(pool.tick)} y1="18" x2={x(pool.tick)} y2="176" className="liq-current" />
        <text x="16" y="198" textAnchor="start">{price(view.lower)}</text>
        <text x={x(pool.tick)} y="198" textAnchor="middle">{price(pool.tick)}</text>
        <text x="704" y="198" textAnchor="end">{price(view.upper)}</text>
        {selected && selectedRight > selectedLeft && (
          <text x={(selectedLeft + selectedRight) / 2} y="212" textAnchor="middle" className="liq-range-label">
            {fmtNum(tickToPrice(selected.lower, t0.decimals, t1.decimals), 5)} – {fmtNum(tickToPrice(selected.upper, t0.decimals, t1.decimals), 5)}
          </text>
        )}
      </svg>
      <div className="liq-chart-caption">{t('add.liquidityPair', { quote: t1.symbol, base: t0.symbol })}</div>
    </div>
  )
}

async function fetchDistribution(pc: PublicClient, pool: ClPool): Promise<Distribution> {
  const spacing = pool.tickSpacing
  const delta = tickDeltaForPct(VIEW_PCT)
  const lower = Math.max(MIN_TICK, pool.tick - delta)
  const upper = Math.min(MAX_TICK, pool.tick + delta)
  // Bitmap words are only a transport detail. The chart remains fixed to the
  // percentage window so large tickSpacing pools do not get absurd axes.
  const firstWord = Math.floor(lower / spacing) >> 8
  const lastWord = Math.floor(upper / spacing) >> 8
  const words = Array.from({ length: lastWord - firstWord + 1 }, (_, i) => firstWord + i)
  const isUni = pool.protocol === 'univ3'
  const abi = isUni ? uniV3PoolAbi : clPoolAbi
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
  const failedTick = tickResults.findIndex((result) => result.status !== 'success' || !result.result)
  if (failedTick >= 0) throw new Error(`tick ${initialized[failedTick]} decode failed`)
  const ticks = initialized.map((tick, i) => {
    const net = tickResults[i].result![1]
    // UP33 pools also store a stakedLiquidityNet per tick; add it to reflect
    // the total liquidity active at each price.
    const stakedNet = isUni ? 0n : (tickResults[i].result![2] as bigint)
    return { tick, net: net + stakedNet }
  })
  return {
    lower,
    upper,
    ticks,
  }
}

export function liquidityPoints(lower: number, upper: number, current: number, active: bigint, ticks: TickLiquidity[]): LiquidityPoint[] {
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

export function chartView(
  lower: number,
  upper: number,
  current: number,
  selected?: { lower: number; upper: number } | null,
) {
  if (!selected || selected.lower <= lower || selected.upper >= upper) return { lower, upper }

  const selectedWidth = Math.max(selected.upper - selected.lower, 1)
  const width = selectedWidth * SELECTED_VIEW_MULTIPLIER
  const center = Math.min(Math.max(current, selected.lower), selected.upper)
  const viewLower = Math.max(lower, center - width / 2)
  const viewUpper = Math.min(upper, center + width / 2)

  if (viewUpper - viewLower < selectedWidth) return { lower: selected.lower, upper: selected.upper }
  return { lower: viewLower, upper: viewUpper }
}

export function liquidityBars(lower: number, upper: number, points: LiquidityPoint[], count: number) {
  const width = (upper - lower) / count
  return Array.from({ length: count }, (_, i) => {
    const barLower = lower + i * width
    const barUpper = i === count - 1 ? upper : barLower + width
    let weighted = 0
    let covered = 0

    for (let j = 0; j < points.length - 1; j++) {
      const segLower = Math.max(barLower, points[j].tick)
      const segUpper = Math.min(barUpper, points[j + 1].tick)
      if (segUpper <= segLower) continue
      const span = segUpper - segLower
      weighted += Number(points[j].liquidity) * span
      covered += span
    }

    return {
      lower: barLower,
      upper: barUpper,
      liquidity: covered > 0 ? weighted / covered : 0,
    }
  })
}

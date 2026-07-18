import assert from 'node:assert/strict'
import { rangeHourlyEarnings } from '../src/lib/apr'
import type { PoolStat } from '../src/lib/poolstats'
import type { ClPool } from '../src/types'

const pool = { kind: 'cl', feePpm: 10_000, unstakedFeePpm: 0 } as ClPool
const stat = { vol24hUsd: 1_000_000, liqUsd: 1_000_000, source: 'dexscreener' } satisfies PoolStat
const earned = rangeHourlyEarnings(pool, stat)
const totalHourlyFees = (stat.vol24hUsd * 0.01) / 24

assert(earned != null && Math.abs(earned - 8.765026535) < 0.000001)
assert(rangeHourlyEarnings(pool, { ...stat, liqUsd: 1 })! < totalHourlyFees)
assert.equal(rangeHourlyEarnings(pool, stat, 0), null)
console.log('APR math check passed')

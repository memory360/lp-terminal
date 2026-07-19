import assert from 'node:assert/strict'
import { fees1hOf, rangeHourlyEarnings } from '../src/lib/apr'
import type { PoolStat } from '../src/lib/poolstats'
import type { ClPool } from '../src/types'

const pool = { kind: 'cl', feePpm: 10_000, unstakedFeePpm: 0 } as ClPool
const stat = { vol24hUsd: 1_000_000, vol1hUsd: 100_000, liqUsd: 1_000_000, source: 'dexscreener' } satisfies PoolStat
const earned = rangeHourlyEarnings(pool, stat)
const totalHourlyFees = stat.vol1hUsd * 0.01
const concentration = 1 / (1 - 1 / Math.sqrt(1.1))
const share = (1000 * concentration) / (stat.liqUsd + 1000 * concentration)

assert.equal(fees1hOf(pool, stat), totalHourlyFees)
assert(earned != null && Math.abs(earned - totalHourlyFees * share) < 0.000001)
assert(rangeHourlyEarnings(pool, { ...stat, liqUsd: 1 })! < totalHourlyFees)
assert.equal(rangeHourlyEarnings(pool, stat, 0), null)
assert.equal(rangeHourlyEarnings(pool, { ...stat, vol1hUsd: null }), null)
console.log('APR math check passed')

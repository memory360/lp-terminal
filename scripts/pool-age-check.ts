import assert from 'node:assert/strict'
import { fmtPoolAge } from '../src/lib/format'

const now = Date.UTC(2026, 6, 21, 12)
assert.equal(fmtPoolAge(now - 20_000, now), '刚刚')
assert.equal(fmtPoolAge(now - 20 * 60_000, now), '20mins')
assert.equal(fmtPoolAge(now - (34 * 3_600_000), now), '1days 10 hours')
assert.equal(fmtPoolAge(now - (60 * 3_600_000), now), '2days+')
assert.equal(fmtPoolAge(Date.UTC(2026, 5, 9), now), '2026-06-09')
console.log('Pool age check passed')

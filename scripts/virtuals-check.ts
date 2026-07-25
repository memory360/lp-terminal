import assert from 'node:assert/strict'
import { db, virtualsCount } from '../indexer/store'
import { backfillVirtuals, tailVirtuals } from '../indexer/virtuals'

await backfillVirtuals()
await tailVirtuals()
assert(virtualsCount() > 0, 'expected at least one Virtuals launch')
console.log(`Virtuals index check passed (${virtualsCount()} tokens)`)
db.close()

// Virtuals origin tags, intentionally cheap:
// - history and 60s increments both use Blockscout (zero RPC usage)
import { isHex, parseAbiItem, toEventSelector } from 'viem'
import { BLOCKSCOUT, log } from './config'
import { insertVirtualsToken, kvGet, kvSet, virtualsMaxBlock } from './store'

const LAUNCHER = '0xd4ccbfa37e2f35611b3042e4096ad7a3459bd007' as const
const PRE_LAUNCHED = parseAbiItem(
  'event PreLaunched(address indexed token, address indexed bondingPool, uint256 agentId, uint256 amount, (uint8,uint16,bool,uint8,bool) launchInfo)',
)
const PRE_LAUNCHED_TOPIC = toEventSelector(PRE_LAUNCHED)

type BsLog = {
  blockNumber: string
  timeStamp?: string
  transactionHash: string
  topics: [string, string, string, ...unknown[]]
}

const addressTopic = (topic: string) => {
  if (!isHex(topic) || topic.length < 42) throw new Error(`invalid topic: ${topic}`)
  return `0x${topic.slice(-40)}`.toLowerCase()
}

function save(raw: BsLog): boolean {
  return insertVirtualsToken(
    addressTopic(raw.topics[1]),
    addressTopic(raw.topics[2]),
    raw.transactionHash,
    Number(BigInt(raw.blockNumber)),
    raw.timeStamp ? Number(BigInt(raw.timeStamp)) * 1000 : undefined,
  )
}

async function blockscoutLogs(from: number): Promise<BsLog[]> {
  const url = `${BLOCKSCOUT}/api?module=logs&action=getLogs&fromBlock=${from}&toBlock=latest&address=${LAUNCHER}&topic0=${PRE_LAUNCHED_TOPIC}&offset=0&limit=1000`
  const r = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'up33-lp-indexer/0.1' } })
  const j = (await r.json()) as { status?: string; message?: string; result?: BsLog[] }
  if (!r.ok || (j.status !== '1' && !/no records/i.test(j.message ?? ''))) throw new Error(`blockscout ${j.message ?? r.status}`)
  return j.result ?? []
}

/** one small Blockscout request in practice; paginates safely if the list grows */
export async function backfillVirtuals(): Promise<number> {
  if (kvGet('virtuals_backfilled')) return 0
  let cursor = Number(kvGet('virtuals_backfill_cursor') ?? virtualsMaxBlock())
  let added = 0
  for (;;) {
    const rows = await blockscoutLogs(cursor)
    if (rows.length === 0) break
    for (const row of rows) if (save(row)) added++
    if (rows.length < 1000) break
    cursor = Number(BigInt(rows[rows.length - 1].blockNumber)) + 1
    kvSet('virtuals_backfill_cursor', String(cursor))
  }
  kvSet('virtuals_cursor', String(virtualsMaxBlock() + 1))
  kvSet('virtuals_backfilled', '1')
  kvSet('virtuals_backfill_cursor', '0')
  log(`[virtuals] history: +${added} tokens`)
  return added
}

/** incremental scan: one filtered Blockscout request per minute, no RPC */
export async function tailVirtuals(): Promise<number> {
  const from = Number(kvGet('virtuals_cursor') ?? virtualsMaxBlock())
  const rows = await blockscoutLogs(from)
  let added = 0
  for (const row of rows) {
    if (save(row)) added++
  }
  if (rows.length) {
    const next = Math.max(...rows.map((row) => Number(BigInt(row.blockNumber)))) + 1
    kvSet('virtuals_cursor', String(next))
  }
  if (added) log(`[virtuals] +${added} tokens`)
  return added
}

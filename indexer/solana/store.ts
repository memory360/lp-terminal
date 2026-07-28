// SQLite store for the Solana indexer.
// Mirrors the EVM store API shape where possible, but the schema is
// Solana-specific: mints instead of addresses, program/poolType tags, vaults.
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { DB_PATH, now } from './config'

mkdirSync(dirname(DB_PATH), { recursive: true })
export const db = new DatabaseSync(DB_PATH)

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS sol_pools (
  address       TEXT PRIMARY KEY,     -- base58 pool account
  program       TEXT NOT NULL,        -- 'raydium-amm-v4' | 'raydium-clmm' | ...
  pool_type     TEXT NOT NULL,        -- 'amm' | 'clmm' | 'dlmm' | 'whirlpool'
  token_a       TEXT NOT NULL,        -- base58 mint
  token_b       TEXT NOT NULL,        -- base58 mint
  decimals_a    INTEGER,
  decimals_b    INTEGER,
  symbol_a      TEXT,
  symbol_b      TEXT,
  vault_a       TEXT,                 -- base58 token account holding reserve A
  vault_b       TEXT,                 -- base58 token account holding reserve B
  lp_mint       TEXT,                 -- base58 LP mint (AMM V4 only)
  lp_decimals   INTEGER,
  fee_bps       INTEGER,              -- swap fee in bps where known
  added_ts      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sol_pools_ta ON sol_pools(token_a);
CREATE INDEX IF NOT EXISTS idx_sol_pools_tb ON sol_pools(token_b);

CREATE TABLE IF NOT EXISTS sol_pool_state (
  address       TEXT PRIMARY KEY,
  reserve_a     TEXT NOT NULL DEFAULT '0', -- raw token amount as string
  reserve_b     TEXT NOT NULL DEFAULT '0',
  lp_total_supply TEXT,                    -- AMM V4 LP mint supply; NULL for non-AMM
  sqrt_price    TEXT,                      -- CL-style price where applicable
  tick_current  INTEGER,
  liquidity     TEXT,
  tvl_usd       REAL,
  updated       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sol_tokens (
  mint          TEXT PRIMARY KEY,     -- base58
  symbol        TEXT NOT NULL DEFAULT '?',
  decimals      INTEGER,
  price_usd     REAL,
  price_updated INTEGER
);

CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
`)

// Migration: add lp_mint if upgrading an existing database.
const poolCols = db.prepare('PRAGMA table_info(sol_pools)').all() as { name: string }[]
if (!poolCols.some((c) => c.name === 'lp_mint')) db.exec('ALTER TABLE sol_pools ADD COLUMN lp_mint TEXT')
if (!poolCols.some((c) => c.name === 'lp_decimals')) db.exec('ALTER TABLE sol_pools ADD COLUMN lp_decimals INTEGER')

// ---- kv ----
const kvGetQ = db.prepare('SELECT v FROM kv WHERE k = ?')
const kvSetQ = db.prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')
export const kvGet = (k: string): string | undefined => (kvGetQ.get(k) as { v: string } | undefined)?.v
export const kvSet = (k: string, v: string) => void kvSetQ.run(k, v)

// ---- pools ----
export type SolPoolInsert = {
  address: string
  program: string
  poolType: string
  tokenA: string
  tokenB: string
  decimalsA?: number
  decimalsB?: number
  symbolA?: string
  symbolB?: string
  vaultA?: string
  vaultB?: string
  lpMint?: string
  lpDecimals?: number
  feeBps?: number
}

const insPoolQ = db.prepare(`
  INSERT OR IGNORE INTO sol_pools
    (address, program, pool_type, token_a, token_b, decimals_a, decimals_b, symbol_a, symbol_b, vault_a, vault_b, lp_mint, lp_decimals, fee_bps, added_ts)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)

export function insertPool(p: SolPoolInsert): boolean {
  const r = insPoolQ.run(
    p.address,
    p.program,
    p.poolType,
    p.tokenA,
    p.tokenB,
    p.decimalsA ?? null,
    p.decimalsB ?? null,
    p.symbolA ?? null,
    p.symbolB ?? null,
    p.vaultA ?? null,
    p.vaultB ?? null,
    p.lpMint ?? null,
    p.lpDecimals ?? null,
    p.feeBps ?? null,
    now(),
  )
  return Number(r.changes) > 0
}

export type SolPoolRow = {
  address: string
  program: string
  pool_type: string
  token_a: string
  token_b: string
  decimals_a: number | null
  decimals_b: number | null
  symbol_a: string | null
  symbol_b: string | null
  vault_a: string | null
  vault_b: string | null
  lp_mint: string | null
  lp_decimals: number | null
  fee_bps: number | null
}

const poolByAddrQ = db.prepare('SELECT * FROM sol_pools WHERE address = ?')
export const poolRow = (addr: string): SolPoolRow | undefined => poolByAddrQ.get(addr) as SolPoolRow | undefined

export const allPoolAddrs = (): string[] =>
  (db.prepare('SELECT address FROM sol_pools').all() as { address: string }[]).map((r) => r.address)

export const poolCounts = () =>
  db.prepare(`SELECT program, pool_type, COUNT(*) AS n FROM sol_pools GROUP BY program, pool_type`).all() as {
    program: string
    pool_type: string
    n: number
  }[]

export type SolPoolListRow = {
  address: string
  program: string
  pool_type: string
  token_a: string
  token_b: string
  decimals_a: number | null
  decimals_b: number | null
  symbol_a: string | null
  symbol_b: string | null
  vault_a: string | null
  vault_b: string | null
  lp_mint: string | null
  lp_decimals: number | null
  fee_bps: number | null
  reserve_a: string
  reserve_b: string
  lp_total_supply: string | null
  tvl_usd: number | null
  updated: number
}

const poolListQ = db.prepare(`
  SELECT
    p.address, p.program, p.pool_type,
    p.token_a, p.token_b,
    p.decimals_a, p.decimals_b,
    COALESCE(ta.symbol, p.symbol_a, '?') AS symbol_a,
    COALESCE(tb.symbol, p.symbol_b, '?') AS symbol_b,
    p.vault_a, p.vault_b,
    p.lp_mint, p.lp_decimals,
    p.fee_bps,
    COALESCE(s.reserve_a, '0') AS reserve_a,
    COALESCE(s.reserve_b, '0') AS reserve_b,
    s.lp_total_supply,
    s.tvl_usd,
    COALESCE(s.updated, p.added_ts) AS updated
  FROM sol_pools p
  LEFT JOIN sol_tokens ta ON ta.mint = p.token_a
  LEFT JOIN sol_tokens tb ON tb.mint = p.token_b
  LEFT JOIN sol_pool_state s ON s.address = p.address
  WHERE (p.token_a = ? OR p.token_b = ? OR ? IS NULL)
  ORDER BY COALESCE(s.tvl_usd, 0) DESC
  LIMIT ? OFFSET ?`)

export function listPools(args: { limit: number; offset: number; mint?: string }): SolPoolListRow[] {
  const mint = args.mint ?? null
  return poolListQ.all(mint, mint, mint, args.limit, args.offset) as SolPoolListRow[]
}

const setLpDecimalsQ = db.prepare('UPDATE sol_pools SET lp_decimals = ? WHERE lp_mint = ?')
export const setPoolLpDecimals = (lpMint: string, decimals: number) => void setLpDecimalsQ.run(decimals, lpMint)

// ---- state ----
export type SolPoolStateRow = {
  address: string
  reserve_a: string
  reserve_b: string
  lp_total_supply: string | null
  sqrt_price: string | null
  tick_current: number | null
  liquidity: string | null
  tvl_usd: number | null
  updated: number
}

const stateByAddrQ = db.prepare('SELECT * FROM sol_pool_state WHERE address = ?')
export const poolState = (addr: string): SolPoolStateRow | undefined =>
  stateByAddrQ.get(addr) as SolPoolStateRow | undefined

const upStateQ = db.prepare(`
  INSERT INTO sol_pool_state (address, reserve_a, reserve_b, lp_total_supply, sqrt_price, tick_current, liquidity, tvl_usd, updated)
  VALUES (?, COALESCE(?, '0'), COALESCE(?, '0'), ?, ?, ?, ?, ?, ?)
  ON CONFLICT(address) DO UPDATE SET
    reserve_a = COALESCE(excluded.reserve_a, sol_pool_state.reserve_a),
    reserve_b = COALESCE(excluded.reserve_b, sol_pool_state.reserve_b),
    lp_total_supply = COALESCE(excluded.lp_total_supply, sol_pool_state.lp_total_supply),
    sqrt_price = COALESCE(excluded.sqrt_price, sol_pool_state.sqrt_price),
    tick_current = COALESCE(excluded.tick_current, sol_pool_state.tick_current),
    liquidity = COALESCE(excluded.liquidity, sol_pool_state.liquidity),
    tvl_usd = COALESCE(excluded.tvl_usd, sol_pool_state.tvl_usd),
    updated = excluded.updated`)

export const upsertState = (
  addr: string,
  s: {
    reserveA?: bigint
    reserveB?: bigint
    lpTotalSupply?: bigint
    sqrtPrice?: bigint
    tickCurrent?: number
    liquidity?: bigint
    tvlUsd?: number | null
  },
) =>
  void upStateQ.run(
    addr,
    s.reserveA !== undefined ? String(s.reserveA) : null,
    s.reserveB !== undefined ? String(s.reserveB) : null,
    s.lpTotalSupply !== undefined ? String(s.lpTotalSupply) : null,
    s.sqrtPrice !== undefined ? String(s.sqrtPrice) : null,
    s.tickCurrent ?? null,
    s.liquidity !== undefined ? String(s.liquidity) : null,
    s.tvlUsd ?? null,
    now(),
  )

// ---- tokens ----
const insTokenQ = db.prepare(`
  INSERT INTO sol_tokens (mint, symbol, decimals) VALUES (?, ?, ?)
  ON CONFLICT(mint) DO UPDATE SET
    symbol = CASE WHEN excluded.symbol = '?' THEN sol_tokens.symbol ELSE excluded.symbol END,
    decimals = excluded.decimals`)

export const upsertTokenMeta = (mint: string, symbol: string, decimals: number) =>
  void insTokenQ.run(mint, symbol, decimals)

export type SolTokenRow = {
  mint: string
  symbol: string
  decimals: number | null
  price_usd: number | null
  price_updated: number | null
}

const priceUpdateQ = db.prepare(`
  INSERT INTO sol_tokens (mint, price_usd, price_updated) VALUES (?, ?, ?)
  ON CONFLICT(mint) DO UPDATE SET price_usd = excluded.price_usd, price_updated = excluded.price_updated`)

export const setTokenPrice = (mint: string, priceUsd: number) =>
  void priceUpdateQ.run(mint, priceUsd, now())

export const tokenByMint = (mint: string): SolTokenRow | undefined =>
  db.prepare('SELECT * FROM sol_tokens WHERE mint = ?').get(mint) as SolTokenRow | undefined

export const allPoolMints = (): string[] =>
  (
    db
      .prepare(
        `SELECT DISTINCT u.mint FROM (
           SELECT token_a AS mint FROM sol_pools UNION SELECT token_b FROM sol_pools
         ) u`,
      )
      .all() as { mint: string }[]
  ).map((r) => r.mint)

export const missingMetaMints = (): string[] =>
  (
    db
      .prepare(
        `SELECT DISTINCT u.mint FROM (
           SELECT token_a AS mint FROM sol_pools UNION SELECT token_b FROM sol_pools
         ) u LEFT JOIN sol_tokens t ON t.mint = u.mint
         WHERE t.mint IS NULL OR t.decimals IS NULL OR t.symbol = '?'`,
      )
      .all() as { mint: string }[]
  ).map((r) => r.mint)

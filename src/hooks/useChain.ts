import { useSyncExternalStore } from 'react'
import { bsc, getAllChains, getChainById, robinhood, type ChainAdapter } from '../lib/chains'
import { queryClient } from '../config/query'

const STORAGE_KEY = 'up33.selectedChain'
const INDEXER_MANAGER_URL = ''

function getStoredChain(): ChainAdapter {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const id = Number(raw)
      if (Number.isFinite(id)) {
        const c = getChainById(id)
        if (c) return c
      }
    }
  } catch {
    /* storage unavailable */
  }
  return robinhood
}

let currentChain = getStoredChain()
let indexerSwitching = false
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

async function ensureIndexerRunning(chain: ChainAdapter): Promise<void> {
  const res = await fetch(`${INDEXER_MANAGER_URL}/api/chains/${chain.id}/start`, { method: 'POST' })
  if (!res.ok) throw new Error(`indexer start failed: ${res.status}`)
  const data = (await res.json()) as { running: boolean; ready: boolean }
  if (!data.running) throw new Error('indexer did not start')
}

export const ensureCurrentChainIndexer = () => ensureIndexerRunning(currentChain)

export async function setCurrentChain(chain: ChainAdapter): Promise<void> {
  const oldId = currentChain.id
  if (oldId === chain.id) return
  indexerSwitching = true
  currentChain = chain
  try {
    localStorage.setItem(STORAGE_KEY, String(chain.id))
  } catch {
    /* ignore */
  }
  emit()
  try {
    await queryClient.cancelQueries({ predicate: (q) => q.queryKey.includes(oldId) })
    queryClient.removeQueries({ predicate: (q) => q.queryKey.includes(oldId) })
    // Index data is an optimization. A failed manager must not block chain
    // switching because Uniswap browsing has an on-chain/DexScreener fallback.
    await ensureIndexerRunning(chain).catch(() => undefined)
  } finally {
    indexerSwitching = false
    emit()
  }
}

/** Non-React accessor for lib/utility modules. */
export function getCurrentChain(): ChainAdapter {
  return currentChain
}

export function useCurrentChain(): ChainAdapter {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => currentChain,
    () => currentChain,
  )
}

export function useIndexerSwitching(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => indexerSwitching,
    () => false,
  )
}

export const allChains = getAllChains()

// Re-export for convenience
export { bsc, robinhood }
export type { ChainAdapter }

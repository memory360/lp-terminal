import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import type { Address, PublicClient } from 'viem'
import { quoterAbi, v2RouterAbi } from '../abi'
import { getCurrentChain, useCurrentChain } from './useChain'
import { requireEvmChain } from '../lib/chains'
import { NATIVE, kyberRoute } from '../lib/kyber'
import type { ChainAdapter } from '../lib/chains'
import type { ClPool, PoolsData, V2Pool } from '../types'
import { usePools } from './usePools'

export const isNative = (a?: Address) => !!a && a.toLowerCase() === NATIVE.toLowerCase()
export const erc20Of = (a: Address): Address => (isNative(a) ? requireEvmChain(getCurrentChain()).anchors.weth : a)

export type NativeCandidate =
  | { kind: 'v2'; pool: V2Pool; amountOut: bigint }
  | { kind: 'cl'; pool: ClPool; amountOut: bigint }

export type NativeQuote = {
  best: NativeCandidate | null
  candidates: NativeCandidate[]
}

async function fetchNativeQuote(
  pc: PublicClient,
  pools: PoolsData,
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
  chain: ChainAdapter,
): Promise<NativeQuote> {
  const evmChain = requireEvmChain(chain)
  const tIn = erc20Of(tokenIn).toLowerCase()
  const tOut = erc20Of(tokenOut).toLowerCase()
  const matches = pools.pools.filter((p) => {
    if (p.protocol !== 'up33') return false
    const a = p.token0.toLowerCase()
    const b = p.token1.toLowerCase()
    return (a === tIn && b === tOut) || (a === tOut && b === tIn)
  })
  const up33 = evmChain.up33
  if (!matches.length || tIn === tOut || !up33) return { best: null, candidates: [] }

  const calls = matches.map((p) =>
    p.kind === 'v2'
      ? {
          abi: v2RouterAbi,
          address: up33.V2_ROUTER,
          functionName: 'getAmountsOut',
          args: [
            amountIn,
            [{ from: erc20Of(tokenIn), to: erc20Of(tokenOut), stable: p.stable, factory: up33.V2_FACTORY }],
          ],
        }
      : {
          abi: quoterAbi,
          address: up33.CL_QUOTER,
          functionName: 'quoteExactInputSingle',
          args: [
            {
              tokenIn: erc20Of(tokenIn),
              tokenOut: erc20Of(tokenOut),
              amountIn,
              tickSpacing: p.tickSpacing,
              sqrtPriceLimitX96: 0n,
            },
          ],
        },
  )
  const res = (await pc.multicall({ contracts: calls as never })) as {
    status: 'success' | 'failure'
    result?: unknown
  }[]

  const candidates: NativeCandidate[] = []
  res.forEach((r, i) => {
    if (r.status !== 'success') return
    const p = matches[i]
    if (p.kind === 'v2') {
      const amounts = r.result as readonly bigint[]
      const out = amounts[amounts.length - 1]
      if (out > 0n) candidates.push({ kind: 'v2', pool: p, amountOut: out })
    } else {
      const [out] = r.result as readonly [bigint, bigint, number, bigint]
      if (out > 0n) candidates.push({ kind: 'cl', pool: p, amountOut: out })
    }
  })
  candidates.sort((a, b) => (b.amountOut > a.amountOut ? 1 : b.amountOut < a.amountOut ? -1 : 0))
  return { best: candidates[0] ?? null, candidates }
}

export function useNativeQuote(tokenIn?: Address, tokenOut?: Address, amountIn?: bigint) {
  const chain = requireEvmChain(useCurrentChain())
  const pc = usePublicClient({ chainId: chain.id })
  const pools = usePools()
  const enabled =
    !!pc && !!pools.data && !!tokenIn && !!tokenOut && !!amountIn && amountIn > 0n &&
    erc20Of(tokenIn).toLowerCase() !== erc20Of(tokenOut).toLowerCase()
  return useQuery({
    queryKey: ['nativeQuote', chain.id, tokenIn, tokenOut, amountIn?.toString()],
    enabled,
    refetchInterval: 15_000,
    queryFn: () =>
      fetchNativeQuote(pc as PublicClient, pools.data!, tokenIn!, tokenOut!, amountIn!, chain),
  })
}

export function useKyberQuote(tokenIn?: Address, tokenOut?: Address, amountIn?: bigint) {
  const chain = requireEvmChain(useCurrentChain())
  const weth = chain.anchors.weth.toLowerCase()
  const enabled =
    !!tokenIn && !!tokenOut && !!amountIn && amountIn > 0n &&
    tokenIn.toLowerCase() !== tokenOut.toLowerCase() &&
    // wrap/unwrap is not a swap
    !(
      (isNative(tokenIn) && tokenOut.toLowerCase() === weth) ||
      (isNative(tokenOut) && tokenIn.toLowerCase() === weth)
    )
  return useQuery({
    queryKey: ['kyberQuote', chain.id, tokenIn, tokenOut, amountIn?.toString()],
    enabled,
    refetchInterval: 15_000,
    retry: 1,
    queryFn: ({ signal }) =>
      kyberRoute(tokenIn!, tokenOut!, amountIn!, { signal, chain: chain.kyberChain }),
  })
}

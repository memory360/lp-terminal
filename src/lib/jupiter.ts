// Jupiter swap integration (v7 API).
// Keeps quote/swap execution isolated from UI state.
import { Connection, VersionedTransaction } from '@solana/web3.js'
import { solana } from '../lib/chains'
import { requireSolanaChain } from '../lib/chains'
import { rpcUrlForChain } from '../config/env'
import { customRpc } from './rpcPref'

const solanaChain = requireSolanaChain(solana)

export type JupiterQuote = {
  inputMint: string
  inAmount: string
  outputMint: string
  outAmount: string
  otherAmountThreshold: string
  swapMode: 'ExactIn' | 'ExactOut'
  slippageBps: number
  priceImpactPct: string
  routePlan: Array<{
    swapInfo: {
      ammKey: string
      label: string
      inputMint: string
      outputMint: string
      inAmount: string
      outAmount: string
    }
    percent: number
  }>
  contextSlot: number
  swapUsdValue?: string
}

export type JupiterSwapResult = { txid: string }

function jupiterBase(): string {
  return solanaChain.jupiterBase
}

function rpcUrl(): string {
  return customRpc(solanaChain.id) || rpcUrlForChain(solanaChain.key) || solanaChain.publicRpc
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

export async function fetchJupiterQuote(args: {
  inputMint: string
  outputMint: string
  amount: string // raw token amount as string
  slippageBps: number
}): Promise<JupiterQuote> {
  const params = new URLSearchParams({
    inputMint: args.inputMint,
    outputMint: args.outputMint,
    amount: args.amount,
    slippageBps: String(args.slippageBps),
  })
  const res = await fetch(`${jupiterBase()}/quote?${params.toString()}`, {
    headers: { accept: 'application/json' },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Jupiter quote ${res.status}: ${text}`)
  }
  return (await res.json()) as JupiterQuote
}

export async function executeJupiterSwap(args: {
  quote: JupiterQuote
  userPublicKey: string
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>
}): Promise<JupiterSwapResult> {
  const res = await fetch(`${jupiterBase()}/swap`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      quoteResponse: args.quote,
      userPublicKey: args.userPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      dynamicSlippage: true,
      // Use a recent priority fee medium level; tune if needed.
      prioritizationFeeLamports: 'auto',
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Jupiter swap ${res.status}: ${text}`)
  }
  const json = (await res.json()) as { swapTransaction: string }
  const tx = VersionedTransaction.deserialize(decodeBase64(json.swapTransaction))
  const signed = await args.signTransaction(tx)
  const connection = new Connection(rpcUrl(), 'confirmed')
  const txid = await connection.sendTransaction(signed, { maxRetries: 3 })
  await connection.confirmTransaction(txid, 'confirmed')
  return { txid }
}

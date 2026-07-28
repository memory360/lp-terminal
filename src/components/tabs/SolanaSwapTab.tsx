// Solana swap UI via Jupiter aggregator + Phantom wallet.
import { useEffect, useMemo, useState } from 'react'
import { parseUnits } from 'viem'
import { useTranslation } from 'react-i18next'
import { useCurrentChain } from '../../hooks/useChain'
import { useSolanaTokens } from '../../hooks/useSolanaTokens'
import { useSolanaWallet } from '../../hooks/useSolanaWallet'
import { executeJupiterSwap, fetchJupiterQuote, type JupiterQuote } from '../../lib/jupiter'
import { fmtAmount, fmtUsd } from '../../lib/format'
import { Btn } from '../ui'

export function SolanaSwapTab() {
  const { t } = useTranslation()
  const chain = useCurrentChain()
  const wallet = useSolanaWallet()
  const tokens = useSolanaTokens()
  const [showWalletSelect, setShowWalletSelect] = useState(false)

  const [inputMint, setInputMint] = useState('So11111111111111111111111111111111111111112')
  const [outputMint, setOutputMint] = useState('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
  const [amount, setAmount] = useState('')
  const [slippage, setSlippage] = useState(50) // bps
  const [quote, setQuote] = useState<JupiterQuote | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [swapping, setSwapping] = useState(false)
  const [txid, setTxid] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const inputToken = useMemo(() => tokens.data?.find((t) => t.mint === inputMint), [tokens.data, inputMint])
  const outputToken = useMemo(() => tokens.data?.find((t) => t.mint === outputMint), [tokens.data, outputMint])

  useEffect(() => {
    setQuote(null)
  }, [inputMint, outputMint, amount, slippage])

  const onQuote = async () => {
    if (!inputToken || !outputToken || !amount || inputMint === outputMint) return
    setError(null)
    setTxid(null)
    setQuoting(true)
    try {
      const q = await fetchJupiterQuote({
        inputMint,
        outputMint,
        amount: parseUnits(amount, inputToken.decimals).toString(),
        slippageBps: slippage,
      })
      setQuote(q)
    } catch (e) {
      setError(String(e))
    } finally {
      setQuoting(false)
    }
  }

  const onSwap = async () => {
    if (!quote || !wallet.publicKey) return
    setError(null)
    setSwapping(true)
    try {
      const res = await executeJupiterSwap({
        quote,
        userPublicKey: wallet.publicKey,
        signTransaction: wallet.signTransaction,
      })
      setTxid(res.txid)
    } catch (e) {
      setError(String(e))
    } finally {
      setSwapping(false)
    }
  }

  if (tokens.isLoading) {
    return (
      <div className="dim">
        {t('pos.scanning')} <span className="spin">▮</span>
      </div>
    )
  }

  return (
    <div className="swap-panel">
      <h3>Solana Swap (Jupiter)</h3>

      {!wallet.connected ? (
        <div>
          <Btn onClick={() => setShowWalletSelect((s) => !s)} busy={wallet.connecting}>
            Connect Wallet
          </Btn>
          {showWalletSelect && (
            <div className="wallet-select" style={{ marginTop: 8 }}>
              {wallet.providers.map((p) => (
                <Btn
                  key={p.name}
                  onClick={() => {
                    wallet.connect(p.name).catch((e) => setError(String(e)))
                    setShowWalletSelect(false)
                  }}
                  disabled={!p.detected}
                  tone={p.detected ? 'default' : 'ghost'}
                >
                  {p.label} {p.detected ? '' : '(not installed)'}
                </Btn>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="dim mono-sm">
          Connected ({wallet.activeProvider}): {wallet.publicKey}
          <Btn onClick={wallet.disconnect} tone="ghost">
            Disconnect
          </Btn>
        </div>
      )}

      <div className="form-row">
        <span className="lbl">Pay</span>
        <select value={inputMint} onChange={(e) => setInputMint(e.target.value)}>
          {tokens.data?.map((t) => (
            <option key={t.mint} value={t.mint}>
              {t.symbol} ({t.mint.slice(0, 4)}...)
            </option>
          ))}
        </select>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.0"
          style={{ width: 160 }}
        />
        {inputToken?.priceUsd && amount ? (
          <span className="dim mono-sm">≈ {fmtUsd(Number(amount) * inputToken.priceUsd)}</span>
        ) : null}
      </div>

      <div className="form-row">
        <span className="lbl">Receive</span>
        <select value={outputMint} onChange={(e) => setOutputMint(e.target.value)}>
          {tokens.data?.map((t) => (
            <option key={t.mint} value={t.mint}>
              {t.symbol} ({t.mint.slice(0, 4)}...)
            </option>
          ))}
        </select>
      </div>

      <div className="form-row">
        <span className="lbl">Slippage</span>
        <input
          type="range"
          min={10}
          max={500}
          step={10}
          value={slippage}
          onChange={(e) => setSlippage(Number(e.target.value))}
        />
        <span className="mono-sm">{(slippage / 100).toFixed(2)}%</span>
      </div>

      <div className="form-row">
        <Btn onClick={onQuote} busy={quoting} disabled={!inputToken || !outputToken || !amount || inputMint === outputMint}>
          Get Quote
        </Btn>
        <Btn
          onClick={onSwap}
          busy={swapping}
          disabled={!quote || !wallet.connected}
          tone={!quote || !wallet.connected ? 'ghost' : 'default'}
        >
          Swap
        </Btn>
      </div>

      {quote && outputToken && (
        <div className="quote-box">
          <div>
            You receive: {fmtAmount(BigInt(quote.outAmount), outputToken.decimals)} {outputToken.symbol}
          </div>
          <div className="dim mono-sm">Price impact: {(Number(quote.priceImpactPct) * 100).toFixed(4)}%</div>
          {quote.swapUsdValue && <div className="dim mono-sm">USD value: {fmtUsd(Number(quote.swapUsdValue))}</div>}
        </div>
      )}

      {txid && (
        <div className="green">
          Tx sent:{' '}
          <a href={`${chain.explorerUrl}/tx/${txid}`} target="_blank" rel="noreferrer">
            {txid.slice(0, 16)}...
          </a>
        </div>
      )}
      {error && <div className="red">{error}</div>}
    </div>
  )
}

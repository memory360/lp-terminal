// Raydium AMM V4 add/remove liquidity UI.
import { useMemo, useState } from 'react'
import { useCurrentChain } from '../../hooks/useChain'
import { useSolanaPools } from '../../hooks/useSolanaPools'
import { useSolanaPositions } from '../../hooks/useSolanaPositions'
import { useSolanaWallet } from '../../hooks/useSolanaWallet'
import { addRaydiumLiquidity, removeRaydiumLiquidity } from '../../lib/raydium'
import { fmtAmount, fmtNum, fmtUsd } from '../../lib/format'
import { Btn } from '../ui'
import { parseUnits } from 'viem'

export function SolanaLiquidityTab() {
  const chain = useCurrentChain()
  const wallet = useSolanaWallet()
  const pools = useSolanaPools()
  const positions = useSolanaPositions()

  const [mode, setMode] = useState<'add' | 'remove'>('add')
  const [selectedPool, setSelectedPool] = useState<string>('')
  const [amountA, setAmountA] = useState('')
  const [amountB, setAmountB] = useState('')
  const [slippage, setSlippage] = useState(0.5) // percent
  const [busy, setBusy] = useState(false)
  const [txid, setTxid] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const pool = useMemo(() => pools.data?.find((p) => p.address === selectedPool), [pools.data, selectedPool])
  const position = useMemo(
    () => positions.data?.find((p) => p.pool.address === selectedPool),
    [positions.data, selectedPool],
  )

  const onAdd = async () => {
    if (!pool || !wallet.publicKey) return
    setBusy(true)
    setError(null)
    setTxid(null)
    try {
      const res = await addRaydiumLiquidity({
        pool,
        amountA: parseUnits(amountA, pool.tokenA.decimals),
        amountB: parseUnits(amountB, pool.tokenB.decimals),
        fixedSide: 'a',
        slippage: slippage / 100,
        owner: wallet.publicKey,
        signTransaction: wallet.signTransaction,
      })
      setTxid(res.txid)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  const onRemove = async () => {
    if (!pool || !wallet.publicKey || !position) return
    setBusy(true)
    setError(null)
    setTxid(null)
    try {
      const res = await removeRaydiumLiquidity({
        pool,
        lpAmount: position.lpBalance,
        slippage: slippage / 100,
        owner: wallet.publicKey,
        signTransaction: wallet.signTransaction,
      })
      setTxid(res.txid)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!wallet.connected) {
    return (
      <div>
        <div className="dim">Connect a Solana wallet to manage liquidity.</div>
        {wallet.providers.filter((p) => p.detected).map((p) => (
          <Btn key={p.name} onClick={() => wallet.connect(p.name).catch((e) => setError(String(e)))} busy={wallet.connecting}>
            Connect {p.label}
          </Btn>
        ))}
        {error && <div className="red">{error}</div>}
      </div>
    )
  }

  return (
    <div className="swap-panel">
      <h3>Raydium AMM V4 Liquidity</h3>
      <div className="form-row">
        <Btn tone={mode === 'add' ? 'default' : 'ghost'} onClick={() => setMode('add')}>
          Add
        </Btn>
        <Btn tone={mode === 'remove' ? 'default' : 'ghost'} onClick={() => setMode('remove')}>
          Remove
        </Btn>
      </div>

      <div className="form-row">
        <span className="lbl">Pool</span>
        <select value={selectedPool} onChange={(e) => setSelectedPool(e.target.value)}>
          <option value="">Select pool</option>
          {(mode === 'add'
            ? pools.data?.filter((p) => p.poolType === 'amm' && p.program === 'raydium-amm-v4' && p.lpMint)
            : positions.data?.map((p) => p.pool))?.map((p) => (
            <option key={p.address} value={p.address}>
              {p.tokenA.symbol}/{p.tokenB.symbol} ({p.program})
            </option>
          ))}
        </select>
      </div>

      {pool && (
        <>
          {mode === 'add' && (
            <>
              <div className="form-row">
                <span className="lbl">{pool.tokenA.symbol}</span>
                <input type="number" value={amountA} onChange={(e) => setAmountA(e.target.value)} placeholder="0.0" />
              </div>
              <div className="form-row">
                <span className="lbl">{pool.tokenB.symbol}</span>
                <input type="number" value={amountB} onChange={(e) => setAmountB(e.target.value)} placeholder="0.0" />
              </div>
            </>
          )}
          {mode === 'remove' && position && (
            <div className="form-row">
              <span className="lbl">LP Balance</span>
              <span className="mono-sm">
                {fmtAmount(position.lpBalance, pool.lpDecimals)} {pool.tokenA.symbol}/{pool.tokenB.symbol} LP
              </span>
            </div>
          )}

          <div className="form-row">
            <span className="lbl">Slippage</span>
            <input
              type="range"
              min={0.1}
              max={5}
              step={0.1}
              value={slippage}
              onChange={(e) => setSlippage(Number(e.target.value))}
            />
            <span className="mono-sm">{slippage.toFixed(1)}%</span>
          </div>

          <div className="form-row">
            <Btn busy={busy} onClick={mode === 'add' ? onAdd : onRemove} disabled={!pool || busy || (mode === 'add' && (!amountA || !amountB))}>
              {mode === 'add' ? 'Add Liquidity' : 'Remove All Liquidity'}
            </Btn>
          </div>
        </>
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

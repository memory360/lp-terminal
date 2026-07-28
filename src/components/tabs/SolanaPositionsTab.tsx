// Solana LP positions display (read-only).
// Shows AMM V4 LP token positions and Raydium CLMM NFT positions with
// underlying reserves, price ranges, and USD value estimates.
import { useTranslation } from 'react-i18next'
import { useSolanaClmmPositions, type SolClmmPosition } from '../../hooks/useSolanaClmmPositions'
import { useSolanaPositions } from '../../hooks/useSolanaPositions'
import { useSolanaWallet } from '../../hooks/useSolanaWallet'
import { fmtAmount, fmtNum, fmtUsd, shortAddr } from '../../lib/format'

export function SolanaPositionsTab() {
  const { t } = useTranslation()
  const wallet = useSolanaWallet()
  const positions = useSolanaPositions()
  const clmmPositions = useSolanaClmmPositions()

  if (!wallet.connected) {
    return (
      <div className="dim">
        Connect a Solana wallet to view positions.
      </div>
    )
  }

  if (positions.isLoading || clmmPositions.isLoading) {
    return (
      <div className="dim">
        {t('pos.scanning')} <span className="spin">▮</span>
      </div>
    )
  }
  if (positions.isError) {
    return <div className="red">{String(positions.error)}</div>
  }
  if (clmmPositions.isError) {
    return <div className="red">{String(clmmPositions.error)}</div>
  }

  const ammData = positions.data ?? []
  const clmmData = clmmPositions.data ?? []
  const totalValue =
    ammData.reduce((a, x) => a + (x.valueUsd ?? 0), 0) +
    clmmData.reduce((a, x) => a + (x.valueUsd ?? 0), 0)

  return (
    <div>
      <div className="section-title">
        Solana LP Positions ({ammData.length + clmmData.length}){' '}
        {totalValue > 0 && <span className="dim">· {fmtUsd(totalValue)}</span>}
      </div>

      {ammData.length === 0 && clmmData.length === 0 ? (
        <div className="dim">No LP positions found for this wallet.</div>
      ) : (
        <>
          {ammData.length > 0 && (
            <div className="subsection">
              <div className="subsection-title">AMM V4</div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Pool</th>
                    <th>LP Balance</th>
                    <th>Share</th>
                    <th>{'Token A'}</th>
                    <th>{'Token B'}</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {ammData.map((p) => (
                    <tr key={p.pool.address}>
                      <td>
                        <div>
                          {p.pool.tokenA.symbol}/{p.pool.tokenB.symbol}
                        </div>
                        <div className="dim mono-sm">{shortAddr(p.pool.address)}</div>
                      </td>
                      <td className="mono-sm">{fmtAmount(p.lpBalance, 9)}</td>
                      <td className="mono-sm">{fmtNum(p.share * 100, 4)}%</td>
                      <td className="mono-sm">
                        {fmtNum(p.amountA, 6)} {p.pool.tokenA.symbol}
                      </td>
                      <td className="mono-sm">
                        {fmtNum(p.amountB, 6)} {p.pool.tokenB.symbol}
                      </td>
                      <td>{p.valueUsd != null ? fmtUsd(p.valueUsd) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {clmmData.length > 0 && (
            <div className="subsection">
              <div className="subsection-title">Raydium CLMM</div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Pool</th>
                    <th>Range</th>
                    <th>Status</th>
                    <th>{'Token A'}</th>
                    <th>{'Token B'}</th>
                    <th>Fees</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {clmmData.map((p) => (
                    <tr key={`${p.pool.address}-${p.nftMint}`}>
                      <td>
                        <div>
                          {p.pool.tokenA.symbol}/{p.pool.tokenB.symbol}
                        </div>
                        <div className="dim mono-sm">{shortAddr(p.pool.address)}</div>
                      </td>
                      <td className="mono-sm">
                        <Range position={p} />
                      </td>
                      <td>
                        {p.inRange ? (
                          <span className="green">In range</span>
                        ) : (
                          <span className="red">Out of range</span>
                        )}
                      </td>
                      <td className="mono-sm">
                        {fmtNum(p.amountA, 6)} {p.pool.tokenA.symbol}
                      </td>
                      <td className="mono-sm">
                        {fmtNum(p.amountB, 6)} {p.pool.tokenB.symbol}
                      </td>
                      <td className="mono-sm">
                        <FeeAmount amount={p.feeOwedA} symbol={p.pool.tokenA.symbol} />
                        <FeeAmount amount={p.feeOwedB} symbol={p.pool.tokenB.symbol} />
                      </td>
                      <td>{p.valueUsd != null ? fmtUsd(p.valueUsd) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Range({ position }: { position: SolClmmPosition }) {
  return (
    <div>
      <div>{fmtNum(position.priceLower, 4)}</div>
      <div className="dim">↓</div>
      <div>{fmtNum(position.priceUpper, 4)}</div>
    </div>
  )
}

function FeeAmount({ amount, symbol }: { amount: number; symbol: string }) {
  if (!amount || amount <= 0) return null
  return (
    <div>
      {fmtNum(amount, 4)} {symbol}
    </div>
  )
}

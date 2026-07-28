import type { Chain } from 'viem'
import { bsc as viemBsc } from 'viem/chains'
import type { ChainAdapter } from '../types'

const explorerApi = 'https://api.bscscan.com/api'

// BscScan requires an API key for log queries (free tier without key is
// rate-limited to 1 req/5s and rejects large block ranges). Read from env at
// module load — safe in browser (process undefined → empty string, logsUrl is
// indexer-only anyway).
const bscscanApiKey =
  typeof process !== 'undefined' && process.env ? process.env.BSCSCAN_API_KEY ?? '' : ''

export const bsc: ChainAdapter = {
  id: 56,
  key: 'bsc',
  name: 'BNB Smart Chain',
  paradigm: 'evm',
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  wrappedNativeSymbol: 'WBNB',
  publicRpc: 'https://bsc-dataseed.binance.org',
  explorerUrl: 'https://bscscan.com',
  explorerApi: {
    type: 'etherscan',
    base: explorerApi,
    apiKey: bscscanApiKey || undefined,
    logsUrl: ({ fromBlock, address, topic0 }) =>
      `${explorerApi}?module=logs&action=getLogs&fromBlock=${fromBlock}&toBlock=latest&address=${address}&topic0=${topic0}${bscscanApiKey ? `&apikey=${bscscanApiKey}` : ''}`,
  },
  dexScreenerChain: 'bsc',
  geckoTerminalNetwork: 'bsc',
  // The Graph decentralized-network deployment "Uniswap V2 BSC". The
  // same-origin proxy injects THEGRAPH_API_KEY server-side.
  v2SubgraphUrl: '/graph-bsc-v2',
  anchors: {
    weth: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    stable: '0x55d398326f99059ff775485246999027b3197955',
  },
  uniswap: {
    v3Factory: '0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7',
    v3Npm: '0x7b8A01B39D58278b5DE7e48c8449c9f4F5170613',
    v2Factory: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6',
    v2Router: '0x4752ba5DBc23f44d87826276BF6Fd6b1c372aD24',
    feeTiers: [
      { feePpm: 100, tickSpacing: 1 },
      { feePpm: 500, tickSpacing: 10 },
      { feePpm: 3000, tickSpacing: 60 },
      { feePpm: 10000, tickSpacing: 200 },
    ],
  },
  kyberChain: 'bsc',
  indexerUrl: '/api/chains/56/indexer',
  viemChain: viemBsc as Chain & { id: 56 },
}

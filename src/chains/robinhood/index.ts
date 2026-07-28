import type { Address, Chain } from 'viem'
import type { ChainAdapter } from '../types'

const explorerUrl = 'https://robinhoodchain.blockscout.com'

export const robinhood: ChainAdapter = {
  id: 4663,
  key: 'robinhood',
  name: 'Robinhood Chain',
  paradigm: 'evm',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  wrappedNativeSymbol: 'WETH',
  publicRpc: 'https://rpc.mainnet.chain.robinhood.com',
  rpcProxyUrl: '/rpc',
  explorerUrl,
  explorerApi: {
    type: 'blockscout',
    base: explorerUrl,
    logsUrl: ({ fromBlock, address, topic0 }) =>
      `${explorerUrl}/api?module=logs&action=getLogs&fromBlock=${fromBlock}&toBlock=latest&address=${address}&topic0=${topic0}`,
    walletTokenBalancesUrl: (owner: Address) =>
      `${explorerUrl}/api/v2/addresses/${owner}/token-balances`,
  },
  dexScreenerChain: 'robinhood',
  geckoTerminalNetwork: 'robinhood',
  anchors: {
    weth: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73',
    stable: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
    up: '0x57C0E45cB534413D1C20A4240955d6bB250BB4F1',
  },
  up33: {
    UP: '0x57C0E45cB534413D1C20A4240955d6bB250BB4F1',
    VE_UP: '0x5d321dE36F0bf98D92b291280514F3878582B7B6',
    VOTER: '0x7F749fDD351C1Ceed82d76d7699CB631Eb8332a7',
    MINTER: '0x912EC7A90e8C9829eE0e0f6a4Db5270776Fc3Da5',
    V2_FACTORY: '0xFA5429AEBa338BEa2BFcc1b9a889862Ee395bc28',
    V2_ROUTER: '0xf5198743240fAC98db71868F34c70139b1eb0474',
    CL_FACTORY: '0x1ac9dB4a2608ba45D6127B1737949b51Bb54B7F3',
    CL_PM: '0x07F44c47743A2f36414A82b9F558ECFCf0EEdCEf',
    CL_SWAP_ROUTER: '0xC062b870E813fcA720f1e002c234369Ab3aB9415',
    CL_QUOTER: '0x03983AB2C057a2eac211ff01738a1e49ff325B49',
  },
  uniswap: {
    v3Factory: '0x1f7d7550B1b028f7571E69A784071F0205FD2EfA',
    v3Npm: '0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3',
    v2Factory: '0x8bcEaA40B9AcdfAedF85AdF4FF01F5Ad6517937f',
    v2Router: '0x89e5DB8B5aA49aA85AC63f691524311AEB649eba',
    feeTiers: [
      { feePpm: 100, tickSpacing: 1 },
      { feePpm: 500, tickSpacing: 10 },
      { feePpm: 3000, tickSpacing: 60 },
      { feePpm: 10000, tickSpacing: 200 },
    ],
  },
  protocols: {
    virtuals: {
      launcher: '0xd4ccbfa37e2f35611b3042e4096ad7a3459bd007',
      preLaunchedTopic: '0x0f1f81e63fb9ab7743dd9a725c80ca7a0f36f140dc853bed2970567bb46cb4da',
    },
  },
  kyberChain: 'robinhood',
  indexerUrl: '/api/chains/4663/indexer',
  viemChain: {
    id: 4663,
    name: 'Robinhood Chain',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: ['https://rpc.mainnet.chain.robinhood.com'] } },
    blockExplorers: { default: { name: 'Blockscout', url: explorerUrl } },
    contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } },
  } as Chain & { id: 4663 },
}

import assert from 'node:assert/strict'
import { walletTokensOf } from '../src/lib/walletTokens'

const address = '0x1111111111111111111111111111111111111111'
const tokens = walletTokensOf([
  { value: '123', token: { address_hash: address, symbol: ' HELD ', decimals: '18', type: 'ERC-20' } },
  { value: '0', token: { address_hash: address, symbol: 'ZERO', decimals: '18', type: 'ERC-20' } },
  { value: '1', token: { address_hash: address, symbol: 'NFT', decimals: '0', type: 'ERC-721' } },
])

assert.deepEqual(tokens, [{ info: { address, symbol: 'HELD', decimals: 18 }, balance: 123n }])
console.log('Wallet token check passed')

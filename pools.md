# 池子获取与解析说明

## 概述

项目支持两种 DEX 协议的池子：Uniswap v2 和 Uniswap v3。池子数据通过两种方式获取，并经过链上验证确保安全性。

## 数据源

### 1. Pool Indexer API（主数据源）

**端点**: `/api/pools`

**来源**: 服务端 indexer 模块，从官方工厂合约的 `PoolCreated` 事件和 `allPairs` 枚举构建完整目录。

**特点**:
- 包含 v2 + v3 所有池子
- 数据由链上事件构建，天然可信
- 提供链上计算的 TVL 和 GeckoTerminal 24h 交易量

**查询参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| `q` | string | 搜索词：代币地址、池子地址、符号 |
| `min_tvl` | number | 最小 TVL 过滤 |
| `proto` | string | `univ2` 或 `univ3`，限制协议类型 |
| `limit` | number | 返回数量限制（默认 120） |

**响应结构**:
```typescript
type ApiResponse = {
  ready: boolean        // indexer 是否就绪
  totals: Record<string, number>  // 各协议池子总数
  count: number         // 当前查询匹配数
  pools: ApiPool[]      // 池子列表
  tokens: Record<string, TokenInfo>  // 代币元数据
}
```

**代码位置**: [uniIndex.ts](src/lib/uniIndex.ts)

### 2. DexScreener API（备用数据源）

**端点**: `https://api.dexscreener.com`

**触发条件**: Indexer API 不可用或未就绪时自动降级。

**特点**:
- 仅支持 v3 池子
- 限制返回前 30 个高 TVL 池子
- **所有候选池都经过链上验证**

**查询方式**:
| 查询类型 | API 路径 |
|----------|----------|
| 代币地址 | `/token-pairs/v1/robinhood/{address}` |
| 池子地址 | `/latest/dex/pairs/robinhood/{address}` |
| 符号搜索 | `/latest/dex/search?q={query}` |

**代码位置**: [uniBrowse.ts](src/lib/uniBrowse.ts)

## 池类型定义

### V2Pool（Uniswap v2 风格）

```typescript
type V2Pool = {
  kind: 'v2'
  protocol: 'up33' | 'univ2'
  address: Address      // 池子合约地址
  token0: Address       // 代币 0 地址（排序后）
  token1: Address       // 代币 1 地址
  stable: boolean       // 是否为稳定币池
  reserve0: bigint      // 代币 0 储备量（wei）
  reserve1: bigint      // 代币 1 储备量（wei）
  totalSupply: bigint   // LP 代币总供应量
  feeBps: number        // 手续费（1 = 0.01%）
  gaugeTotalSupply: bigint  // gauge 中质押的 LP
}
```

### ClPool（Uniswap v3 风格）

```typescript
type ClPool = {
  kind: 'cl'
  protocol: 'up33' | 'univ3'
  address: Address      // 池子合约地址
  token0: Address       // 代币 0 地址
  token1: Address       // 代币 1 地址
  tickSpacing: number   // tick 间距
  feePpm: number        // 手续费（1e6 = 100%）
  unstakedFeePpm: number // 未质押手续费（ve(3,3) 抽成）
  sqrtPriceX96: bigint  // 当前价格（sqrt(price) * 2^96）
  tick: number          // 当前 tick
  liquidity: bigint     // 总流动性
  stakedLiquidity: bigint // 质押流动性
}
```

**代码位置**: [types.ts](src/types.ts)

## 解析流程

### 流程总览

```
用户搜索 → Indexer API → 成功 → 返回数据
                      ↓ 失败
              DexScreener API → 获取候选池 → 链上验证 → 返回数据
```

### 关键步骤

#### 1. 候选池获取（DexScreener 模式）

```typescript
// 根据查询类型选择 API
if (/^0x[0-9a-fA-F]{40}$/.test(query)) {
  // 先尝试代币地址查询
  const byToken = v3PairsOf(await dsJson(`/token-pairs/v1/robinhood/${query}`))
  if (byToken.length) return byToken
  // 再尝试池子地址查询
  return v3PairsOf(await dsJson(`/latest/dex/pairs/robinhood/${query}`))
}
// 符号搜索
return v3PairsOf(await dsJson(`/latest/dex/search?q=${query}`))
```

**过滤条件**:
- `chainId === 'robinhood'`
- `dexId === 'uniswap'`
- `labels.includes('v3')`

#### 2. 链上验证（核心安全机制）

**为什么需要验证？**

DexScreener 是第三方 API，可能返回伪造的池子地址。必须通过官方工厂合约验证。

**验证步骤**:

```typescript
// 第一步：从池子合约获取 token0, token1, fee
const det = await pc.multicall({
  contracts: addrs.flatMap((a) => [
    { abi: uniV3PoolAbi, address: a, functionName: 'token0' },
    { abi: uniV3PoolAbi, address: a, functionName: 'token1' },
    { abi: uniV3PoolAbi, address: a, functionName: 'fee' },
    { abi: uniV3PoolAbi, address: a, functionName: 'tickSpacing' },
    { abi: uniV3PoolAbi, address: a, functionName: 'slot0' },
    { abi: uniV3PoolAbi, address: a, functionName: 'liquidity' },
  ])
})

// 第二步：调用工厂 getPool(token0, token1, fee)
const gp = await pc.multicall({
  contracts: hyd.map((h) => ({
    abi: uniV3FactoryAbi,
    address: UNI.V3_FACTORY,
    functionName: 'getPool',
    args: [h.token0, h.token1, h.fee],
  }))
})

// 第三步：验证返回地址是否匹配
const verified = hyd.filter((h, i) => {
  const mapped = ok<Address>(gp[i])
  return !!mapped && mapped !== zeroAddress && 
         mapped.toLowerCase() === h.addr.toLowerCase()
})
```

**验证规则**:
- 工厂返回地址不能为零地址
- 工厂返回地址必须与候选池地址完全匹配（大小写不敏感）

#### 3. Token 元数据获取

```typescript
// 使用 localStorage 缓存，避免重复查询
const cache = loadTokenCache()

// 收集缺失的代币
const missing = verified.flatMap(h => [h.token0, h.token1])
  .filter(t => !cache[t.toLowerCase()] && !tokens[t.toLowerCase()])

// 批量获取符号和小数位
const meta = await pc.multicall({
  contracts: missing.flatMap((t) => [
    { abi: erc20Abi, address: t, functionName: 'symbol' },
    { abi: erc20Abi, address: t, functionName: 'decimals' },
  ])
})

// 缓存结果
saveTokenCache(cache)
```

**缓存机制**:
- 存储在 `localStorage`，键为 `up33.tokenCache.v1`
- 缓存代币的 `address`、`symbol`、`decimals`
- 减少链上调用，提升响应速度

#### 4. 统计数据

| 字段 | 来源 | 说明 |
|------|------|------|
| `vol24hUsd` | GeckoTerminal / 链上 | 24h 交易量（USD） |
| `liqUsd` | 链上计算 / GeckoTerminal | TVL（USD） |
| `source` | - | 数据来源标识 |

## 关键配置

### 工厂合约地址

```typescript
// src/config/addresses.ts
export const UNI = {
  V2_FACTORY: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
  V3_FACTORY: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
}
```

### RPC 配置

```typescript
// src/config/env.ts
export const PUBLIC_RPC = 'https://rpc.mainnet.chain.robinhood.com'
```

**RPC 优先级**:
1. 用户自定义（localStorage）
2. 环境变量 `RPC`（.env）
3. 同源代理 `/rpc`（生产环境）
4. `PUBLIC_RPC`（兜底）

## 安全要点

1. **工厂验证**: 所有第三方 API 返回的池子必须经过官方工厂验证
2. **去重处理**: 按池子地址去重，避免重复显示
3. **TVL 排序**: 只显示高 TVL 池子，减少垃圾数据
4. **缓存策略**: Token 元数据缓存减少链上调用
5. **批量调用**: 使用 `multicall` 批量获取数据，降低 RPC 压力

## 使用示例

```typescript
// 搜索特定代币的池子
const data = await fetchUniIndex('ETH', 10000, 'univ3')

// 获取所有高 TVL 池子
const allPools = await fetchUniIndex('', 100000)

// 备用模式（indexer 不可用时）
const fallback = await fetchUniBrowse(publicClient, 'WETH')
```
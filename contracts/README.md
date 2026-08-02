# AuctionHouse contracts

On-chain prediction markets for a Cosmos EVM chain. Each market is a **fixed-product market
maker (FPMM)**: outcome shares are tradeable ERC-1155 tokens, collateral is the chain's native
token, and one unit of collateral always backs one complete set (one share of every outcome),
so winning shares redeem 1:1.

| Contract | Role |
| --- | --- |
| `PredictionFactory` | Deploys markets as EIP-1167 clones, holds `ADMIN_ROLE`, serves the paginated registry |
| `PredictionMarket` | One market: trading, liquidity, resolution, redemption (ERC-1155 shares) |
| `PredictionTreasury` | Protocol-fee sink with two-step ownership |
| `PredictionTypes` / `PredictionErrors` / `PredictionEvents` | Shared enums, structs, custom errors, events |
| `libraries/MarketMath` | Buy/sell/price math over the reserve array |
| `libraries/FeeMath` | Basis-point fee split (protocol cut vs LP retention) |

## Economics

- **Price**: `p_i = (1/r_i) / Σ_k (1/r_k)`; prices always sum to 1e18. A fresh n-way market opens at `1/n` each.
- **Buy**: fee is taken off the top, the rest is added to every reserve, and the bought outcome's
  reserve is reduced by the shares minted (`sharesOut = r_i + invest - r_i·∏_{j≠i} r_j/(r_j+invest)`).
- **Sell**: the exact inverse, rounded in the pool's favour.
- **Fees**: `feeBps` of every trade, split by `protocolFeeShareBps`. The protocol cut goes to the
  treasury; the remainder is re-injected into the reserves, which lifts LP share value without a
  per-share accumulator.
- **Liquidity**: `addFunding` mints LP shares (id `LP_TOKEN_ID`) and hands back the price skew as
  outcome tokens; `removeFunding` returns a proportional basket.
- **Resolution**: an admin calls `resolve(winner)` (or `voidMarket()` for an equal 1/n refund).
  Holders call `redeem()`, which **burns** the shares before paying - so a second claim is
  impossible by construction, not by a flag.

### Solvency invariant

While trading, for every outcome: `reserve[i] + userSupply(i) == totalSets == address(this).balance`.
After resolution only the winning outcome must stay backed (losing shares are deliberately dead).
The test suite asserts this after every state-changing operation.

## Security

AccessControl on the factory, controller-gated lifecycle calls on markets, a storage reentrancy
lock on every value-moving function, checks-effects-interactions ordering, pull-payment
redemption, slippage bounds plus deadlines on trades, checked native `call` transfers, a
16-outcome cap that bounds every loop, and `Ownable2Step` on the treasury.

## Usage

```bash
npm install            # in this folder (kept separate from the azeroth workspace toolchain)
npm run compile
npm run test           # 55 tests: factory, market, treasury, math, integration
npm run node           # local chain on :8545
npm run deploy:local   # deploy + seed markets -> deployments/31337.json
npm run export-abis    # ABIs -> application/src/lib/abis/
```

Deploying to a live chain needs `.env` (copy `.env.example`): `RPC_URL`, `PRIVATE_KEY`, `CHAIN_ID`.
Then `npm run deploy`.

`deployments/<chainId>.json` is the handoff to the frontend: it carries the factory/treasury
addresses and maps each app market id to its on-chain address plus the outcome-id → index map.

## Notes

- **EVM target is `cancun`** because OpenZeppelin 5.6 uses the `mcopy` opcode unconditionally. A
  chain that only supports Paris would need OpenZeppelin pinned to 5.0.x.
- Binary markets are two on-chain outcomes (`Yes` = index 0, `No` = index 1), while the app models
  a binary market as a single `yes` outcome with the NO leg synthesized as `1 - price`. The
  deployment file's `outcomeIndex` map is what reconciles the two.

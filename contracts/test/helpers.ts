import { network } from 'hardhat';

/** One connection shared by every spec; Hardhat 3 hands ethers out per network connection. */
export const connection = await network.create();
export const { ethers, networkHelpers } = connection;

/** Default fee configuration used by the fixtures: 2% trade fee, half of it to the protocol. */
export const FEE_BPS = 200;
export const PROTOCOL_SHARE_BPS = 5000;

/** ERC-1155 id the market issues LP shares under. */
export const LP_TOKEN_ID = (1n << 256n) - 1n;

/** Seed liquidity every fixture market opens with. */
export const SEED = ethers.parseEther('100');

/** A far-future deadline for trades that are not testing the deadline itself. */
export const NO_DEADLINE = (1n << 255n);

/**
 * Deploys the treasury, the market implementation, and the factory.
 * @returns The deployed system plus the signer set.
 */
export async function deploySystem()
{
    const [admin, alice, bob, carol, feeRecipient] = await ethers.getSigners();

    const treasury = await ethers.deployContract('PredictionTreasury', [admin.address, feeRecipient.address]);
    const implementation = await ethers.deployContract('PredictionMarket');
    const factory = await ethers.deployContract('PredictionFactory', [
        admin.address,
        await treasury.getAddress(),
        await implementation.getAddress(),
        FEE_BPS,
        PROTOCOL_SHARE_BPS
    ]);

    return { admin, alice, bob, carol, feeRecipient, treasury, implementation, factory };
}

/**
 * Market creation parameters with sane defaults.
 * @param creator Address credited as creator and first LP.
 * @param outcomeNames Outcome labels; length sets the outcome count.
 * @param overrides Field overrides (timings, fees).
 */
export async function marketParams(
    creator: string,
    outcomeNames: string[] = ['Yes', 'No'],
    overrides: Partial<{ lockTime: bigint; resolveTime: bigint; feeBps: number; protocolFeeShareBps: number }> = {}
)
{
    const now = BigInt(await networkHelpers.time.latest());
    return {
        title: 'Will it happen by 2027?',
        description: 'A market used by the test suite.',
        category: 'crypto',
        imageURI: 'ipfs://image',
        creator,
        lockTime: overrides.lockTime ?? now + 30n * 24n * 3600n,
        resolveTime: overrides.resolveTime ?? now + 31n * 24n * 3600n,
        feeBps: overrides.feeBps ?? FEE_BPS,
        protocolFeeShareBps: overrides.protocolFeeShareBps ?? PROTOCOL_SHARE_BPS,
        outcomeNames
    };
}

/**
 * Deploys the system and one open market.
 * @param outcomeNames Outcome labels for the market.
 */
export async function deployMarket(outcomeNames: string[] = ['Yes', 'No'])
{
    const system = await deploySystem();
    const params = await marketParams(system.admin.address, outcomeNames);
    await system.factory.createMarket(params, { value: SEED });
    const marketAddress = await system.factory.marketAddress(0);
    const market = await ethers.getContractAt('PredictionMarket', marketAddress);
    return { ...system, market, marketAddress, params };
}

/**
 * Named fixtures. `loadFixture` caches by function identity, so every spec must reuse these
 * exact references rather than passing an inline arrow.
 */
export const binaryMarketFixture = () => deployMarket();
export const threeWayMarketFixture = () => deployMarket(['A', 'B', 'C']);
export const fourWayMarketFixture = () => deployMarket(['A', 'B', 'C', 'D']);
export const systemFixture = () => deploySystem();

/**
 * The market's solvency invariant.
 *
 * While trading (Open/Paused/Closed) every outcome is fully backed:
 *   `reserve[i] + userSupply(i) == totalSets == contract balance`.
 *
 * After resolution the losing outcomes are deliberately worthless, so only the winning
 * outcome must stay backed; after a void, the check reduces to collateral covering the
 * outstanding claim. `totalSets == balance` holds in every state.
 * @param market The market contract.
 */
export async function assertSolvent(market: any)
{
    const reserves: bigint[] = await market.getReserves();
    const totalSets: bigint = await market.totalSets();
    const balance = await ethers.provider.getBalance(await market.getAddress());
    const status: bigint = await market.status();

    if (balance !== totalSets)
    {
        throw new Error(`collateral mismatch: balance ${ balance } != totalSets ${ totalSets }`);
    }

    // ERC1155Supply overloads totalSupply(); the id form needs its explicit signature.
    const supplyOf = (id: number): Promise<bigint> => market['totalSupply(uint256)'](id);

    if (status === 3n)
    {
        const winner = Number(await market.winningOutcome());
        const supply = await supplyOf(winner);
        if (reserves[winner] + supply !== totalSets)
        {
            throw new Error(
                `winning outcome ${ winner } unbacked: reserve ${ reserves[winner] } + supply ${ supply } != sets ${ totalSets }`
            );
        }
        return;
    }

    if (status === 4n)
    {
        let outstanding = 0n;
        for (let i = 0; i < reserves.length; i++)
        {
            outstanding += await supplyOf(i);
        }
        if (outstanding / BigInt(reserves.length) > totalSets)
        {
            throw new Error(`voided market cannot cover refunds: ${ outstanding } / n > ${ totalSets }`);
        }
        return;
    }

    for (let i = 0; i < reserves.length; i++)
    {
        const supply = await supplyOf(i);
        if (reserves[i] + supply !== totalSets)
        {
            throw new Error(
                `solvency broken for outcome ${ i }: reserve ${ reserves[i] } + supply ${ supply } != sets ${ totalSets }`
            );
        }
    }
}

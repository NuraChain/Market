import { network } from 'hardhat';

/**
 * Resolves a market to a winning outcome, or voids it. Admin-only, so the signer must hold
 * ADMIN_ROLE on the factory.
 *
 * Usage: `MARKET_ID=0 WINNER=0 npx hardhat run scripts/resolve.ts --network localhost`
 *        `MARKET_ID=0 VOID=true npx hardhat run scripts/resolve.ts --network localhost`
 */
async function main(): Promise<void>
{
    const connection = await network.create();
    const { ethers } = connection;

    const factoryAddress = process.env.FACTORY ?? '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0';
    const marketId = BigInt(process.env.MARKET_ID ?? '0');
    const factory = await ethers.getContractAt('PredictionFactory', factoryAddress);

    if (process.env.VOID === 'true')
    {
        await (await factory.voidMarket(marketId)).wait();
        console.log(`market #${ marketId } voided`);
    }
    else
    {
        const winner = BigInt(process.env.WINNER ?? '0');
        await (await factory.resolveMarket(marketId, winner)).wait();
        console.log(`market #${ marketId } resolved to outcome ${ winner }`);
    }

    const record = await factory.marketAt(marketId);
    console.log(`status now: ${ ['Open', 'Paused', 'Closed', 'Resolved', 'Voided'][Number(record.status)] }`);

    await connection.close?.();
}

main().catch((error) =>
{
    console.error(error);
    process.exitCode = 1;
});

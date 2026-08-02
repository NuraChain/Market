import { network } from 'hardhat';

/**
 * Prints the live state of a deployed market: status, reserves, prices, treasury take, and an
 * account's share balances. Used to verify what the frontend actually wrote on-chain.
 *
 * Usage: `npx hardhat run scripts/inspect.ts --network localhost`
 * Env: `MARKET` (address, defaults to market #0), `ACCOUNT` (address to inspect).
 */
async function main(): Promise<void>
{
    const connection = await network.create();
    const { ethers } = connection;

    const factoryAddress = process.env.FACTORY ?? '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0';
    const factory = await ethers.getContractAt('PredictionFactory', factoryAddress);

    const marketAddress = process.env.MARKET ?? await factory.marketAddress(0);
    const market = await ethers.getContractAt('PredictionMarket', marketAddress);
    const treasury = await ethers.getContractAt('PredictionTreasury', await factory.treasury());

    const account = process.env.ACCOUNT ?? '';
    const statusNames = ['Open', 'Paused', 'Closed', 'Resolved', 'Voided'];
    const outcomes = Number(await market.outcomeCount());
    const reserves: bigint[] = await market.getReserves();
    const prices: bigint[] = await market.getPrices();

    console.log(`market      ${ marketAddress }`);
    console.log(`title       ${ await market.title() }`);
    console.log(`status      ${ statusNames[Number(await market.status())] }`);
    console.log(`totalSets   ${ ethers.formatEther(await market.totalSets()) }`);
    console.log(`balance     ${ ethers.formatEther(await ethers.provider.getBalance(marketAddress)) }`);
    console.log(`treasury    ${ ethers.formatEther(await treasury.collectedFor(marketAddress)) } collected`);

    for (let i = 0; i < outcomes; i++)
    {
        const supply: bigint = await market['totalSupply(uint256)'](i);
        const held = account === '' ? 0n : await market.balanceOf(account, i);
        console.log(
            `outcome ${ i }   ${ await market.outcomeName(i) }`
            + `  price ${ (Number(prices[i]) / 1e18).toFixed(4) }`
            + `  reserve ${ Number(ethers.formatEther(reserves[i])).toFixed(4) }`
            + `  supply ${ Number(ethers.formatEther(supply)).toFixed(4) }`
            + (account === '' ? '' : `  held ${ Number(ethers.formatEther(held)).toFixed(4) }`)
        );
    }

    if (account !== '')
    {
        console.log(`account     ${ account }`);
        console.log(`native      ${ ethers.formatEther(await ethers.provider.getBalance(account)) }`);
    }

    await connection.close?.();
}

main().catch((error) =>
{
    console.error(error);
    process.exitCode = 1;
});

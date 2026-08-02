import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { network } from 'hardhat';

/**
 * Deploys the SYSTEM (treasury, market implementation, factory) and writes
 * `deployments/<chainId>.json` with the addresses the indexer's environment needs.
 * Markets come from `seed.ts` (or the admin console) - never from here.
 *
 * Usage: `npm run deploy:local` (hardhat node) or `npm run deploy` (cosmosEvm from .env).
 */

const HERE = dirname(fileURLToPath(import.meta.url));

/** Default protocol configuration: 2% trade fee, half of it to the treasury. */
const DEFAULT_FEE_BPS = 200;
const DEFAULT_PROTOCOL_SHARE_BPS = 5000;

async function main()
{
    const connection = await network.create();
    const { ethers } = connection;

    const [deployer] = await ethers.getSigners();
    const chainId = Number((await ethers.provider.getNetwork()).chainId);

    console.log(`deploying to chain ${ chainId } as ${ deployer.address }`);
    console.log(`balance: ${ ethers.formatEther(await ethers.provider.getBalance(deployer.address)) }`);

    const treasury = await ethers.deployContract('PredictionTreasury', [deployer.address, deployer.address]);
    await treasury.waitForDeployment();
    console.log(`PredictionTreasury  ${ await treasury.getAddress() }`);

    const implementation = await ethers.deployContract('PredictionMarket');
    await implementation.waitForDeployment();
    console.log(`PredictionMarket    ${ await implementation.getAddress() } (implementation)`);

    const factory = await ethers.deployContract('PredictionFactory', [
        deployer.address,
        await treasury.getAddress(),
        await implementation.getAddress(),
        DEFAULT_FEE_BPS,
        DEFAULT_PROTOCOL_SHARE_BPS
    ]);
    await factory.waitForDeployment();
    console.log(`PredictionFactory   ${ await factory.getAddress() }`);

    const deployment = {
        chainId,
        deployedAt: new Date().toISOString(),
        deployer: deployer.address,
        treasury: await treasury.getAddress(),
        marketImplementation: await implementation.getAddress(),
        factory: await factory.getAddress(),
        deployBlock: Number(await ethers.provider.getBlockNumber()),
        defaultFeeBps: DEFAULT_FEE_BPS,
        defaultProtocolFeeShareBps: DEFAULT_PROTOCOL_SHARE_BPS
    };

    const outDir = resolve(HERE, '..', 'deployments');
    mkdirSync(outDir, { recursive: true });
    const outFile = resolve(outDir, `${ chainId }.json`);
    writeFileSync(outFile, `${ JSON.stringify(deployment, null, 4) }\n`);
    console.log(`\nwrote ${ outFile }`);
    console.log('next: npm run seed (markets + trades), then start the indexer + app.');

    await connection.close?.();
}

main().catch((error) =>
{
    console.error(error);
    process.exitCode = 1;
});

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Copies the ABIs out of the Hardhat artifacts for both consumers: the frontend
 * (`application/src/lib/abis/` - wallet writes) and the indexer server
 * (`server/src/chain/abis/` - event decoding + hydration reads). Only the ABI array is
 * emitted - neither needs bytecode.
 *
 * Usage: `npm run export-abis` (after `npm run compile`).
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ARTIFACTS = resolve(HERE, '..', 'artifacts', 'src');
const OUT_DIRS = [
    resolve(HERE, '..', '..', 'application', 'src', 'lib', 'abis'),
    resolve(HERE, '..', '..', 'server', 'src', 'chain', 'abis')
];

/** Contracts whose ABI the clients call. */
const EXPORTS = [
    { artifact: 'PredictionFactory.sol/PredictionFactory.json', out: 'prediction-factory.json' },
    { artifact: 'PredictionMarket.sol/PredictionMarket.json', out: 'prediction-market.json' },
    { artifact: 'PredictionTreasury.sol/PredictionTreasury.json', out: 'prediction-treasury.json' }
];

for (const dir of OUT_DIRS)
{
    mkdirSync(dir, { recursive: true });
    for (const entry of EXPORTS)
    {
        const artifactPath = resolve(ARTIFACTS, entry.artifact);
        const artifact = JSON.parse(readFileSync(artifactPath, 'utf8')) as { abi: unknown[] };
        writeFileSync(resolve(dir, entry.out), `${ JSON.stringify(artifact.abi, null, 4) }\n`);
    }
    console.log(`wrote ${ EXPORTS.length } ABIs to ${ dir }`);
}

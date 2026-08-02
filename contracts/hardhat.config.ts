import 'dotenv/config';
import { defineConfig, configVariable } from 'hardhat/config';
import hardhatToolboxMochaEthers from '@nomicfoundation/hardhat-toolbox-mocha-ethers';

const CHAIN_ID = Number(process.env.CHAIN_ID ?? '9000');

export default defineConfig({
    plugins: [hardhatToolboxMochaEthers],
    solidity: {
        version: '0.8.24',
        settings: {
            // viaIR clears the stack-too-deep the FPMM loops and the struct-heavy
            // createMarket would otherwise hit; the runs count favours markets that trade
            // far more often than they deploy.
            viaIR: true,
            optimizer: { enabled: true, runs: 400 },
            // OpenZeppelin 5.6 uses the Cancun `mcopy` opcode unconditionally, so the whole
            // suite targets Cancun. Modern Cosmos EVM (Cosmos SDK EVM / evmOS) supports it; a
            // Paris-only chain would require pinning OpenZeppelin to 5.0.x instead.
            evmVersion: 'cancun'
        }
    },
    paths: {
        sources: './src',
        tests: './test'
    },
    networks: {
        // In-memory simulated chain for `hardhat test` and `hardhat node`.
        hardhat: { type: 'edr-simulated', chainType: 'l1' },
        // The live Cosmos EVM target; RPC_URL/PRIVATE_KEY come from .env (never committed).
        cosmosEvm: {
            type: 'http',
            chainType: 'l1',
            url: configVariable('RPC_URL'),
            accounts: [configVariable('PRIVATE_KEY')],
            chainId: CHAIN_ID
        }
    }
});

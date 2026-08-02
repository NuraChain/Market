import { expect } from 'chai';
import { describe, it } from 'node:test';

import { ethers, networkHelpers, systemFixture, marketParams, SEED } from './helpers.js';

/** Access control, clone deployment, the status index, and the paginated registry views. */
describe('PredictionFactory', () =>
{
    describe('access control', () =>
    {
        it('grants the deployer both roles and refuses market creation to everyone else', async () =>
        {
            const { factory, admin, alice } = await networkHelpers.loadFixture(systemFixture);
            const params = await marketParams(alice.address);

            expect(await factory.hasRole(await factory.ADMIN_ROLE(), admin.address)).to.equal(true);
            expect(await factory.hasRole(await factory.DEFAULT_ADMIN_ROLE(), admin.address)).to.equal(true);
            expect(await factory.hasRole(await factory.ADMIN_ROLE(), alice.address)).to.equal(false);

            await expect(factory.connect(alice).createMarket(params, { value: SEED }))
                .to.be.revertedWithCustomError(factory, 'AccessControlUnauthorizedAccount');
        });

        it('gates every lifecycle and configuration action behind ADMIN_ROLE', async () =>
        {
            const { factory, admin, alice } = await networkHelpers.loadFixture(systemFixture);
            await factory.createMarket(await marketParams(admin.address), { value: SEED });

            const denied = factory.connect(alice);
            await expect(denied.pauseMarket(0)).to.be.revertedWithCustomError(factory, 'AccessControlUnauthorizedAccount');
            await expect(denied.closeMarket(0)).to.be.revertedWithCustomError(factory, 'AccessControlUnauthorizedAccount');
            await expect(denied.resolveMarket(0, 0)).to.be.revertedWithCustomError(factory, 'AccessControlUnauthorizedAccount');
            await expect(denied.voidMarket(0)).to.be.revertedWithCustomError(factory, 'AccessControlUnauthorizedAccount');
            await expect(denied.setTreasury(alice.address)).to.be.revertedWithCustomError(factory, 'AccessControlUnauthorizedAccount');
            await expect(denied.setDefaultFees(100, 100)).to.be.revertedWithCustomError(factory, 'AccessControlUnauthorizedAccount');
        });

        it('lets the admin delegate ADMIN_ROLE to an operator', async () =>
        {
            const { factory, admin, alice } = await networkHelpers.loadFixture(systemFixture);
            await factory.grantRole(await factory.ADMIN_ROLE(), alice.address);

            await factory.connect(alice).createMarket(await marketParams(admin.address), { value: SEED });
            expect(await factory.marketCount()).to.equal(1n);
        });
    });

    describe('market creation', () =>
    {
        it('deploys a clone, records it, and emits MarketCreated', async () =>
        {
            const { factory, admin } = await networkHelpers.loadFixture(systemFixture);

            await expect(factory.createMarket(await marketParams(admin.address), { value: SEED }))
                .to.emit(factory, 'MarketCreated');

            expect(await factory.marketCount()).to.equal(1n);
            const record = await factory.marketAt(0);
            expect(record.creator).to.equal(admin.address);
            expect(record.category).to.equal('crypto');
            expect(record.status).to.equal(0n);
            expect(record.outcomeCount).to.equal(2n);
            expect(record.market).to.equal(await factory.marketAddress(0));
        });

        it('deploys distinct clones that share the implementation', async () =>
        {
            const { factory, admin } = await networkHelpers.loadFixture(systemFixture);
            await factory.createMarket(await marketParams(admin.address), { value: SEED });
            await factory.createMarket(await marketParams(admin.address, ['A', 'B', 'C']), { value: SEED });

            const first = await factory.marketAddress(0);
            const second = await factory.marketAddress(1);
            expect(first).to.not.equal(second);

            const marketOne = await ethers.getContractAt('PredictionMarket', first);
            const marketTwo = await ethers.getContractAt('PredictionMarket', second);
            expect(await marketOne.outcomeCount()).to.equal(2n);
            expect(await marketTwo.outcomeCount()).to.equal(3n);
            expect(await marketOne.controller()).to.equal(await factory.getAddress());
        });

        it('applies the factory default fees when a market requests zero', async () =>
        {
            const { factory, admin } = await networkHelpers.loadFixture(systemFixture);
            const params = await marketParams(admin.address, ['Yes', 'No'], { feeBps: 0, protocolFeeShareBps: 0 });

            await factory.createMarket(params, { value: SEED });
            const market = await ethers.getContractAt('PredictionMarket', await factory.marketAddress(0));

            expect(await market.feeBps()).to.equal(await factory.defaultFeeBps());
            expect(await market.protocolFeeShareBps()).to.equal(await factory.defaultProtocolFeeShareBps());
        });
    });

    describe('configuration', () =>
    {
        it('updates the treasury for new markets and can re-point an existing one', async () =>
        {
            const { factory, admin, alice } = await networkHelpers.loadFixture(systemFixture);
            await factory.createMarket(await marketParams(admin.address), { value: SEED });
            const market = await ethers.getContractAt('PredictionMarket', await factory.marketAddress(0));
            const original = await factory.treasury();

            const replacement = await ethers.deployContract('PredictionTreasury', [admin.address, alice.address]);
            await expect(factory.setTreasury(await replacement.getAddress())).to.emit(factory, 'TreasuryUpdated');

            expect(await factory.treasury()).to.equal(await replacement.getAddress());
            expect(await market.treasury()).to.equal(original);

            await factory.repointTreasury(0);
            expect(await market.treasury()).to.equal(await replacement.getAddress());
        });

        it('rejects a zero treasury and an out-of-range fee', async () =>
        {
            const { factory } = await networkHelpers.loadFixture(systemFixture);

            await expect(factory.setTreasury(ethers.ZeroAddress)).to.be.revertedWithCustomError(factory, 'ZeroAddress');
            await expect(factory.setDefaultFees(1001, 5000)).to.be.revertedWithCustomError(factory, 'InvalidFee');
            await expect(factory.setDefaultFees(100, 10001)).to.be.revertedWithCustomError(factory, 'InvalidFee');

            await expect(factory.setDefaultFees(300, 4000)).to.emit(factory, 'FeesUpdated');
            expect(await factory.defaultFeeBps()).to.equal(300n);
        });
    });

    describe('registry and pagination', () =>
    {
        /** Six markets so paging has something to slice. */
        async function sixMarketsFixture()
        {
            const system = await systemFixture();
            for (let i = 0; i < 6; i++)
            {
                await system.factory.createMarket(await marketParams(system.admin.address), { value: SEED });
            }
            return system;
        }

        it('pages through every market and clamps a partial final page', async () =>
        {
            const { factory } = await networkHelpers.loadFixture(sixMarketsFixture);

            expect((await factory.marketsPaged(0, 4)).length).to.equal(4);
            expect((await factory.marketsPaged(4, 4)).length).to.equal(2);
            expect((await factory.marketsPaged(6, 4)).length).to.equal(0);
            expect((await factory.marketsPaged(99, 10)).length).to.equal(0);
        });

        it('moves a market between the status buckets as its lifecycle advances', async () =>
        {
            const { factory } = await networkHelpers.loadFixture(sixMarketsFixture);

            expect(await factory.countByStatus(0)).to.equal(6n); // Open
            expect((await factory.activeMarkets(0, 10)).length).to.equal(6);

            await factory.pauseMarket(0);
            await factory.closeMarket(1);
            await factory.resolveMarket(2, 0);
            await factory.voidMarket(3);

            expect(await factory.countByStatus(0)).to.equal(2n); // Open
            expect(await factory.countByStatus(1)).to.equal(1n); // Paused
            expect(await factory.countByStatus(2)).to.equal(1n); // Closed
            expect(await factory.countByStatus(3)).to.equal(1n); // Resolved
            expect(await factory.countByStatus(4)).to.equal(1n); // Voided

            expect((await factory.activeMarkets(0, 10)).length).to.equal(2);
            expect((await factory.closedMarkets(0, 10)).length).to.equal(1);
            expect((await factory.resolvedMarkets(0, 10)).length).to.equal(1);

            const resolved = await factory.resolvedMarkets(0, 10);
            expect(resolved[0].market).to.equal(await factory.marketAddress(2));
            expect((await factory.marketAt(2)).status).to.equal(3n);
        });

        it('returns a market to the active bucket after an unpause', async () =>
        {
            const { factory } = await networkHelpers.loadFixture(sixMarketsFixture);
            await factory.pauseMarket(0);
            expect(await factory.countByStatus(0)).to.equal(5n);

            await factory.unpauseMarket(0);
            expect(await factory.countByStatus(0)).to.equal(6n);
            expect(await factory.countByStatus(1)).to.equal(0n);
        });

        it('pages a filtered bucket independently of market ids', async () =>
        {
            const { factory } = await networkHelpers.loadFixture(sixMarketsFixture);
            await factory.closeMarket(1);
            await factory.closeMarket(3);
            await factory.closeMarket(5);

            expect((await factory.closedMarkets(0, 2)).length).to.equal(2);
            expect((await factory.closedMarkets(2, 2)).length).to.equal(1);
            expect((await factory.closedMarkets(3, 2)).length).to.equal(0);
        });
    });
});

import { expect } from 'chai';
import { describe, it } from 'node:test';

import {
    ethers,
    networkHelpers,
    binaryMarketFixture,
    threeWayMarketFixture,
    LP_TOKEN_ID,
    NO_DEADLINE,
    assertSolvent
} from './helpers.js';

/** Whole-lifecycle runs: many traders, fees, resolution, and everybody cashing out. */
describe('integration', () =>
{
    it('runs a full binary market end to end and stays solvent throughout', async () =>
    {
        const { market, factory, treasury, admin, alice, bob, carol } =
            await networkHelpers.loadFixture(binaryMarketFixture);

        // Three traders take sides.
        await market.connect(alice).buy(0, 0, NO_DEADLINE, { value: ethers.parseEther('20') });
        await assertSolvent(market);
        await market.connect(bob).buy(1, 0, NO_DEADLINE, { value: ethers.parseEther('35') });
        await assertSolvent(market);
        await market.connect(carol).buy(0, 0, NO_DEADLINE, { value: ethers.parseEther('15') });
        await assertSolvent(market);

        // Someone exits early.
        await market.connect(alice).sell(0, ethers.parseEther('5'), ethers.MaxUint256, NO_DEADLINE);
        await assertSolvent(market);

        // A second LP joins, then the market locks and resolves.
        await market.connect(carol).addFunding(0, { value: ethers.parseEther('25') });
        await assertSolvent(market);

        const feesBefore = await treasury.collectedFor(await market.getAddress());
        expect(feesBefore).to.be.greaterThan(0n);

        await factory.resolveMarket(0, 0);
        expect(await market.status()).to.equal(3n);
        expect(await market.winningOutcome()).to.equal(0n);

        // Winners cash out 1:1.
        const aliceShares: bigint = await market.balanceOf(alice.address, 0);
        const beforeAlice = await ethers.provider.getBalance(alice.address);
        const tx = await market.connect(alice).redeem();
        const receipt = await tx.wait();
        expect(await ethers.provider.getBalance(alice.address))
            .to.equal(beforeAlice + aliceShares - receipt!.gasUsed * receipt!.gasPrice);

        await market.connect(carol).redeem();
        await assertSolvent(market);

        // The loser has nothing to claim.
        await expect(market.connect(bob).redeem()).to.be.revertedWithCustomError(market, 'NothingToClaim');

        // LPs withdraw their basket; the winning leg is still redeemable.
        for (const provider of [admin, carol])
        {
            const lp: bigint = await market.balanceOf(provider.address, LP_TOKEN_ID);
            if (lp > 0n)
            {
                await market.connect(provider).removeFunding(lp);
                if ((await market.balanceOf(provider.address, 0)) > 0n)
                {
                    await market.connect(provider).redeem();
                }
            }
        }

        // Every payout was covered: the contract never went below its own accounting.
        expect(await ethers.provider.getBalance(await market.getAddress())).to.equal(await market.totalSets());
    });

    it('never pays out more than the collateral taken in', async () =>
    {
        const { market, factory, admin, alice, bob, carol, treasury } =
            await networkHelpers.loadFixture(threeWayMarketFixture);
        const marketAddress = await market.getAddress();

        const seed = ethers.parseEther('100');
        const spends = [ethers.parseEther('30'), ethers.parseEther('12'), ethers.parseEther('45')];
        await market.connect(alice).buy(0, 0, NO_DEADLINE, { value: spends[0] });
        await market.connect(bob).buy(1, 0, NO_DEADLINE, { value: spends[1] });
        await market.connect(carol).buy(2, 0, NO_DEADLINE, { value: spends[2] });

        const totalIn = seed + spends[0] + spends[1] + spends[2];

        await factory.resolveMarket(0, 2);

        // Everyone who can redeem, does; every LP unwinds.
        for (const account of [alice, bob, carol])
        {
            if ((await market.balanceOf(account.address, 2)) > 0n)
            {
                await market.connect(account).redeem();
            }
        }
        const lp: bigint = await market.balanceOf(admin.address, LP_TOKEN_ID);
        await market.connect(admin).removeFunding(lp);
        if ((await market.balanceOf(admin.address, 2)) > 0n)
        {
            await market.connect(admin).redeem();
        }

        const feeTaken: bigint = await treasury.collectedFor(marketAddress);
        const left = await ethers.provider.getBalance(marketAddress);

        // Collateral is conserved: nothing was minted from thin air.
        expect(feeTaken + left).to.be.lessThanOrEqual(totalIn);
        expect(left).to.equal(await market.totalSets());
    });

    it('a voided market returns every trader their proportional refund', async () =>
    {
        const { market, factory, alice, bob } = await networkHelpers.loadFixture(binaryMarketFixture);

        await market.connect(alice).buy(0, 0, NO_DEADLINE, { value: ethers.parseEther('10') });
        await market.connect(bob).buy(1, 0, NO_DEADLINE, { value: ethers.parseEther('10') });

        await factory.voidMarket(0);
        expect(await market.status()).to.equal(4n);

        for (const account of [alice, bob])
        {
            const before = await ethers.provider.getBalance(account.address);
            const tx = await market.connect(account).redeem();
            const receipt = await tx.wait();
            const after = await ethers.provider.getBalance(account.address);
            expect(after + receipt!.gasUsed * receipt!.gasPrice).to.be.greaterThan(before);
        }
        await assertSolvent(market);
    });

    it('two markets on one factory keep separate books', async () =>
    {
        const { factory, admin, alice, treasury } = await networkHelpers.loadFixture(binaryMarketFixture);
        const { marketParams } = await import('./helpers.js');
        await factory.createMarket(await marketParams(admin.address, ['A', 'B', 'C']), {
            value: ethers.parseEther('100')
        });

        const first = await ethers.getContractAt('PredictionMarket', await factory.marketAddress(0));
        const second = await ethers.getContractAt('PredictionMarket', await factory.marketAddress(1));

        await first.connect(alice).buy(0, 0, NO_DEADLINE, { value: ethers.parseEther('10') });

        expect(await first.balanceOf(alice.address, 0)).to.be.greaterThan(0n);
        expect(await second.balanceOf(alice.address, 0)).to.equal(0n);
        expect(await treasury.collectedFor(await first.getAddress())).to.be.greaterThan(0n);
        expect(await treasury.collectedFor(await second.getAddress())).to.equal(0n);

        // Resolving one leaves the other trading.
        await factory.resolveMarket(0, 0);
        expect(await first.status()).to.equal(3n);
        expect(await second.status()).to.equal(0n);
        await second.connect(alice).buy(1, 0, NO_DEADLINE, { value: ethers.parseEther('5') });
    });
});

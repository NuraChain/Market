import { expect } from 'chai';
import { describe, it } from 'node:test';

import {
    ethers,
    networkHelpers,
    deployMarket,
    binaryMarketFixture,
    threeWayMarketFixture,
    marketParams,
    LP_TOKEN_ID,
    SEED,
    NO_DEADLINE,
    assertSolvent
} from './helpers.js';

/** Trading, liquidity, guards, and redemption on a single market clone. */
describe('PredictionMarket', () =>
{
    describe('initialization', () =>
    {
        it('records metadata, seeds equal reserves, and mints LP shares to the creator', async () =>
        {
            const { market, admin, params } = await networkHelpers.loadFixture(binaryMarketFixture);

            expect(await market.title()).to.equal(params.title);
            expect(await market.category()).to.equal('crypto');
            expect(await market.creator()).to.equal(admin.address);
            expect(await market.outcomeCount()).to.equal(2n);
            expect(await market.outcomeName(0)).to.equal('Yes');
            expect(await market.status()).to.equal(0n); // Open

            const reserves: bigint[] = await market.getReserves();
            expect(reserves[0]).to.equal(SEED);
            expect(reserves[1]).to.equal(SEED);
            expect(await market.balanceOf(admin.address, LP_TOKEN_ID)).to.equal(SEED);
            await assertSolvent(market);
        });

        it('cannot be initialized twice, and the implementation itself is locked', async () =>
        {
            const { market, implementation, admin, treasury } = await networkHelpers.loadFixture(binaryMarketFixture);
            const params = await marketParams(admin.address);

            await expect(
                market.initialize(admin.address, await treasury.getAddress(), params, { value: 1n })
            ).to.be.revertedWithCustomError(market, 'InvalidInitialization');

            await expect(
                implementation.initialize(admin.address, await treasury.getAddress(), params, { value: 1n })
            ).to.be.revertedWithCustomError(implementation, 'InvalidInitialization');
        });
    });

    describe('buying', () =>
    {
        it('mints shares, emits PredictionPlaced, and keeps the market solvent', async () =>
        {
            const { market, alice } = await networkHelpers.loadFixture(binaryMarketFixture);
            const spend = ethers.parseEther('10');

            await expect(market.connect(alice).buy(0, 0, NO_DEADLINE, { value: spend }))
                .to.emit(market, 'PredictionPlaced');

            expect(await market.balanceOf(alice.address, 0)).to.be.greaterThan(0n);
            await assertSolvent(market);
        });

        it('honours the slippage bound', async () =>
        {
            const { market, alice } = await networkHelpers.loadFixture(binaryMarketFixture);
            const spend = ethers.parseEther('10');
            const quoted: bigint = await market.calcBuy(0, spend);

            await expect(
                market.connect(alice).buy(0, quoted + 1n, NO_DEADLINE, { value: spend })
            ).to.be.revertedWithCustomError(market, 'SlippageExceeded');
        });

        it('honours the deadline', async () =>
        {
            const { market, alice } = await networkHelpers.loadFixture(binaryMarketFixture);
            const past = BigInt(await networkHelpers.time.latest()) - 1n;

            await expect(
                market.connect(alice).buy(0, 0, past, { value: ethers.parseEther('1') })
            ).to.be.revertedWithCustomError(market, 'DeadlineExpired');
        });

        it('rejects an unknown outcome and a zero amount', async () =>
        {
            const { market, alice } = await networkHelpers.loadFixture(binaryMarketFixture);

            await expect(
                market.connect(alice).buy(9, 0, NO_DEADLINE, { value: ethers.parseEther('1') })
            ).to.be.revertedWithCustomError(market, 'InvalidOutcome');

            await expect(
                market.connect(alice).buy(0, 0, NO_DEADLINE, { value: 0 })
            ).to.be.revertedWithCustomError(market, 'ZeroAmount');
        });

        it('refuses to trade after lockTime', async () =>
        {
            const { market, alice } = await networkHelpers.loadFixture(binaryMarketFixture);
            await networkHelpers.time.increaseTo((await market.lockTime()) + 1n);

            await expect(
                market.connect(alice).buy(0, 0, NO_DEADLINE, { value: ethers.parseEther('1') })
            ).to.be.revertedWithCustomError(market, 'TradingLocked');
        });
    });

    describe('selling', () =>
    {
        it('burns shares, pays collateral, and stays solvent', async () =>
        {
            const { market, alice } = await networkHelpers.loadFixture(binaryMarketFixture);
            await market.connect(alice).buy(0, 0, NO_DEADLINE, { value: ethers.parseEther('10') });

            const want = ethers.parseEther('5');
            const before = await ethers.provider.getBalance(alice.address);
            const sharesBefore: bigint = await market.balanceOf(alice.address, 0);

            const tx = await market.connect(alice).sell(0, want, ethers.MaxUint256, NO_DEADLINE);
            const receipt = await tx.wait();
            const gas = receipt!.gasUsed * receipt!.gasPrice;

            expect(await ethers.provider.getBalance(alice.address)).to.equal(before + want - gas);
            expect(await market.balanceOf(alice.address, 0)).to.be.lessThan(sharesBefore);
            await assertSolvent(market);
        });

        it('honours the max-shares slippage bound', async () =>
        {
            const { market, alice } = await networkHelpers.loadFixture(binaryMarketFixture);
            await market.connect(alice).buy(0, 0, NO_DEADLINE, { value: ethers.parseEther('10') });

            const want = ethers.parseEther('5');
            const needed: bigint = await market.calcSell(0, want);

            await expect(
                market.connect(alice).sell(0, want, needed - 1n, NO_DEADLINE)
            ).to.be.revertedWithCustomError(market, 'SlippageExceeded');
        });
    });

    describe('liquidity', () =>
    {
        it('adds funding at the current price and mints proportional LP shares', async () =>
        {
            const { market, alice } = await networkHelpers.loadFixture(binaryMarketFixture);

            await expect(market.connect(alice).addFunding(0, { value: SEED }))
                .to.emit(market, 'LiquidityAdded');

            // Same size as the seed at an unmoved price: the LP position matches the creator's.
            expect(await market.balanceOf(alice.address, LP_TOKEN_ID)).to.equal(SEED);
            await assertSolvent(market);
        });

        it('returns the skew as outcome shares when funding a moved market', async () =>
        {
            const { market, alice, bob } = await networkHelpers.loadFixture(binaryMarketFixture);
            await market.connect(alice).buy(0, 0, NO_DEADLINE, { value: ethers.parseEther('30') });

            await market.connect(bob).addFunding(0, { value: ethers.parseEther('10') });

            // The cheaper outcome is over-supplied, so the funder is handed the difference.
            const zero: bigint = await market.balanceOf(bob.address, 0);
            const one: bigint = await market.balanceOf(bob.address, 1);
            expect(zero + one).to.be.greaterThan(0n);
            expect(await market.balanceOf(bob.address, LP_TOKEN_ID)).to.be.greaterThan(0n);
            await assertSolvent(market);
        });

        it('removes funding, returning a basket of outcome shares', async () =>
        {
            const { market, admin } = await networkHelpers.loadFixture(binaryMarketFixture);
            const lp: bigint = await market.balanceOf(admin.address, LP_TOKEN_ID);

            await expect(market.connect(admin).removeFunding(lp / 2n))
                .to.emit(market, 'LiquidityRemoved');

            expect(await market.balanceOf(admin.address, LP_TOKEN_ID)).to.equal(lp - lp / 2n);
            expect(await market.balanceOf(admin.address, 0)).to.be.greaterThan(0n);
            expect(await market.balanceOf(admin.address, 1)).to.be.greaterThan(0n);
            await assertSolvent(market);
        });

        it('merges a complete set back into collateral', async () =>
        {
            const { market, admin } = await networkHelpers.loadFixture(binaryMarketFixture);
            const lp: bigint = await market.balanceOf(admin.address, LP_TOKEN_ID);
            await market.connect(admin).removeFunding(lp);

            const zero: bigint = await market.balanceOf(admin.address, 0);
            const one: bigint = await market.balanceOf(admin.address, 1);
            const set = zero < one ? zero : one;

            await market.connect(admin).mergeSets(set);
            expect(await market.balanceOf(admin.address, 0)).to.equal(zero - set);
            await assertSolvent(market);
        });
    });

    describe('resolution and redemption', () =>
    {
        it('pays winning shares 1:1 and refuses a second claim', async () =>
        {
            const { market, factory, alice } = await networkHelpers.loadFixture(binaryMarketFixture);
            await market.connect(alice).buy(0, 0, NO_DEADLINE, { value: ethers.parseEther('10') });
            const shares: bigint = await market.balanceOf(alice.address, 0);

            await factory.resolveMarket(0, 0);

            const before = await ethers.provider.getBalance(alice.address);
            const tx = await market.connect(alice).redeem();
            const receipt = await tx.wait();
            const gas = receipt!.gasUsed * receipt!.gasPrice;

            expect(await ethers.provider.getBalance(alice.address)).to.equal(before + shares - gas);
            expect(await market.balanceOf(alice.address, 0)).to.equal(0n);

            await expect(market.connect(alice).redeem()).to.be.revertedWithCustomError(market, 'NothingToClaim');
        });

        it('pays nothing to a loser', async () =>
        {
            const { market, factory, alice } = await networkHelpers.loadFixture(binaryMarketFixture);
            await market.connect(alice).buy(1, 0, NO_DEADLINE, { value: ethers.parseEther('10') });

            await factory.resolveMarket(0, 0);

            await expect(market.connect(alice).redeem()).to.be.revertedWithCustomError(market, 'NothingToClaim');
        });

        it('refuses redemption before resolution', async () =>
        {
            const { market, alice } = await networkHelpers.loadFixture(binaryMarketFixture);
            await market.connect(alice).buy(0, 0, NO_DEADLINE, { value: ethers.parseEther('1') });

            await expect(market.connect(alice).redeem()).to.be.revertedWithCustomError(market, 'MarketNotResolved');
        });

        it('a voided market refunds every outcome at 1/n', async () =>
        {
            const { market, factory, alice } = await networkHelpers.loadFixture(threeWayMarketFixture);
            await market.connect(alice).buy(0, 0, NO_DEADLINE, { value: ethers.parseEther('9') });
            const held: bigint = await market.balanceOf(alice.address, 0);

            await factory.voidMarket(0);

            const before = await ethers.provider.getBalance(alice.address);
            const tx = await market.connect(alice).redeem();
            const receipt = await tx.wait();
            const gas = receipt!.gasUsed * receipt!.gasPrice;

            expect(await ethers.provider.getBalance(alice.address)).to.equal(before + held / 3n - gas);
        });

        it('keeps every winner whole when the whole book redeems', async () =>
        {
            const { market, factory, admin, alice, bob } = await networkHelpers.loadFixture(binaryMarketFixture);
            await market.connect(alice).buy(0, 0, NO_DEADLINE, { value: ethers.parseEther('25') });
            await market.connect(bob).buy(1, 0, NO_DEADLINE, { value: ethers.parseEther('40') });

            await factory.resolveMarket(0, 0);

            const aliceShares: bigint = await market.balanceOf(alice.address, 0);
            await market.connect(alice).redeem();

            // The LP also holds winning shares through their basket; both can be paid.
            const lp: bigint = await market.balanceOf(admin.address, LP_TOKEN_ID);
            await market.connect(admin).removeFunding(lp);
            const adminShares: bigint = await market.balanceOf(admin.address, 0);
            if (adminShares > 0n)
            {
                await market.connect(admin).redeem();
            }

            expect(aliceShares).to.be.greaterThan(0n);
            expect(await ethers.provider.getBalance(await market.getAddress())).to.equal(await market.totalSets());
        });
    });

    describe('reentrancy', () =>
    {
        it('blocks a reentrant redeem from the payout callback', async () =>
        {
            const { market, factory } = await networkHelpers.loadFixture(binaryMarketFixture);
            const attacker = await ethers.deployContract('ReentrantBuyer', [await market.getAddress()]);

            await attacker.attackBuy(0, { value: ethers.parseEther('10') });
            await factory.resolveMarket(0, 0);

            await attacker.attackRedeem();

            // The nested call must have failed; the attacker holds no shares and got paid once.
            expect(await attacker.reenteredSuccessfully()).to.equal(false);
            expect(await market.balanceOf(await attacker.getAddress(), 0)).to.equal(0n);
            await assertSolvent(market);
        });
    });

    describe('lifecycle guards', () =>
    {
        it('rejects lifecycle calls from anyone but the controller', async () =>
        {
            const { market, alice } = await networkHelpers.loadFixture(binaryMarketFixture);

            await expect(market.connect(alice).pause()).to.be.revertedWithCustomError(market, 'NotController');
            await expect(market.connect(alice).close()).to.be.revertedWithCustomError(market, 'NotController');
            await expect(market.connect(alice).resolve(0)).to.be.revertedWithCustomError(market, 'NotController');
            await expect(market.connect(alice).voidMarket()).to.be.revertedWithCustomError(market, 'NotController');
        });

        it('blocks trading while paused and resumes after unpause', async () =>
        {
            const { market, factory, alice } = await networkHelpers.loadFixture(binaryMarketFixture);
            await factory.pauseMarket(0);

            await expect(
                market.connect(alice).buy(0, 0, NO_DEADLINE, { value: ethers.parseEther('1') })
            ).to.be.revertedWithCustomError(market, 'MarketNotOpen');

            await factory.unpauseMarket(0);
            await market.connect(alice).buy(0, 0, NO_DEADLINE, { value: ethers.parseEther('1') });
            expect(await market.balanceOf(alice.address, 0)).to.be.greaterThan(0n);
        });

        it('refuses to resolve twice or resolve to an unknown outcome', async () =>
        {
            const { factory, market } = await networkHelpers.loadFixture(binaryMarketFixture);

            await expect(factory.resolveMarket(0, 5)).to.be.revertedWithCustomError(market, 'InvalidOutcome');

            await factory.resolveMarket(0, 1);
            await expect(factory.resolveMarket(0, 0)).to.be.revertedWithCustomError(market, 'MarketAlreadyEnded');
        });
    });

    describe('creation validation', () =>
    {
        it('rejects bad outcome counts, timings, fees, and an unseeded market', async () =>
        {
            const { factory, admin, implementation } = await networkHelpers.loadFixture(binaryMarketFixture);

            const one = await marketParams(admin.address, ['Only']);
            await expect(factory.createMarket(one, { value: SEED }))
                .to.be.revertedWithCustomError(implementation, 'InvalidOutcomeCount');

            const tooMany = await marketParams(admin.address, Array.from({ length: 17 }, (_v, i) => `O${ i }`));
            await expect(factory.createMarket(tooMany, { value: SEED }))
                .to.be.revertedWithCustomError(implementation, 'InvalidOutcomeCount');

            const now = BigInt(await networkHelpers.time.latest());
            const badTiming = await marketParams(admin.address, ['Yes', 'No'], {
                lockTime: now + 100n,
                resolveTime: now + 50n
            });
            await expect(factory.createMarket(badTiming, { value: SEED }))
                .to.be.revertedWithCustomError(implementation, 'InvalidTiming');

            const highFee = await marketParams(admin.address, ['Yes', 'No'], { feeBps: 5000 });
            await expect(factory.createMarket(highFee, { value: SEED }))
                .to.be.revertedWithCustomError(implementation, 'InvalidFee');

            const ok = await marketParams(admin.address);
            await expect(factory.createMarket(ok, { value: 0 }))
                .to.be.revertedWithCustomError(implementation, 'ZeroAmount');
        });

        it('supports a 16-outcome market', async () =>
        {
            const names = Array.from({ length: 16 }, (_v, i) => `Outcome ${ i }`);
            const { market } = await deployMarket(names);

            expect(await market.outcomeCount()).to.equal(16n);
            const prices: bigint[] = await market.getPrices();
            const sum = prices.reduce((total, price) => total + price, 0n);
            expect(sum).to.be.closeTo(ethers.parseEther('1'), 10000n);
        });
    });
});

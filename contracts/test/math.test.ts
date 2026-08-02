import { expect } from 'chai';
import { describe, it } from 'node:test';

import {
    ethers,
    networkHelpers,
    binaryMarketFixture,
    threeWayMarketFixture,
    fourWayMarketFixture,
    SEED,
    NO_DEADLINE,
    assertSolvent
} from './helpers.js';

/**
 * The FPMM pricing surface. These assert the properties the formula must have - prices sum to
 * one, buying moves the bought outcome up, a round trip never profits - rather than restating
 * the implementation's arithmetic.
 */
describe('MarketMath / FPMM pricing', () =>
{
    it('opens a binary market at 50/50 and keeps prices summing to 1e18', async () =>
    {
        const { market } = await networkHelpers.loadFixture(binaryMarketFixture);
        const prices: bigint[] = await market.getPrices();

        expect(prices.length).to.equal(2);
        expect(prices[0]).to.equal(ethers.parseEther('0.5'));
        expect(prices[1]).to.equal(ethers.parseEther('0.5'));
        expect(prices[0] + prices[1]).to.equal(ethers.parseEther('1'));
    });

    it('opens an n-way market at 1/n each', async () =>
    {
        const { market } = await networkHelpers.loadFixture(fourWayMarketFixture);
        const prices: bigint[] = await market.getPrices();
        const sum = prices.reduce((total, price) => total + price, 0n);

        expect(prices.length).to.equal(4);
        for (const price of prices)
        {
            // 1/4 within rounding dust.
            expect(price).to.be.closeTo(ethers.parseEther('0.25'), 10n);
        }
        expect(sum).to.be.closeTo(ethers.parseEther('1'), 100n);
    });

    it('buying an outcome raises its price and lowers the others, still summing to 1', async () =>
    {
        const { market, alice } = await networkHelpers.loadFixture(threeWayMarketFixture);

        await market.connect(alice).buy(0, 0, NO_DEADLINE, { value: ethers.parseEther('20') });
        const prices: bigint[] = await market.getPrices();
        const sum = prices.reduce((total, price) => total + price, 0n);

        expect(prices[0]).to.be.greaterThan(ethers.parseEther('0.34'));
        expect(prices[1]).to.be.lessThan(ethers.parseEther('0.33'));
        expect(prices[2]).to.be.lessThan(ethers.parseEther('0.33'));
        expect(sum).to.be.closeTo(ethers.parseEther('1'), 1000n);
    });

    it('a buy of x always returns more than x shares (price < 1) and calcBuy matches execution', async () =>
    {
        const { market, alice } = await networkHelpers.loadFixture(binaryMarketFixture);
        const spend = ethers.parseEther('10');

        const quoted: bigint = await market.calcBuy(0, spend);
        await market.connect(alice).buy(0, 0, NO_DEADLINE, { value: spend });
        const held: bigint = await market.balanceOf(alice.address, 0);

        expect(held).to.equal(quoted);
        expect(held).to.be.greaterThan(spend);
    });

    it('splitting a trade is never worse than doing it at once', async () =>
    {
        const small = await networkHelpers.loadFixture(binaryMarketFixture);
        const half = ethers.parseEther('10');

        await small.market.connect(small.alice).buy(0, 0, NO_DEADLINE, { value: half });
        await small.market.connect(small.alice).buy(0, 0, NO_DEADLINE, { value: half });
        const viaTwo: bigint = await small.market.balanceOf(small.alice.address, 0);

        // A fresh market for the single large trade (fixtures snapshot, so state is clean).
        const large = await deployFreshBinary();
        await large.market.connect(large.alice).buy(0, 0, NO_DEADLINE, { value: half * 2n });
        const viaOne: bigint = await large.market.balanceOf(large.alice.address, 0);

        expect(viaTwo).to.be.greaterThanOrEqual(viaOne);
    });

    it('a buy/sell round trip never returns more collateral than it cost', async () =>
    {
        const { market, alice } = await networkHelpers.loadFixture(binaryMarketFixture);
        const spend = ethers.parseEther('10');

        await market.connect(alice).buy(0, 0, NO_DEADLINE, { value: spend });
        const held: bigint = await market.balanceOf(alice.address, 0);

        // Ask for the full amount back: it must cost more shares than were bought.
        const needed: bigint = await market.calcSell(0, spend);
        expect(needed).to.be.greaterThan(held);
        await assertSolvent(market);
    });

    it('reverts a sell the pool cannot service', async () =>
    {
        const { market } = await networkHelpers.loadFixture(binaryMarketFixture);
        await expect(market.calcSell(0, SEED * 2n)).to.be.revertedWithCustomError(market, 'InsufficientLiquidity');
    });
});

/** A market deployed outside the fixture snapshot, for comparisons against a fixture market. */
async function deployFreshBinary()
{
    const { deployMarket } = await import('./helpers.js');
    return deployMarket();
}

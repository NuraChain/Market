import { expect } from 'chai';
import { describe, it } from 'node:test';

import { ethers, networkHelpers, systemFixture, binaryMarketFixture, NO_DEADLINE } from './helpers.js';

/** Fee accounting, withdrawal, recipient management, and two-step ownership. */
describe('PredictionTreasury', () =>
{
    it('records a deposit against its market and emits FeeCollected', async () =>
    {
        const { treasury, alice } = await networkHelpers.loadFixture(systemFixture);
        const market = alice.address;
        const amount = ethers.parseEther('1');

        await expect(treasury.depositFee(market, { value: amount }))
            .to.emit(treasury, 'FeeCollected')
            .withArgs(market, amount);

        expect(await treasury.totalCollected()).to.equal(amount);
        expect(await treasury.collectedFor(market)).to.equal(amount);
    });

    it('attributes a bare native transfer to the sender', async () =>
    {
        const { treasury, alice } = await networkHelpers.loadFixture(systemFixture);
        const amount = ethers.parseEther('0.5');

        await alice.sendTransaction({ to: await treasury.getAddress(), value: amount });

        expect(await treasury.totalCollected()).to.equal(amount);
        expect(await treasury.collectedFor(alice.address)).to.equal(amount);
    });

    it('rejects a zero-value deposit', async () =>
    {
        const { treasury, alice } = await networkHelpers.loadFixture(systemFixture);
        await expect(treasury.depositFee(alice.address, { value: 0 }))
            .to.be.revertedWithCustomError(treasury, 'ZeroAmount');
    });

    it('withdraws to the fee recipient and refuses to overdraw', async () =>
    {
        const { treasury, admin, alice, feeRecipient } = await networkHelpers.loadFixture(systemFixture);
        const amount = ethers.parseEther('2');
        await treasury.depositFee(alice.address, { value: amount });

        const before = await ethers.provider.getBalance(feeRecipient.address);
        await expect(treasury.connect(admin).withdraw(amount))
            .to.emit(treasury, 'FeeWithdrawn')
            .withArgs(feeRecipient.address, amount);

        expect(await ethers.provider.getBalance(feeRecipient.address)).to.equal(before + amount);
        await expect(treasury.connect(admin).withdraw(1n))
            .to.be.revertedWithCustomError(treasury, 'InsufficientLiquidity');
    });

    it('lets only the owner withdraw or change the recipient', async () =>
    {
        const { treasury, alice } = await networkHelpers.loadFixture(systemFixture);
        await treasury.depositFee(alice.address, { value: ethers.parseEther('1') });

        await expect(treasury.connect(alice).withdraw(1n))
            .to.be.revertedWithCustomError(treasury, 'OwnableUnauthorizedAccount');
        await expect(treasury.connect(alice).setFeeRecipient(alice.address))
            .to.be.revertedWithCustomError(treasury, 'OwnableUnauthorizedAccount');
    });

    it('changes the fee recipient and pays the new one', async () =>
    {
        const { treasury, admin, alice, bob } = await networkHelpers.loadFixture(systemFixture);
        await treasury.depositFee(alice.address, { value: ethers.parseEther('1') });

        await expect(treasury.connect(admin).setFeeRecipient(bob.address))
            .to.emit(treasury, 'FeeRecipientChanged')
            .withArgs(bob.address);
        await expect(treasury.connect(admin).setFeeRecipient(ethers.ZeroAddress))
            .to.be.revertedWithCustomError(treasury, 'ZeroAddress');

        const before = await ethers.provider.getBalance(bob.address);
        await treasury.connect(admin).withdraw(ethers.parseEther('1'));
        expect(await ethers.provider.getBalance(bob.address)).to.equal(before + ethers.parseEther('1'));
    });

    it('transfers ownership in two steps', async () =>
    {
        const { treasury, admin, alice } = await networkHelpers.loadFixture(systemFixture);

        await treasury.connect(admin).transferOwnership(alice.address);
        // Still the old owner until the handover is accepted.
        expect(await treasury.owner()).to.equal(admin.address);
        expect(await treasury.pendingOwner()).to.equal(alice.address);

        await treasury.connect(alice).acceptOwnership();
        expect(await treasury.owner()).to.equal(alice.address);
    });

    it('receives the protocol cut of a real trade', async () =>
    {
        const { market, treasury, alice } = await networkHelpers.loadFixture(binaryMarketFixture);
        const spend = ethers.parseEther('10');
        const marketAddress = await market.getAddress();

        // 2% fee, half to the protocol => 1% of the trade.
        await market.connect(alice).buy(0, 0, NO_DEADLINE, { value: spend });

        const expected = (spend * 200n) / 10000n / 2n;
        expect(await treasury.collectedFor(marketAddress)).to.equal(expected);
        expect(await ethers.provider.getBalance(await treasury.getAddress())).to.equal(expected);
    });
});

const { ether, BN } = require('openzeppelin-test-helpers');

const SminemToken = artifacts.require('SminemERC20');

contract('SminemToken', async function (accounts) {
    // constructor params
    const name = "SminemERC20";
    const symbol = "SMNM";
    const decimals = 9;

    const toBNWithDecimals = (v) => new BN(v * Math.pow(10, decimals))
    const toBNWithoutDecimals = (v) => new BN(Math.floor(v / Math.pow(10, decimals)))

    const totalSupply = toBNWithDecimals(100000);

    let expectThrow = async (promise) => {
        try {
            await promise;
        } catch (error) {
            const invalidOpcode = error.message.search('invalid opcode') >= 0;
            const outOfGas = error.message.search('out of gas') >= 0;
            const revert = error.message.search('revert') >= 0;
            assert(
                invalidOpcode || outOfGas || revert,
                "Expected throw, got '" + error + "' instead",
            );
            return;
        }
        assert.fail('Expected throw not received');
    };

    // env params
    const account1 = accounts[0];
    const account2 = accounts[1];
    const account3 = accounts[2];
    const owner = accounts[3];

    let tokenInst;

    before("preparing env", async() => {
        await expectThrow(
            SminemToken.new("", symbol, decimals, 1, {from: owner})
        );
        await expectThrow(
            SminemToken.new(name, "", decimals, 1, {from: owner})
        );
        await expectThrow(
            SminemToken.new(name, symbol, 0, 1, {from: owner})
        );
        tokenInst = await SminemToken.new(
            name,
            symbol,
            decimals,
            toBNWithoutDecimals(totalSupply),
            {from: owner}
        );
        let ownerBalance = await tokenInst.balanceOf(owner);
        assert.equal(ownerBalance.toString(), totalSupply.toString());
    });

    it("", async() => {

    })
    /*

    it('should transfer tokens correctly between three accounts', async function() {
        let tokensToSend = new BN(d(50000, 9));
        let tokensToReceive = tokensToSend.mul(new BN(98)).div(new BN(100)); // 98%
        let totalSupplyBefore = await token.totalSupply();
        let balance1before = await token.balanceOf(account1);
        let balance2before = await token.balanceOf(account2);
        let balance3before = await token.balanceOf(account3);
        await token.transfer(account2, tokensToSend, { from: account1 });
        let totalSupplyAfter = await token.totalSupply();
        let balance1after = await token.balanceOf(account1);
        let balance2after = await token.balanceOf(account2);
        let balance3after = await token.balanceOf(account3);
        let diff1 = balance1after.add(tokensToSend).sub(balance1before);
        let diff2 = balance2after.sub(balance2before).sub(tokensToReceive);
        let diff3 = balance3after.sub(balance3before);
        let ratio1 = balance1after.div(diff1);
        //let ratio2 = balance2after.div(diff2);
        //let ratio3 = balance3after.div(diff3);
        //expect(ratio1).to.be.bignumber.equal(ratio2);
        //expect(ratio2).to.be.bignumber.equal(ratio3);
        log('------------');
        log('BEFORE');
        log('total:\t\t' + totalSupplyBefore.toString());
        log('balance1:\t' + balance1before.toString());
        log('balance2:\t' + balance2before.toString());
        log('balance3:\t' + balance3before.toString());
        log('------------');
        log('AFTER');
        log('total:\t\t' + totalSupplyAfter.toString());
        log('balance1:\t' + balance1after.toString());
        log('balance2:\t' + balance2after.toString());
        log('balance3:\t' + balance3after.toString());
        log('------------');
        log('burnt:\t\t' + totalSupplyBefore.sub(totalSupplyAfter).toString());
        log('diff1:\t\t' + diff1.toString());
        log('diff2:\t\t' + diff2.toString());
        log('diff3:\t\t' + diff3.toString());
        log('diff sum:\t' + diff1.add(diff2).add(diff3));
        log('ratio1:\t\t' + ratio1.toString());
        //log('ratio2:\t\t' + ratio2.toString());
        //log('ratio3:\t\t' + ratio3.toString());

            tokensToSend = ether('50000');
            tokensToReceive = tokensToSend.mul(new BN(98)).div(new BN(100)); // 98%
            totalSupplyBefore = await token.totalSupply();
            balance1before = await token.balanceOf(account1);
            balance2before = await token.balanceOf(account2);
            balance3before = await token.balanceOf(account3);
            await token.transfer(account3, tokensToSend, { from: account1 });
            totalSupplyAfter = await token.totalSupply();
            balance1after = await token.balanceOf(account1);
            balance2after = await token.balanceOf(account2);
            balance3after = await token.balanceOf(account3);
            diff1 = balance1after.add(tokensToSend).sub(balance1before);
            diff2 = balance2after.sub(balance2before).sub(tokensToReceive);
            diff3 = balance3after.sub(balance3before);
            ratio1 = balance1after.div(diff1);
            ratio2 = balance2after.div(diff2);
            ratio3 = balance3after.div(diff3);
            //expect(ratio1).to.be.bignumber.equal(ratio2);
            //expect(ratio2).to.be.bignumber.equal(ratio3);
            log('------------');
            log('BEFORE');
            log('total:\t\t' + totalSupplyBefore.toString());
            log('balance1:\t' + balance1before.toString());
            log('balance2:\t' + balance2before.toString());
            log('balance3:\t' + balance3before.toString());
            log('------------');
            log('AFTER');
            log('total:\t\t' + totalSupplyAfter.toString());
            log('balance1:\t' + balance1after.toString());
            log('balance2:\t' + balance2after.toString());
            log('balance3:\t' + balance3after.toString());
            log('------------');
            log('burnt:\t\t' + totalSupplyBefore.sub(totalSupplyAfter).toString());
            log('diff1:\t\t' + diff1.toString());
            log('diff2:\t\t' + diff2.toString());
            log('diff3:\t\t' + diff3.toString());
            log('diff sum:\t' + diff1.add(diff2).add(diff3));
            log('ratio1:\t\t' + ratio1.toString());
            log('ratio2:\t\t' + ratio2.toString());
            log('ratio3:\t\t' + ratio3.toString());
    });

    it('should stop burning tokens as soon as the total amount reaches 1% of the initial', async function () {
      await token.burn(SUPPLY1, { from: account1 });
      await token.burn(SUPPLY3, { from: account3 });
      const balanceBeforeBurn = await token.balanceOf(account2);
      expect(balanceBeforeBurn).to.be.bignumber.equal(SUPPLY2);
      await token.burn(balanceBeforeBurn.sub(BURN_STOP_SUPPLY), { from: account2 });
      const balanceAfterBurn = await token.balanceOf(account2);
      const totalSupplyBeforeSend = await token.totalSupply();
      await token.transfer(account1, ether('1000'), { from: account2 });
      const totalSupplyAfterSend = await token.totalSupply();
      expect(totalSupplyAfterSend).to.be.bignumber.equal(totalSupplyBeforeSend);
      const balance1 = await token.balanceOf(account1);
      const balance2 = await token.balanceOf(account2);
      expect(balanceAfterBurn).to.be.bignumber.equal(balance1.add(balance2).addn(1));
    });

    it('should burn the correct amount of tokens when reaching the auto-burn limit', async function() {
      await token.burn(SUPPLY1, { from: account1 });
      await token.burn(SUPPLY3, { from: account3 });
      const balanceBeforeBurn = await token.balanceOf(account2);
      expect(balanceBeforeBurn).to.be.bignumber.equal(SUPPLY2);
      const amountToBurn = balanceBeforeBurn.sub(BURN_STOP_SUPPLY).sub(ether('3333'));
      await token.burn(amountToBurn, { from: account2 });
      const balanceAfterBurn = await token.balanceOf(account2);
      // just to make this test case clearer
      // the user's balance is 3333 tokens larger than the auto-burn limit
      // we must not burn more than this amount
      expect(balanceAfterBurn).to.be.bignumber.equal(ether('2103333'));
      const expectingBurningAmount = ether('3333');
      const totalSupplyBeforeSend = await token.totalSupply();
      const { receipt: { transactionHash } } = await token.transfer(account1, balanceAfterBurn, { from: account2 });
      const events = await getEvents(transactionHash, token, 'Transfer', web3);
      const actualBurningAmount = new BN(events[0].args.value);
      const totalSupplyAfterSend = await token.totalSupply();
      expect(actualBurningAmount).to.be.bignumber.equal(expectingBurningAmount);
      expect(totalSupplyAfterSend).to.be.bignumber.equal(totalSupplyBeforeSend.sub(expectingBurningAmount));
      const balance1 = await token.balanceOf(account1);
      expect(balanceAfterBurn).to.be.bignumber.equal(balance1.add(expectingBurningAmount));
    });
    */
});

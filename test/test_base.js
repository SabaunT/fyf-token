const { ether, BN } = require('openzeppelin-test-helpers');

const SminemERC20 = artifacts.require('SminemERC20');

/**
 * Tests for:
 * 1. balanceOf(excluded and included accounts)
 * 2. Exclusion and inclusion + transfers
 * Самое главное, чтобы при вкл./выкл. адреса, дальнейших трансферах (их отсутствия),
 * балансы всех остальных не поменялись. Распиши явный пример на листочке. Более подробно, читай ниже.
 *
 * Выключение адреса лишает его участия в образовании rate (и получении комиссий в момент перехода из gons во fragments),
 * однако не лишает возможности отправлять и получать средства. Чтобы не хранить и не рассчитывать rate, по которому
 * из gons можно будет получить fragments без комиссии для каждого исключенного, мы просто для них теперь используем
 * стандартный mapping balances, а также соотв способ расчета их баланса (просто обращаемся к тому mapping).
 * Поэтому проверь, каков rate между текущим балансом gons, а также текущим rate в системе (и тем rate, когда он был исключен).
 * Здесь же нужно, чтобы при включении адреса мы получили следующий эффект: rate не изменился, у всех адресов те же балансы и
 * включенный адрес не получил на свой fragments баланс больше токенов (они вообще не изменились). -> 2.3.2.
 *
 *   2.1. If can be excluded/included
 *   2.2. If exclusion maths (excluded amounts from supply) is correct:
 *     2.2.1. Address 0
 *     2.2.2. When excluded over, less than the supply
 *     2.2.3. if excluded address has 0 balance
 *   2.3. If inclusion maths is correct:
 *     2.3.1. Address 0
 *     2.3.2. Safe against bug, showed in the safemoon (check it on both reflect and sminem)
 *     2.3.3. Zero balance
 *     2.3.4. Test without newly setting reflectedBalance to balance*rate (2.3.2)
 * 3. convertActualToReflected - not sure if the name states the idea. Test convertActualToReflected(super.balanceOf)
 * 4. Transfers without an exclusion - guarantee, that fees are going to be distributed
 *   4.1. sending yourself
 *   4.2. sending between 3-4 addresses.
 * 5. reflectSupply < rate? getSupply values fn
 */

contract('SminemToken', async function (accounts) {
    // constructor params
    const name = "SminemERC20";
    const symbol = "SMNM";
    const decimals = 9;

    const toBNWithDecimals = (v) => new BN(v * Math.pow(10, decimals))
    const fromBNWithDecimals = (bn) => Math.floor(bn.toNumber() / Math.pow(10, decimals))

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

    // new balance = old balance + fee * (old balance / total supply)
    let getExpectedBalancesAfterTransfer = async (sender, receiver, transferringAmount) => {
        let feeAmount = transferringAmount.div(new BN(100));
        let receivingAmount = transferringAmount.sub(feeAmount);

        let senderBalance = await tokenInst.balanceOf(sender);
        let senderBalanceAfterTransfer = senderBalance.sub(transferringAmount);
        let senderBalanceWithDistributedFees = {
            classical: classicalFeeDistribution(senderBalanceAfterTransfer, feeAmount),
            new: newFeeDistribution(senderBalanceAfterTransfer, feeAmount),
        };

        let receiverBalance = await tokenInst.balanceOf(receiver);
        let receiverBalanceAfterTransfer = receiverBalance.add(receivingAmount);
        let receiverBalanceWithDistributedFees = {
            classical: classicalFeeDistribution(receiverBalanceAfterTransfer, feeAmount),
            new: newFeeDistribution(receiverBalanceAfterTransfer, feeAmount)
        };

        return {
            sender: senderBalanceWithDistributedFees,
            receiver: receiverBalanceWithDistributedFees,
        };
    }

    let classicalFeeDistribution = (balance, fee) => {
        return fromBNWithDecimals(balance.add((balance.mul(fee)).div(totalSupply)));
    }

    let newFeeDistribution = (balance, fee) => {
        // https://perafinance.medium.com/safemoon-is-it-safe-though-a-detailed-explanation-of-frictionless-yield-bug-338710649846
        return (balance.mul(totalSupply)).div(totalSupply.sub(fee));
    }

    let assertBalancesAfterTransfer = (expected, actual) => {
        let actualNoDecimals = fromBNWithDecimals(actual);
        assert.ok(
            // due of decimals and rounding stuff
            actual.sub(expected.new).lte(new BN(1)) ||
            expected.classical === actualNoDecimals
        )
    }

    // env params
    const account1 = accounts[0];
    const account2 = accounts[1];
    const account3 = accounts[2];
    const owner = accounts[3];

    let tokenInst;

    before("preparing env", async() => {
        // empty name
        await expectThrow(
            SminemERC20.new("", symbol, decimals, 1, {from: owner})
        );
        // empty symbol
        await expectThrow(
            SminemERC20.new(name, "", decimals, 1, {from: owner})
        );
        // zero decimal
        await expectThrow(
            SminemERC20.new(name, symbol, 0, 1, {from: owner})
        );

        tokenInst = await SminemERC20.new(
            name,
            symbol,
            decimals,
            fromBNWithDecimals(totalSupply),
            {from: owner}
        );
        let ownerBalance = await tokenInst.balanceOf(owner);
        assert.equal(ownerBalance.toString(), totalSupply.toString());
    });

    it("ERC20 behaviour: approving from owner to account 1 and 2", async() => {
        let approvedAcc1 = toBNWithDecimals(1000000);
        let approvedAcc2 = toBNWithDecimals(5000);
        await tokenInst.approve(account1, approvedAcc1, {from: owner});
        await tokenInst.approve(account2, approvedAcc2, {from: owner});

        let allowanceAcc1 = await tokenInst.allowance(owner, account1);
        let allowanceAcc2 = await tokenInst.allowance(owner, account2);

        assert.equal(approvedAcc1.toString(), allowanceAcc1.toString());
        assert.equal(approvedAcc2.toString(), allowanceAcc2.toString());
    })

    it("ERC20 behaviour: failing transfer from owner of account 1", async() => {
        // Because 1'000'000 was approved, which is more than owner have
        let allowanceAcc1 = await tokenInst.allowance(owner, account1);
        // Because 1'000'000 was approved, which is more than owner have
        await expectThrow(
            tokenInst.transferFrom(owner, account1, allowanceAcc1, {from: account1})
        );
    });

    it("ERC20 behaviour: decreasing allowance to account 1 from owner", async() => {
        let expectedAllowance = toBNWithDecimals(5000);
        let subAmount = toBNWithDecimals(995000);

        await tokenInst.decreaseAllowance(account1, subAmount, {from: owner});

        let allowanceAcc2 = await tokenInst.allowance(owner, account2);

        assert.equal(expectedAllowance.toString(), allowanceAcc2.toString());
    });

    it("Transferring from owner for account 1", async() => {
        let transferringAmount = toBNWithDecimals(5000);
        let expectedBalances = await getExpectedBalancesAfterTransfer(owner, account1, transferringAmount);

        await tokenInst.transferFrom(owner, account1, transferringAmount, {from: account1});

        let ownerBalanceAfterTransfer = await tokenInst.balanceOf(owner);
        let acc1BalanceAfterTransfer = await tokenInst.balanceOf(account1);

        assertBalancesAfterTransfer(expectedBalances.sender, ownerBalanceAfterTransfer);
        assertBalancesAfterTransfer(expectedBalances.receiver, acc1BalanceAfterTransfer)
    })

    it("Transferring from owner for account 2", async() => {
        let transferringAmount = toBNWithDecimals(5000);
        let expectedBalances = await getExpectedBalancesAfterTransfer(owner, account2, transferringAmount);

        // Check others balances
        // todo dirty
        let balanceAcc1Before = await tokenInst.balanceOf(account1);
        let expectedAcc1 = newFeeDistribution(balanceAcc1Before, transferringAmount.div(new BN(100)));

        await tokenInst.transferFrom(owner, account2, transferringAmount, {from: account2});

        let ownerBalanceAfterTransfer = await tokenInst.balanceOf(owner);
        let acc2BalanceAfterTransfer = await tokenInst.balanceOf(account2);

        let balanceAcc1After = await tokenInst.balanceOf(account1);

        assertBalancesAfterTransfer(expectedBalances.sender, ownerBalanceAfterTransfer);
        assertBalancesAfterTransfer(expectedBalances.receiver, acc2BalanceAfterTransfer);
        assert.equal(expectedAcc1.toString(), balanceAcc1After.toString());
    });

    it("ERC20 behaviour: zero allowances", async() => {
        let allowanceAcc1 = await tokenInst.allowance(owner, account1);
        let allowanceAcc2 = await tokenInst.allowance(owner, account2);

        assert.ok(allowanceAcc1.eq(new BN(0)));
        assert.ok(allowanceAcc2.eq(new BN(0)));
    })

    // Заверши блок под цифрой 4:
    // вышли еще 3 адресу побольше и посчитай руками все
    // попробуй выслать себе и посчитай руками

    // Заверши блок под цифрой 1 еще одним describe внутри contract

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

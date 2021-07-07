const { BN } = require('openzeppelin-test-helpers');

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
 *   2.1. If can be excluded/included (done)
 *   2.2. If exclusion maths (excluded amounts from supply) is correct:
 *     2.2.1. Address 0 (done)
 *     2.2.2. When excluded over, less than the supply
 *     2.2.3. if excluded address has 0 balance (done)
 *   2.3. If inclusion maths is correct:
 *     2.3.1. Address 0 (done)
 *     2.3.2. Safe against bug, showed in the safemoon (check it on both reflect and sminem) (done)
 *     2.3.3. Zero balance (done)
 *     2.3.4. Test without newly setting reflectedBalance to balance*rate (2.3.2) (done)
 * 3. convertActualToReflected - not sure if the name states the idea.
 * Test convertActualToReflected(super.balanceOf)
 * 4. Transfers without an exclusion - guarantee, that fees are going to be distributed
 *   4.1. sending yourself (done)
 *   4.2. sending between 3-4 addresses. (done)
 * 5. reflectTotalSupply lower bound (https://github.com/reflectfinance/reflect-contracts/issues/10).
 * Seems that mechanics should be off after some time. (acknowledged, stated in docs)
 * 6. reflectSupply < rate? getSupply values fn
 * 7. Some ERC20 behaviour: approve, transferFrom and e.t.c. (done)
 */

// todo проверь заново логику тестов
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

    let getExpectedBalancesAfterTransfer = async (sender, receiver, transferringAmount) => {
        let feeAmount = transferringAmount.div(new BN(100));
        let receivingAmount = transferringAmount.sub(feeAmount);

        let senderBalance = await tokenInst.balanceOf(sender);
        let senderBalanceAfterTransfer = senderBalance.sub(transferringAmount);
        let senderBalanceWithDistributedFees = distributeFees(senderBalanceAfterTransfer, feeAmount);

        let receiverBalance = await tokenInst.balanceOf(receiver);
        let receiverBalanceAfterTransfer = receiverBalance.add(receivingAmount);
        let receiverBalanceWithDistributedFees = distributeFees(receiverBalanceAfterTransfer, feeAmount);

        return {
            sender: senderBalanceWithDistributedFees,
            receiver: receiverBalanceWithDistributedFees,
        };
    }

    let distributeFees = (balance, fee) => {
        // https://perafinance.medium.com/safemoon-is-it-safe-though-a-detailed-explanation-of-frictionless-yield-bug-338710649846
        return (balance.mul(totalSupply.sub(excludedAmount))).div((totalSupply.sub(excludedAmount)).sub(fee));
    }

    let assertAfterFeeDistribution = (expected, actual) => {
        assert.ok(
            // due of decimals and rounding stuff
            actual.sub(expected).lte(new BN(1)) && actual.sub(expected).gte(new BN(-1))
        )
    }

    // env params
    const account1 = accounts[0];
    const account2 = accounts[1];
    const account3 = accounts[2];
    const owner = accounts[3];
    // for exclusion and inclusion tests
    const zeroBalanceAccount = accounts[4];

    let tokenInst;
    let excludedAmount = new BN(0);

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

    it("ERC20 behaviour: approving from owner to account 1 and account 2", async() => {
        let approvedAcc1 = toBNWithDecimals(1000000);
        let approvedAcc2 = toBNWithDecimals(5000);
        await tokenInst.approve(account1, approvedAcc1, {from: owner});
        await tokenInst.approve(account2, approvedAcc2, {from: owner});

        let allowanceAcc1 = await tokenInst.allowance(owner, account1);
        let allowanceAcc2 = await tokenInst.allowance(owner, account2);

        assert.equal(approvedAcc1.toString(), allowanceAcc1.toString());
        assert.equal(approvedAcc2.toString(), allowanceAcc2.toString());
    })

    it("ERC20 behaviour: failing transfer from owner to account 1", async() => {
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

    it("Transferring from owner to account 1", async() => {
        let transferringAmount = toBNWithDecimals(5000);
        let expectedBalances = await getExpectedBalancesAfterTransfer(owner, account1, transferringAmount);

        await tokenInst.transferFrom(owner, account1, transferringAmount, {from: account1});

        let ownerBalanceAfterTransfer = await tokenInst.balanceOf(owner);
        let acc1BalanceAfterTransfer = await tokenInst.balanceOf(account1);

        assertAfterFeeDistribution(expectedBalances.sender, ownerBalanceAfterTransfer);
        assertAfterFeeDistribution(expectedBalances.receiver, acc1BalanceAfterTransfer)
    })

    it("Transferring from owner to account 2", async() => {
        let transferringAmount = toBNWithDecimals(5000);
        let expectedBalances = await getExpectedBalancesAfterTransfer(owner, account2, transferringAmount);

        // todo dirty
        let balanceAcc1Before = await tokenInst.balanceOf(account1);
        let expectedAcc1 = distributeFees(balanceAcc1Before, transferringAmount.div(new BN(100)));

        await tokenInst.transferFrom(owner, account2, transferringAmount, {from: account2});

        let ownerBalanceAfterTransfer = await tokenInst.balanceOf(owner);
        let acc2BalanceAfterTransfer = await tokenInst.balanceOf(account2);

        let balanceAcc1After = await tokenInst.balanceOf(account1);

        assertAfterFeeDistribution(expectedBalances.sender, ownerBalanceAfterTransfer);
        assertAfterFeeDistribution(expectedBalances.receiver, acc2BalanceAfterTransfer);
        assertAfterFeeDistribution(expectedAcc1, balanceAcc1After);
    });

    it("ERC20 behaviour: zero allowances", async() => {
        let allowanceAcc1 = await tokenInst.allowance(owner, account1);
        let allowanceAcc2 = await tokenInst.allowance(owner, account2);

        assert.ok(allowanceAcc1.eq(new BN(0)));
        assert.ok(allowanceAcc2.eq(new BN(0)));
    })

    it("Transferring from account 1 to account 3", async() => {
        let transferringAmount = toBNWithDecimals(2000);
        let expectedBalances = await getExpectedBalancesAfterTransfer(account1, account3, transferringAmount);

        // check other balances for token distribution
        // todo dirty
        let balanceAcc2Before = await tokenInst.balanceOf(account2);
        let balanceOwnerBefore = await tokenInst.balanceOf(owner);

        let expectedAcc2 = distributeFees(balanceAcc2Before, transferringAmount.div(new BN(100)));
        let expectedOwner = distributeFees(balanceOwnerBefore, transferringAmount.div(new BN(100)));

        await tokenInst.transfer(account3, transferringAmount, {from: account1});

        let balanceAcc1After = await tokenInst.balanceOf(account1);
        let balanceAcc2After = await tokenInst.balanceOf(account2);
        let balanceAcc3After = await tokenInst.balanceOf(account3);
        let balanceOwnerAfter = await tokenInst.balanceOf(owner);

        assertAfterFeeDistribution(expectedBalances.sender, balanceAcc1After);
        assertAfterFeeDistribution(expectedBalances.receiver, balanceAcc3After);
        assert.equal(expectedAcc2.toString(), balanceAcc2After.toString());
        assert.equal(expectedOwner.toString(), balanceOwnerAfter.toString());
    });

    it("Transferring to yourself", async() => {
        // the same as just splitting fee between token holders
        let transferringAmount = toBNWithDecimals(10000);
        let fee = transferringAmount.div(new BN(100));

        let balanceBeforeAcc1 = await tokenInst.balanceOf(account1);
        let balanceBeforeAcc2 = await tokenInst.balanceOf(account2);
        let balanceBeforeAcc3 = await tokenInst.balanceOf(account3);
        let balanceBeforeOwner = await tokenInst.balanceOf(owner);
        let balanceOwnerBeforeDistribution = balanceBeforeOwner.sub(transferringAmount).add(transferringAmount.sub(fee))

        let expectedAcc1 = distributeFees(balanceBeforeAcc1, fee);
        let expectedAcc2 = distributeFees(balanceBeforeAcc2, fee);
        let expectedAcc3 = distributeFees(balanceBeforeAcc3, fee);
        let expectedOwner = distributeFees(balanceOwnerBeforeDistribution, fee);

        await tokenInst.transfer(owner, transferringAmount, {from: owner});

        let balanceAfterAcc1 = await tokenInst.balanceOf(account1);
        let balanceAfterAcc2 = await tokenInst.balanceOf(account2);
        let balanceAfterAcc3 = await tokenInst.balanceOf(account3);
        let balanceAfterOwner = await tokenInst.balanceOf(owner);

        assertAfterFeeDistribution(expectedAcc1, balanceAfterAcc1);
        assertAfterFeeDistribution(expectedAcc2, balanceAfterAcc2);
        assertAfterFeeDistribution(expectedAcc3, balanceAfterAcc3);
        assertAfterFeeDistribution(expectedOwner, balanceAfterOwner);
    })

    describe("Inclusion and exclusion logic tests", async() => {

        const zeroAddress = "0x0000000000000000000000000000000000000000";

        it("Exclusion fail", async() => {
            // Invalid access
            await expectThrow(
                tokenInst.excludeAccount(account1, {from: account2})
            )
            // zero address
            await expectThrow(
                tokenInst.excludeAccount(zeroAddress, {from: owner})
            )

            // already excluded
            await tokenInst.excludeAccount(account1, {from: owner});
            await expectThrow(
                tokenInst.excludeAccount(account1, {from: owner})
            )
        })

        it("Inclusion fail", async() => {
            // Invalid access
            await expectThrow(
                tokenInst.includeAccount(account1, {from: account2})
            )
            // not excluded account
            await expectThrow(
                tokenInst.includeAccount(account3, {from: owner})
            )
            // already included
            await tokenInst.includeAccount(account1, {from: owner});
            await expectThrow(
                tokenInst.includeAccount(account1, {from: owner})
            )
        })

        it("Exclusion don't change balance", async() => {
            let balanceBefore = await tokenInst.balanceOf(account1);
            await tokenInst.excludeAccount(account1, {from: owner});
            let balanceAfter = await tokenInst.balanceOf(account1);

            excludedAmount = excludedAmount.add(balanceBefore);

            assert.equal(balanceBefore.toString(), balanceAfter.toString());
        })

        it("Transfer between included (owner->account3) don't change balance of excluded", async() => {
            let transferringAmount = toBNWithDecimals(10000);
            let fee = transferringAmount.div(new BN(100));
            let expectedBalances = await getExpectedBalancesAfterTransfer(owner, account3, transferringAmount);

            let balanceExcludedBefore = await tokenInst.balanceOf(account1);
            let balanceBeforeAcc2 = await tokenInst.balanceOf(account2);
            let expectedAcc2 = distributeFees(balanceBeforeAcc2, fee);

            await tokenInst.transfer(account3, transferringAmount, {from: owner});

            let balanceExcludedAfter = await tokenInst.balanceOf(account1);
            let balanceAfterAcc2 = await tokenInst.balanceOf(account2);
            let balanceAfterAcc3 = await tokenInst.balanceOf(account3);
            let balanceAfterOwner = await tokenInst.balanceOf(owner);

            assert.equal(balanceExcludedBefore.toString(), balanceExcludedAfter.toString());
            assertAfterFeeDistribution(expectedBalances.sender, balanceAfterOwner);
            assertAfterFeeDistribution(expectedBalances.receiver, balanceAfterAcc3);
            assertAfterFeeDistribution(expectedAcc2, balanceAfterAcc2);
        })

        it("Transfer between included (owner->account2) don't change balance of excluded", async() => {
            let transferringAmount = toBNWithDecimals(10000);
            let balanceExcludedBefore = await tokenInst.balanceOf(account1);

            await tokenInst.transfer(account2, transferringAmount, {from: owner});

            let balanceExcludedAfter = await tokenInst.balanceOf(account1);

            // todo wipe off
            // let balanceAfterAcc2 = await tokenInst.balanceOf(account2);
            // let balanceAfterAcc3 = await tokenInst.balanceOf(account3);
            // let balanceAfterOwner = await tokenInst.balanceOf(owner);
            // console.log(balanceExcludedAfter.toString());
            // console.log(balanceAfterAcc2.toString())
            // console.log(balanceAfterAcc3.toString())
            // console.log(balanceAfterOwner.toString())

            assert.equal(balanceExcludedBefore.toString(), balanceExcludedAfter.toString());
        })

        it("Inclusion doesn't change balances: safe against inclusion bug", async() => {
            //https://perafinance.medium.com/safemoon-is-it-safe-though-a-detailed-explanation-of-frictionless-yield-bug-338710649846

            let balanceBeforeAcc1 = await tokenInst.balanceOf(account1);
            let balanceBeforeAcc2 = await tokenInst.balanceOf(account2);
            let balanceBeforeAcc3 = await tokenInst.balanceOf(account3);
            let balanceBeforeOwner = await tokenInst.balanceOf(owner);

            await tokenInst.includeAccount(account1, {from: owner});

            excludedAmount = excludedAmount.sub(balanceBeforeAcc1);

            let balanceAfterAcc1 = await tokenInst.balanceOf(account1);
            let balanceAfterAcc2 = await tokenInst.balanceOf(account2);
            let balanceAfterAcc3 = await tokenInst.balanceOf(account3);
            let balanceAfterOwner = await tokenInst.balanceOf(owner);

            assert.equal(balanceBeforeAcc1.toString(), balanceAfterAcc1.toString());
            assert.equal(balanceBeforeAcc2.toString(), balanceAfterAcc2.toString());
            assert.equal(balanceBeforeAcc3.toString(), balanceAfterAcc3.toString());
            assert.equal(balanceBeforeOwner.toString(), balanceAfterOwner.toString());
        })

        it("Transfer after inclusion changes balances the right way (account3->account1)", async() => {
            let transferringAmount = toBNWithDecimals(2000);
            let fee = transferringAmount.div(new BN(100));
            let expectedBalances = await getExpectedBalancesAfterTransfer(account3, account1, transferringAmount);

            // check other balances for token distribution
            // todo dirty
            let balanceBeforeAcc2 = await tokenInst.balanceOf(account2);
            let balanceBeforeOwner = await tokenInst.balanceOf(owner);
            let expectedAcc2 = distributeFees(balanceBeforeAcc2, fee);
            let expectedOwner = distributeFees(balanceBeforeOwner, fee);

            await tokenInst.transfer(account1, transferringAmount, {from: account3});

            let balanceAfterAcc1 = await tokenInst.balanceOf(account1);
            let balanceAfterAcc3 = await tokenInst.balanceOf(account3);
            let balanceAfterAcc2 = await tokenInst.balanceOf(account2);
            let balanceAfterOwner = await tokenInst.balanceOf(owner);

            assertAfterFeeDistribution(expectedBalances.sender, balanceAfterAcc3);
            assertAfterFeeDistribution(expectedBalances.receiver, balanceAfterAcc1);
            assertAfterFeeDistribution(expectedAcc2, balanceAfterAcc2);
            assertAfterFeeDistribution(expectedOwner, balanceAfterOwner);
        })

        it("Excluding account1 again, check it doesn't change balance", async() => {
            let balanceBefore = await tokenInst.balanceOf(account1);
            await tokenInst.excludeAccount(account1, {from: owner});
            let balanceAfter = await tokenInst.balanceOf(account1);

            excludedAmount = excludedAmount.add(balanceBefore);

            assert.equal(balanceBefore.toString(), balanceAfter.toString());
        })

        it("Transfer to excluded (owner->account1)", async() => {
            let transferringAmount = toBNWithDecimals(1000);
            let fee = transferringAmount.div(new BN(100));

            let balanceExcludedBefore = await tokenInst.balanceOf(account1);
            let balanceBeforeAcc2 = await tokenInst.balanceOf(account2);
            let balanceBeforeAcc3 = await tokenInst.balanceOf(account3);
            let balanceBeforeOwner = await tokenInst.balanceOf(owner);

            // very important to be before distributions calculation
            excludedAmount = excludedAmount.add(transferringAmount.sub(fee))

            let expectedBalanceExcluded = balanceExcludedBefore.add(transferringAmount.sub(fee));
            let expectedBalanceAcc2 = distributeFees(balanceBeforeAcc2, fee);
            let expectedBalanceAcc3 = distributeFees(balanceBeforeAcc3, fee);
            let expectedBalanceOwner = distributeFees(balanceBeforeOwner.sub(transferringAmount), fee);

            await tokenInst.transfer(account1, transferringAmount, {from: owner});

            let balanceExcludedAfter = await tokenInst.balanceOf(account1);
            let balanceAfterAcc2 = await tokenInst.balanceOf(account2);
            let balanceAfterAcc3 = await tokenInst.balanceOf(account3);
            let balanceAfterOwner = await tokenInst.balanceOf(owner);

            assert.equal(expectedBalanceExcluded.toString(), balanceExcludedAfter.toString());
            assertAfterFeeDistribution(expectedBalanceAcc2, balanceAfterAcc2);
            assertAfterFeeDistribution(expectedBalanceAcc3, balanceAfterAcc3);
            assertAfterFeeDistribution(expectedBalanceOwner, balanceAfterOwner);
        })

        it("Excluding account2, check it doesn't change balance", async() => {
            let balanceBefore = await tokenInst.balanceOf(account2);
            await tokenInst.excludeAccount(account2, {from: owner});
            let balanceAfter = await tokenInst.balanceOf(account2);

            excludedAmount = excludedAmount.add(balanceBefore);

            assert.equal(balanceBefore.toString(), balanceAfter.toString());
        })

        it("Transfer from excluded to included (account1->account3)", async() => {
            let transferringAmount = toBNWithDecimals(2000);
            let fee = transferringAmount.div(new BN(100));

            let balanceBeforeAcc1 = await tokenInst.balanceOf(account1);
            let balanceBeforeAcc2 = await tokenInst.balanceOf(account2);
            let balanceBeforeAcc3 = await tokenInst.balanceOf(account3);
            let balanceBeforeOwner = await tokenInst.balanceOf(owner);

            // very important to be before distributions calculation
            excludedAmount = excludedAmount.sub(transferringAmount)

            let expectedBalanceAcc1 = balanceBeforeAcc1.sub(transferringAmount);
            let expectedBalanceAcc3 = distributeFees(balanceBeforeAcc3.add(transferringAmount.sub(fee)), fee);
            let expectedBalanceOwner = distributeFees(balanceBeforeOwner, fee);

            await tokenInst.transfer(account3, transferringAmount, {from: account1});

            let balanceAfterAcc1 = await tokenInst.balanceOf(account1);
            let balanceAfterAcc2 = await tokenInst.balanceOf(account2);
            let balanceAfterAcc3 = await tokenInst.balanceOf(account3);
            let balanceAfterOwner = await tokenInst.balanceOf(owner);

            assert.equal(expectedBalanceAcc1.toString(), balanceAfterAcc1.toString());
            assert.equal(balanceBeforeAcc2.toString(), balanceAfterAcc2.toString());
            assertAfterFeeDistribution(expectedBalanceAcc3, balanceAfterAcc3);
            assertAfterFeeDistribution(expectedBalanceOwner, balanceAfterOwner);
        })

        it("Transfer between excluded (account1->account2)", async() => {
            let transferringAmount = toBNWithDecimals(1000);
            let fee = transferringAmount.div(new BN(100));

            let balanceBeforeAcc1 = await tokenInst.balanceOf(account1);
            let balanceBeforeAcc2 = await tokenInst.balanceOf(account2);
            let balanceBeforeAcc3 = await tokenInst.balanceOf(account3);
            let balanceBeforeOwner = await tokenInst.balanceOf(owner);

            // very important to be before distributions calculation
            excludedAmount = excludedAmount.sub(fee)

            let expectedBalanceAcc1 = balanceBeforeAcc1.sub(transferringAmount);
            let expectedBalanceAcc2 = balanceBeforeAcc2.add(transferringAmount.sub(fee))
            let expectedBalanceAcc3 = distributeFees(balanceBeforeAcc3, fee);
            let expectedBalanceOwner = distributeFees(balanceBeforeOwner, fee);

            await tokenInst.transfer(account2, transferringAmount, {from: account1});

            let balanceAfterAcc1 = await tokenInst.balanceOf(account1);
            let balanceAfterAcc2 = await tokenInst.balanceOf(account2);
            let balanceAfterAcc3 = await tokenInst.balanceOf(account3);
            let balanceAfterOwner = await tokenInst.balanceOf(owner);

            assert.equal(expectedBalanceAcc1.toString(), balanceAfterAcc1.toString());
            assert.equal(expectedBalanceAcc2.toString(), balanceAfterAcc2.toString());
            assertAfterFeeDistribution(expectedBalanceAcc3, balanceAfterAcc3);
            assertAfterFeeDistribution(expectedBalanceOwner, balanceAfterOwner);
        })

        it("Transfer excluded to himself", async() => {
            // the same as charity distribution of 1% of transfer amount
            let transferringAmount = toBNWithDecimals(1000);
            let fee = transferringAmount.div(new BN(100));

            let balanceBeforeAcc1 = await tokenInst.balanceOf(account1);
            let balanceBeforeAcc2 = await tokenInst.balanceOf(account2);
            let balanceBeforeAcc3 = await tokenInst.balanceOf(account3);
            let balanceBeforeOwner = await tokenInst.balanceOf(owner);

            // very important to be before distributions calculation
            excludedAmount = excludedAmount.sub(fee);

            let expectedBalanceAcc1 = balanceBeforeAcc1.sub(fee);
            let expectedBalanceAcc2 = balanceBeforeAcc2;
            let expectedBalanceAcc3 = distributeFees(balanceBeforeAcc3, fee);
            let expectedBalanceOwner = distributeFees(balanceBeforeOwner, fee);

            await tokenInst.transfer(account1, transferringAmount, {from: account1});

            let balanceAfterAcc1 = await tokenInst.balanceOf(account1);
            let balanceAfterAcc2 = await tokenInst.balanceOf(account2);
            let balanceAfterAcc3 = await tokenInst.balanceOf(account3);
            let balanceAfterOwner = await tokenInst.balanceOf(owner);

            assert.equal(expectedBalanceAcc1.toString(), balanceAfterAcc1.toString());
            assert.equal(expectedBalanceAcc2.toString(), balanceAfterAcc2.toString());
            assertAfterFeeDistribution(expectedBalanceAcc3, balanceAfterAcc3);
            assertAfterFeeDistribution(expectedBalanceOwner, balanceAfterOwner);
        })

        it("Including excluded accounts", async() => {
            //https://perafinance.medium.com/safemoon-is-it-safe-though-a-detailed-explanation-of-frictionless-yield-bug-338710649846

            let balanceBeforeAcc1 = await tokenInst.balanceOf(account1);
            let balanceBeforeAcc2 = await tokenInst.balanceOf(account2);
            let balanceBeforeAcc3 = await tokenInst.balanceOf(account3);
            let balanceBeforeOwner = await tokenInst.balanceOf(owner);

            await tokenInst.includeAccount(account1, {from: owner});
            await tokenInst.includeAccount(account2, {from: owner});

            excludedAmount = excludedAmount.sub(balanceBeforeAcc1.add(balanceBeforeAcc2));

            let balanceAfterAcc1 = await tokenInst.balanceOf(account1);
            let balanceAfterAcc2 = await tokenInst.balanceOf(account2);
            let balanceAfterAcc3 = await tokenInst.balanceOf(account3);
            let balanceAfterOwner = await tokenInst.balanceOf(owner);

            assert.equal(balanceBeforeAcc1.toString(), balanceAfterAcc1.toString());
            assert.equal(balanceBeforeAcc2.toString(), balanceAfterAcc2.toString());
            assert.equal(balanceBeforeAcc3.toString(), balanceAfterAcc3.toString());
            assert.equal(balanceBeforeOwner.toString(), balanceAfterOwner.toString());
        })

        it("Excluding zero balance doesn't affect the distribution after transfer", async() => {
            let transferringAmount = toBNWithDecimals(2000);
            let fee = transferringAmount.div(new BN(100));
            let expectedBalances = await getExpectedBalancesAfterTransfer(owner, account1, transferringAmount);

            // check other balances for token distribution
            // todo dirty
            let balanceBeforeExcluded = await tokenInst.balanceOf(zeroBalanceAccount);
            let balanceBeforeAcc2 = await tokenInst.balanceOf(account2);
            let balanceBeforeAcc3 = await tokenInst.balanceOf(account3);
            let expectedAcc2 = distributeFees(balanceBeforeAcc2, fee);
            let expectedAcc3 = distributeFees(balanceBeforeAcc3, fee);

            await tokenInst.excludeAccount(zeroBalanceAccount, {from: owner});
            await tokenInst.transfer(account1, transferringAmount, {from: owner});

            let balanceAfterExcluded = await tokenInst.balanceOf(zeroBalanceAccount);
            let balanceAfterAcc1 = await tokenInst.balanceOf(account1);
            let balanceAfterAcc3 = await tokenInst.balanceOf(account3);
            let balanceAfterAcc2 = await tokenInst.balanceOf(account2);
            let balanceAfterOwner = await tokenInst.balanceOf(owner);

            assert.equal(balanceBeforeExcluded.toString(), balanceAfterExcluded.toString());
            assertAfterFeeDistribution(expectedBalances.sender, balanceAfterOwner);
            assertAfterFeeDistribution(expectedBalances.receiver, balanceAfterAcc1);
            assertAfterFeeDistribution(expectedAcc2, balanceAfterAcc2);
            assertAfterFeeDistribution(expectedAcc3, balanceAfterAcc3);
        })

        it("Including zero balance doesn't change balances", async() => {
            let balanceBeforeAcc1 = await tokenInst.balanceOf(account1);
            let balanceBeforeAcc2 = await tokenInst.balanceOf(account2);
            let balanceBeforeAcc3 = await tokenInst.balanceOf(account3);
            let balanceBeforeOwner = await tokenInst.balanceOf(owner);

            await tokenInst.includeAccount(zeroBalanceAccount, {from: owner});

            let balanceAfterAcc1 = await tokenInst.balanceOf(account1);
            let balanceAfterAcc2 = await tokenInst.balanceOf(account2);
            let balanceAfterAcc3 = await tokenInst.balanceOf(account3);
            let balanceAfterOwner = await tokenInst.balanceOf(owner);

            assert.equal(balanceBeforeAcc1.toString(), balanceAfterAcc1.toString());
            assert.equal(balanceBeforeAcc2.toString(), balanceAfterAcc2.toString());
            assert.equal(balanceBeforeAcc3.toString(), balanceAfterAcc3.toString());
            assert.equal(balanceBeforeOwner.toString(), balanceAfterOwner.toString());
        })

        // if balance of included is 0, you still should redefine its reflected balance
        // because its reflected balance after being excluded has different rate with
        // the common balance (however, all the other balances have the same rate)
        it("Exlcuded account transfers all funds and then is being included", async() => {
            await tokenInst.excludeAccount(account3, {from: owner});
            let balanceExcluded = await tokenInst.balanceOf(account3);
            excludedAmount = excludedAmount.add(balanceExcluded);

            let fee = balanceExcluded.div(new BN(100));

            // just to change rate (important!)
            await tokenInst.transfer(account2, toBNWithDecimals(4000), {from: owner});

            excludedAmount = excludedAmount.sub(balanceExcluded);

            let balanceBeforeAcc1 = await tokenInst.balanceOf(account1);
            let balanceBeforeAcc2 = await tokenInst.balanceOf(account2);
            let balanceBeforeOwner = await tokenInst.balanceOf(owner);

            let expectedAcc1 = distributeFees(balanceBeforeAcc1, fee);
            let expectedAcc2 = distributeFees(balanceBeforeAcc2, fee);
            let expectedAcc3 = balanceExcluded.sub(balanceExcluded);
            let expectedOwner = distributeFees(balanceBeforeOwner.add(balanceExcluded.sub(fee)), fee);

            await tokenInst.transfer(owner, balanceExcluded, {from: account3});
            await tokenInst.includeAccount(account3, {from: owner});

            let balanceAfterAcc1 = await tokenInst.balanceOf(account1);
            let balanceAfterAcc2 = await tokenInst.balanceOf(account2);
            let balanceExcludedAfter = await tokenInst.balanceOf(account3);
            let balanceAfterOwner = await tokenInst.balanceOf(owner);

            assert.equal(expectedAcc3.toString(), balanceExcludedAfter.toString())
            assertAfterFeeDistribution(expectedAcc1, balanceAfterAcc1);
            assertAfterFeeDistribution(expectedAcc2, balanceAfterAcc2);
            assertAfterFeeDistribution(expectedOwner, balanceAfterOwner);
        })
    })
});

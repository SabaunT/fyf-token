const SminemERC20CounterSetter = artifacts.require("TransferCounterSetter");
const SminemNFT = artifacts.require("SminemNFT");

contract('SminemNFT token', async(accounts) => {
    const account1 = accounts[0];
    const account2 = accounts[1];
    const account3 = accounts[2];
    const randomAddress = accounts[3];
    const owner = accounts[4];

    const zeroAddress = "0x0000000000000000000000000000000000000000";

    const maxMintAtOnce = 30;

    let erc20Token;
    let nftToken;

    let multiplicityOfTokenTransfers = 100;
    let tokensMintedPerThreshold = 5;

    // If available to mint amount is 0 and we want to mint more X, the transfers amount
    // should be adjusted to + (X/tokensMintedPerThreshold) * multiplicityOfTokenTransfers
    let definePossibleMints = async (v) => {
        let currentTransferAmount = await erc20Token.getNumberOfTransfers();
        let diff = Math.floor((v*multiplicityOfTokenTransfers)/tokensMintedPerThreshold);
        await erc20Token.setTransferAmount(currentTransferAmount.toNumber() + diff);
    }

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

    before("Deploying NFT token", async() => {
        erc20Token = await SminemERC20CounterSetter.new({from: owner});
        // zero token address
        await expectThrow(
            SminemNFT.new(zeroAddress, 1, "basicUri", 5, {from: owner})
        );
        // zero multiplicity
        await expectThrow(
            SminemNFT.new(erc20Token.address, 0, "basicUri", 5, {from: owner})
        );
        // empty uri string
        await expectThrow(
            SminemNFT.new(erc20Token.address, 10, "", 5, {from: owner})
        );
        // zero quantity of minted per call
        await expectThrow(
            SminemNFT.new(erc20Token.address, 10, "", 0, {from: owner})
        );
        nftToken = await SminemNFT.new(erc20Token.address, 10, "http://domain.cool/", 5, {from: owner});
    })

    it("Setting transfer amount in ERC20", async() => {
        await erc20Token.setTransferAmount(120);
        let transferAmount = await erc20Token.getNumberOfTransfers();
        assert.equal(transferAmount.toNumber(), 120);
    })

    it("Failing to set token address", async() => {
        // invalid access
        await expectThrow(
            nftToken.setNewTokenAddress(randomAddress, {from: account1})
        );
        // zero address
        await expectThrow(
            nftToken.setNewTokenAddress(zeroAddress, {from: owner})
        );
        // same address
        await expectThrow(
            nftToken.setNewTokenAddress(erc20Token.address, {from: owner})
        );
    })

    it("Failing to set multiplicity value", async() => {
        // invalid access
        await expectThrow(
            nftToken.setTransfersMultiplicity(20, {from: account1})
        );
        // zero value
        await expectThrow(
            nftToken.setTransfersMultiplicity(0, {from: owner})
        );
    })

    it("Failing to set minted per threshold value", async() => {
        // invalid access
        await expectThrow(
            nftToken.setTokensMintedPerThreshold(20, {from: account1})
        );
        // zero value
        await expectThrow(
            nftToken.setTransfersMultiplicity(0, {from: owner})
        );
    })

    it("Change multiplicity and minted per threshold amount", async() => {
        await nftToken.setTransfersMultiplicity(multiplicityOfTokenTransfers, {from: owner});
        await nftToken.setTokensMintedPerThreshold(tokensMintedPerThreshold, {from: owner});

        let multiplicity = await nftToken.multiplicityOfTokenTransfers();
        let mintingPerThreshold = await nftToken.mintingPerThreshold();

        assert.equal(multiplicityOfTokenTransfers, multiplicity);
        assert.equal(tokensMintedPerThreshold, mintingPerThreshold);
    })

    it("Failing to mint", async() => {
        let addressesMock = Array(256).fill(randomAddress);
        // invalid access
        await expectThrow(
            nftToken.mint(addressesMock.slice(0, 254), {from: account1})
        );
        // too much at once
        await expectThrow(
            nftToken.mint(addressesMock, {from: owner})
        );
        // more than available mints
        await expectThrow(
            nftToken.mint(addressesMock.slice(0, 254), {from: owner})
        );
    })

    it("Successfully minting 5 NFTS", async() => {
        let possibleMintsBefore = await nftToken.getPossibleMintsAmount();
        let receivers = Array(possibleMintsBefore.toNumber()).fill(account1, 0, 3);
        receivers.fill(account2, 3)

        // doesn't change the state
        let ids = await nftToken.mint.call(receivers, {from: owner});
        // changes the state
        await nftToken.mint(receivers, {from: owner});

        let possibleMints = await nftToken.getPossibleMintsAmount();

        assert.equal(ids.length, 5);
        assert.equal(possibleMints.toNumber(), 0);
    })


    it("Successfully minting 50 NFTS", async() => {
        await definePossibleMints(50);
        let possibleMintsBefore = await nftToken.getPossibleMintsAmount();
        assert.equal(possibleMintsBefore.toNumber(), 50);

        let receivers = Array(possibleMintsBefore.toNumber());
        receivers.fill(account1, 0, 20);
        receivers.fill(account2, 20, 40);
        receivers.fill(account3, 40);

        // Amount of mints is valid, but too big for the once call
        await expectThrow(
            nftToken.mint(receivers, {from: owner})
        )

        // doesn't change the state
        let ids = await nftToken.mint.call(receivers.slice(0, maxMintAtOnce), {from: owner});
        // changes the state
        await nftToken.mint(receivers.slice(0, maxMintAtOnce), {from: owner});
        let possibleMintsAfterFirstCall = await nftToken.getPossibleMintsAmount();

        assert.equal(ids.length, maxMintAtOnce);
        assert.equal(possibleMintsAfterFirstCall.toNumber(), 50-ids.length);

        ids = await nftToken.mint.call(receivers.slice(maxMintAtOnce), {from: owner});
        await nftToken.mint(receivers.slice(maxMintAtOnce), {from: owner});
        let possibleMintsAfterSecondCall = await nftToken.getPossibleMintsAmount();

        assert.equal(ids.length, 20);
        assert.equal(possibleMintsAfterSecondCall.toNumber(), 0);
    })



    /**
     * Вектора:
     * 1. К минту доступно 5*100 (setTransfers, getPossbileMints);
     * 1.4. Частичный минт одной части, изменение кратности вверх
     * 1.4.1. Изменение сильно высоко (чтобы удариться в то, что уменьшаемое больше вычитаемого
     * 1.4.2. Несильное изменение
         * 1.3. Частичный минт одной части, изменение кратности вниз
         * 1.5. Частичнй минт одной части, изменение количество токенов за раз вниз
         * 1.6. Частичный минт одной части, изменение количества токенов за раз вверх
         * 1.7. Тот же самый тест, только изменяя и один параметр, и другой.
     * 2 Отправка контрактам
         * 2.1. Минт в пользу, у которого нет рисивера, должен не удасться (erc20 токену)
         * 2.2. Задеплой такой же контракт и сминть ему - должно получиться
     * 3. Когда оба множителя очень большие числа
     * */
})
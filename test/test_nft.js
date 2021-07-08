const SminemERC20CounterSetter = artifacts.require("TransferCounterSetter");
const SminemNFT = artifacts.require("SminemNFT");

contract('SminemNFT token', async(accounts) => {
    const account1 = accounts[0];
    const account2 = accounts[1];
    const randomAddress = accounts[2];
    const owner = accounts[3];

    const zeroAddress = "0x0000000000000000000000000000000000000000";

    let erc20Token;
    let nftToken;

    let multiplicityOfTokenTransfers = 100;
    let tokensMintedPerThreshold = 5;

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

    it("Successfully minting 5 (tokensMintedPerThreshold) NFTS", async() => {
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

    /**
     * Вектора:
     * 1. К минту доступно 5*100 (setTransfers, getPossbileMints);
         * 1.2. Частичный минт всех 500
         * 1.3. Частичный минт одной части, изменение кратности вниз
         * 1.4. Частичный минт одной части, изменение кратности вверх
         * 1.5. Частичнй минт одной части, изменение количество токенов за раз вниз
         * 1.6. Частичный минт одной части, изменение количества токенов за раз вверх
         * 1.7. Тот же самый тест, только изменяя и один параметр, и другой.
     * 2 Отправка контрактам
         * 2.1. Минт в пользу, у которого нет рисивера, должен не удасться (erc20 токену)
         * 2.2. Задеплой такой же контракт и сминть ему - должно получиться
     * 3. Когда оба множителя очень большие числа
     * */
})
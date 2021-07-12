const { assert } = require("chai");

const SminemERC20CounterSetter = artifacts.require("TransferCounterSetter");
const SminemNFT = artifacts.require("SminemNFT");
const NFTReceiver = artifacts.require("NFTReceiver");

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

    let multiplicityOfTokenTransfers = 150;
    let tokensMintedPerThreshold = 10;

    // If available to mint amount is 0 and we want to mint more X, the transfers amount
    // should be adjusted to + (X/tokensMintedPerThreshold) * multiplicityOfTokenTransfers
    let adjustPossibleMints = async (v) => {
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
        nftToken = await SminemNFT.new(erc20Token.address, multiplicityOfTokenTransfers, "http://domain.cool/", tokensMintedPerThreshold, {from: owner});
    })

    it("Setting transfer amount in ERC20", async() => {
        await erc20Token.setTransferAmount(120);
        let transferAmount = await erc20Token.getNumberOfTransfers();
        assert.equal(transferAmount.toNumber(), 120);
    })

    it("Failing to set base Uri", async() => {
        // invalid access
        await expectThrow(
            nftToken.setNewBaseUri("random string", {from: account1})
        );
        // same string
        await expectThrow(
            nftToken.setNewBaseUri("http://domain.cool/", {from: owner})
        );
        // empty string
        await expectThrow(
            nftToken.setNewBaseUri("", {from: owner})
        );
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
            nftToken.setNewTransfersMultiplicity(20, {from: account1})
        );
        // zero value
        await expectThrow(
            nftToken.setNewTransfersMultiplicity(0, {from: owner})
        );
        // same value
        await expectThrow(
            nftToken.setNewTransfersMultiplicity(multiplicityOfTokenTransfers, {from: owner})
        );
    })

    it("Failing to set minted per threshold value", async() => {
        // invalid access
        await expectThrow(
            nftToken.setTokensMintedPerThreshold(20, {from: account1})
        );
        // zero value
        await expectThrow(
            nftToken.setNewTransfersMultiplicity(0, {from: owner})
        );
    })

    it("Change multiplicity and minted per threshold amount", async() => {
        multiplicityOfTokenTransfers = 100
        tokensMintedPerThreshold = 5

        await nftToken.setNewTransfersMultiplicity(multiplicityOfTokenTransfers, {from: owner});
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
        await adjustPossibleMints(50);
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

    it("Failing partial mint of 20 tokens, because multiplicity goes too high", async () => {
        await adjustPossibleMints(20);
        let possibleMintsBefore = await nftToken.getPossibleMintsAmount();
        assert.equal(possibleMintsBefore.toNumber(), 20);

        let receivers = Array(possibleMintsBefore.toNumber());
        receivers.fill(account1, 0, 10);
        receivers.fill(account2, 10, 15);
        receivers.fill(account3, 15);

        // Mint 8 of tokens
        // doesn't change the state
        let ids = await nftToken.mint.call(receivers.slice(0, 8), {from: owner});
        // changes the state
        await nftToken.mint(receivers.slice(0, 8), {from: owner});
        let possibleMintsAfterFirstCall = await nftToken.getPossibleMintsAmount();

        assert.equal(ids.length, 8);
        assert.equal(possibleMintsAfterFirstCall.toNumber(), 20-ids.length);

        // Changing multiplicity - making it very hight
        await nftToken.setNewTransfersMultiplicity(200, {from: owner});
        multiplicityOfTokenTransfers = 200;

        // Multiplicity changed, can't mint so many tokens now
        await expectThrow(
            nftToken.mint(receivers.slice(8), {from: owner})
        )

        ids = await nftToken.mint.call(receivers.slice(8, 13), {from: owner});
        await nftToken.mint(receivers.slice(8, 13), {from: owner});
        let possibleMintsAfterSecondCall = await nftToken.getPossibleMintsAmount();
        assert.equal(ids.length, 5);
        assert.equal(possibleMintsAfterSecondCall.toNumber(), 0);
    })

    describe("Tests with increasing multiplicity", async() => {
        // So total amount of transfers now is 1520
        // We changed multiplicity to 200. This made countable amount of transfers
        // for new multiplicity on the level of 1520-1300 - 220.
        // For the 220 transfers we minted 5 NFTs.
        // Changing multiplicity to 250 here should not affect anyhow. 
        it("Making multiplicity higher while having 0 availbale mints and low amount of transfers", async () => {
            // Changing multiplicity - making it little higher
            await nftToken.setNewTransfersMultiplicity(250, {from: owner});
            multiplicityOfTokenTransfers = 250;
    
            let possibleMints = await nftToken.getPossibleMintsAmount();
            assert.equal(possibleMints.toNumber(), 0)
        })

        it("Partial minting tokens making a little higher multiplicity", async () => {
            await adjustPossibleMints(35);
            // Token Transfers amount = 1520 + (35//5)*250 = 1500 + 1750 = 3270
            let transfers = await erc20Token.getNumberOfTransfers();
            assert.equal(transfers.toNumber(), 3270);

            await nftToken.mint(Array(5).fill(account1), {from: owner});

            let possibleMints = await nftToken.getPossibleMintsAmount();
            // In accordance to logic in SminemNFT: ((3270 - 1500)//200) * 5 - 5
            assert.equal(possibleMints.toNumber(), 30);

            // Changing multiplicity - making it little higher
            await nftToken.setNewTransfersMultiplicity(300, {from: owner});
            multiplicityOfTokenTransfers = 300;

            possibleMints = await nftToken.getPossibleMintsAmount();
            // In accordance to logic in SminemNFT: 
            // Minted while multiplicity 250: 5
            // Transfers for the minted amount: 5//5 * 250 = 250
            // Possible mints for multiplicity 300: ((3270 - 1500-250)//300) * 5
            assert.equal(possibleMints.toNumber(), 25);

            let receivers = Array(possibleMints.toNumber());
            receivers.fill(account1, 0, 10);
            receivers.fill(account2, 10, 15);
            receivers.fill(account3, 15);

            // doesn't change the state
            let ids = await nftToken.mint.call(receivers, {from: owner});
            // changes the state
            await nftToken.mint(receivers, {from: owner});
            let possibleMintsAfterCall = await nftToken.getPossibleMintsAmount();
            assert.equal(ids.length, 25);
            assert.equal(possibleMintsAfterCall.toNumber(), 0);
        })

        it("Changing to a higher multiplicity while having a large transfer amount in current multiplicity", async() => {
            // Changing multiplicity - making it little higher
            await nftToken.setNewTransfersMultiplicity(500, {from: owner});
            multiplicityOfTokenTransfers = 500;

            // Transfers for mulitplicity 300: 3270 - 1750 = 1520.
            // Min amount for minting 25 NFTs: 25//5 * 300 = 1500.
            // Transfers for multiplicity 500: 3270-1750-1500 = 20.
            let possibleMintsAfterCall = await nftToken.getPossibleMintsAmount();
            assert.equal(possibleMintsAfterCall.toNumber(), 0);
        })
    })

    describe("Tests with decreasing multiplicity", async() => {
        it("Changing to a lower multiplicity while having a small amount of transfers in current multiplicity", async() => {
            // Changing multiplicity - making it little lower
            await nftToken.setNewTransfersMultiplicity(400, {from: owner});
            multiplicityOfTokenTransfers = 400;

            // no changes in available for multiplicity transfers state
            let possibleMintsAfterCall = await nftToken.getPossibleMintsAmount();
            assert.equal(possibleMintsAfterCall.toNumber(), 0)
        })

        it("Partial mint with much lowering multiplicity", async() => {
            await adjustPossibleMints(50);
            // 50 NFTs could be minted when having 50/5 * 4000 = 4000 transfers.
            // So actual transfer amount will be around 4020.
            let transfers = await erc20Token.getNumberOfTransfers();
            assert.equal(transfers.toNumber(), 7270);

            // doesn't change the state
            let ids = await nftToken.mint.call(Array(30).fill(account3), {from: owner});
            // changes the state
            await nftToken.mint(Array(30).fill(account3), {from: owner});
            let possibleMints = await nftToken.getPossibleMintsAmount();
            assert.equal(ids.length, 30);
            assert.equal(possibleMints.toNumber(), 20);

            // Changing multiplicity - making it 2 times lower
            await nftToken.setNewTransfersMultiplicity(200, {from: owner});
            multiplicityOfTokenTransfers = 200;

            possibleMints = await nftToken.getPossibleMintsAmount();
            // In accordance to logic in SminemNFT: 
            // Minted while multiplicity 400: 30
            // Transfers for the minted amount: 30//5 * 400 = 2400
            // Possible mints for multiplicity 200: ((7270 - 3250 - 2400)//200) * 5 = 40
            assert.equal(possibleMints.toNumber(), 40);

            let receivers = Array(possibleMints.toNumber());
            receivers.fill(account1, 0, 20);
            receivers.fill(account2, 20, 35);
            receivers.fill(account3, 35);

            // changes the state
            await nftToken.mint(receivers.slice(0, maxMintAtOnce), {from: owner});
            // doesn't change the state
            ids = await nftToken.mint.call(receivers.slice(maxMintAtOnce), {from: owner});
            // changes the state
            await nftToken.mint(receivers.slice(maxMintAtOnce), {from: owner});
            possibleMints = await nftToken.getPossibleMintsAmount();
            assert.equal(ids.length, 10);
            assert.equal(possibleMints.toNumber(), 0);
        })

        it("Making multiplicity lower while having 0 availbale mints and a high mumber of transfers for current multiplicity", async () => {
            // Changing multiplicity - making it little higher
            await nftToken.setNewTransfersMultiplicity(100, {from: owner});
            multiplicityOfTokenTransfers = 100;
    
            let possibleMints = await nftToken.getPossibleMintsAmount();
            assert.equal(possibleMints.toNumber(), 0)
        })
    })

    describe("Testing sending to contracts", async() => {
        it("Should fail minting to contract, which isn't a NFT receiver", async() => {
            await adjustPossibleMints(5);
            await expectThrow(   
                nftToken.mint(Array(5).fill(erc20Token.address), {from: owner})
            )
        })

        it("Successful minting to contract, which is a NFT receiver", async() => {
            let nftReceiver = await NFTReceiver.new({from: account1});
            nftToken.mint(Array(5).fill(nftReceiver.address), {from: owner})
        })
    })

    /**
     * Вектора:
     * 1.5. Частичнй минт одной части, изменение количество токенов за раз вниз
     * 1.6. Частичный минт одной части, изменение количества токенов за раз вверх
     * 1.7. Тот же самый тест, только изменяя и один параметр, и другой.
     * */
})
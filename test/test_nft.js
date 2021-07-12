const { assert } = require("chai");

const FYFCounterSetter = artifacts.require("TransferCounterSetter");
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
    let mintingPerThreshold = 10;

    // If available to mint amount is 0 and we want to mint more X, the transfers amount
    // should be adjusted to + (X/mintingPerThreshold) * multiplicityOfTokenTransfers
    let adjustPossibleMints = async (v) => {
        let currentTransferAmount = await erc20Token.getNumberOfTransfers();
        let diff = Math.floor((v*multiplicityOfTokenTransfers)/mintingPerThreshold);
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
        erc20Token = await FYFCounterSetter.new({from: owner});
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
        nftToken = await SminemNFT.new(erc20Token.address, multiplicityOfTokenTransfers, "http://domain.cool/", mintingPerThreshold, {from: owner});
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
            nftToken.setNewTokensMintingPerThreshold(20, {from: account1})
        );
        // zero value
        await expectThrow(
            nftToken.setNewTokensMintingPerThreshold(0, {from: owner})
        );
        // same value
        await expectThrow(
            nftToken.setNewTokensMintingPerThreshold(mintingPerThreshold, {from: owner})
        );
    })

    it("Change multiplicity and minted per threshold amount", async() => {
        multiplicityOfTokenTransfers = 100
        mintingPerThreshold = 5

        await nftToken.setNewTransfersMultiplicity(multiplicityOfTokenTransfers, {from: owner});
        await nftToken.setNewTokensMintingPerThreshold(mintingPerThreshold, {from: owner});

        let multiplicity = await nftToken.multiplicityOfTokenTransfers();
        let _mintingPerThreshold = await nftToken.mintingPerThreshold();

        assert.equal(multiplicityOfTokenTransfers, multiplicity);
        assert.equal(mintingPerThreshold, _mintingPerThreshold);
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

            await nftToken.mint(receivers.slice(0, maxMintAtOnce), {from: owner});
            // doesn't change the state
            ids = await nftToken.mint.call(receivers.slice(maxMintAtOnce), {from: owner});
            await nftToken.mint(receivers.slice(maxMintAtOnce), {from: owner});
            possibleMints = await nftToken.getPossibleMintsAmount();
            assert.equal(ids.length, 10);
            assert.equal(possibleMints.toNumber(), 0);
        })

        it("Making multiplicity lower while having 0 availbale mints and a high number of transfers for current multiplicity", async () => {
            // Changing multiplicity - making it little higher
            await nftToken.setNewTransfersMultiplicity(100, {from: owner});
            multiplicityOfTokenTransfers = 100;
    
            let possibleMints = await nftToken.getPossibleMintsAmount();
            assert.equal(possibleMints.toNumber(), 0)
        })
    })

    describe("Testing with changing value of minting per threshold", async() => {
        it("Partial minting with decreasing", async() => {
            // 75/5 * 100 = 1500
            // Transfers amount = 7270 + 1500 = 8770
            await adjustPossibleMints(75);
            let numOfTransfers = await erc20Token.getNumberOfTransfers();
            assert.equal(numOfTransfers.toNumber(), 8770);

            // changes the state
            await nftToken.mint(Array(maxMintAtOnce).fill(account1), {from: owner});
            await nftToken.mint(Array(maxMintAtOnce).fill(account2), {from: owner});

            // Changing multiplicity - making it 5 times lower
            await nftToken.setNewTokensMintingPerThreshold(1, {from: owner});
            mintingPerThreshold = 1;

            let possibleMints = await nftToken.getPossibleMintsAmount();
            // In accordance to logic in SminemNFT: 
            // Minted while minting per threshold 5: 60
            // Transfers for the minted amount 60: 60//5 * 100 = 1200
            // Possible mints minting per threshold 1: ((8770 - 3250 - 2400 - 1600 - 1200)//100) * 1 = 3
            assert.equal(possibleMints.toNumber(), 3);

            await nftToken.mint(Array(3).fill(account3), {from: owner});
            possibleMints = await nftToken.getPossibleMintsAmount();
            assert.equal(possibleMints.toNumber(), 0);
        })

        it("Partial minting with increasing value", async() => {
            // 75*100 = 7500
            // Transfers amount = 8770 + 7500 = 16270
            await adjustPossibleMints(75);
            let numOfTransfers = await erc20Token.getNumberOfTransfers();
            assert.equal(numOfTransfers.toNumber(), 16270);

            // changes the state
            await nftToken.mint(Array(maxMintAtOnce).fill(account1), {from: owner})

            // Changing multiplicity - making it 4 times bigger
            await nftToken.setNewTokensMintingPerThreshold(4, {from: owner});
            mintingPerThreshold = 4;

            let possibleMints = await nftToken.getPossibleMintsAmount();
            // In accordance to logic in SminemNFT: 
            // Minted while minting per threshold 1: 3+30
            // Transfers for the minted amount 33: 33//1 * 100 = 3300
            // Possible mints minting per threshold 4: ((16270 - 8450 - 3300)//100) * 4 = 180
            assert.equal(possibleMints.toNumber(), 180);
        })
    })

    describe("Testing with changing both parameters of mint", async() => {
        it("Partial minting with increasing multiplicity and lowering minting per threshold", async() => {
            await nftToken.mint(Array(maxMintAtOnce).fill(account1), {from: owner})
            await nftToken.mint(Array(maxMintAtOnce).fill(account2), {from: owner})
            await nftToken.mint(Array(maxMintAtOnce).fill(account3), {from: owner})

            let possibleMints = await nftToken.getPossibleMintsAmount();
            assert.equal(possibleMints.toNumber(), 90);

            await nftToken.setNewTransfersMultiplicity(150, {from: owner});
            multiplicityOfTokenTransfers = 150;

            possibleMints = await nftToken.getPossibleMintsAmount();
            // Minted while minting per multiplicity 100: 90
            // Transfers for the minted amount 90: 90//4 * 100 = 2250 (but used 2300, 
            // because to mint 90 tokens you should be able to mint 92 -> 2300. 
            // [2200, 2300) is about ability to mint up to 88 tokens)
            // Possible mints for multiplicity 150: ((16270 - 8450 - 3300 - 2300)//150) * 4 = 56
            assert.equal(possibleMints.toNumber(), 56);

            await nftToken.mint(Array(maxMintAtOnce).fill(account1), {from: owner})

            await nftToken.setNewTokensMintingPerThreshold(2, {from: owner});
            mintingPerThreshold = 2;
            
            possibleMints = await nftToken.getPossibleMintsAmount();
            // Minted while minting per multiplicity 150: 30
            // Transfers for the minted amount 30: 30/4 * 150 = 1175 (but 1200 was used 
            // for the same reason, as described upper).
            // Possible mints for minting per threshold 2: ((16270 - 8450 - 3300 - 2300 - 1200)//150) * 2 = 12
            assert.equal(possibleMints.toNumber(), 12);

            await nftToken.mint(Array(12).fill(account2), {from: owner})

            possibleMints = await nftToken.getPossibleMintsAmount();
            assert.equal(possibleMints.toNumber(), 0);
        })

        it("Changing both params in any order gives the same result", async() => {
            // just to test it while being able to mint not only 0 NFTs
            await adjustPossibleMints(35);

            await nftToken.setNewTransfersMultiplicity(300, {from: owner});
            await nftToken.setNewTokensMintingPerThreshold(1, {from: owner});

            let possibleMints1 = await nftToken.getPossibleMintsAmount();

            // undoing changes
            await nftToken.setNewTransfersMultiplicity(150, {from: owner});
            await nftToken.setNewTokensMintingPerThreshold(2, {from: owner});

            // new order
            await nftToken.setNewTokensMintingPerThreshold(1, {from: owner});
            await nftToken.setNewTransfersMultiplicity(300, {from: owner});

            let possibleMints2 = await nftToken.getPossibleMintsAmount();

            assert.equal(possibleMints1.toNumber(), possibleMints2.toNumber())
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
})
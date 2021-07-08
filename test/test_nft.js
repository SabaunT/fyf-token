const SminemERC20CounterSetter = artifacts.require("TransferCounterSetter");
const SminemNFT = artifacts.require("SminemNFT");

contract('SminemNFT token', async(accounts) => {
    const account1 = accounts[0];
    const account2 = accounts[1];
    const account3 = accounts[2];
    const owner = accounts[3];

    const zeroAddress = "0x0000000000000000000000000000000000000000";

    let erc20Token;
    let nftToken;

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
        
    })
})
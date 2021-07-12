pragma solidity 0.5.7;

import "./ITransferCounter.sol";
import "./Strings.sol";
import "openzeppelin-solidity/contracts/token/ERC721/ERC721Full.sol";
import "openzeppelin-solidity/contracts/access/roles/MinterRole.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";

/**
 * @title Sminem NFT token.
 * @author SabaunT https://github.com/SabaunT.
 * @notice Mints tokens in an amount, which calculates depending in transfers made in ERC20 token
 * which implements `IERC20TransferCounter` interface.
 */
contract SminemNFT is ERC721Full, MinterRole, Ownable {
    using SafeMath for uint256;
    using Strings for uint256;

    // Token whose transfers are being observed to make a decision about minting.
    IERC20TransferCounter public token;

    // Base uri for the outer storage of the token.
    string public baseUri;

    // Every `multiplicityOfTokenTransfers` transfers we can mint `mintingPerThreshold` tokens.
    // Further both are referred as "globals".
    uint256 public mintingPerThreshold;
    uint256 public multiplicityOfTokenTransfers;

    // For more info read `{SminemNFT-_updateTransfersAndMintDataBeforeChange}`
    uint256 private _transfersBeforeChaningMultiplicity;
    // For more info read `{SminemNFT-_updateTransfersAndMintDataBeforeChange}`
    uint256 private _mintedBeforeChangingMultiplicity;

    event TokenAddress(IERC20TransferCounter indexed token);
    event TransferMultiplicity(uint256 indexed num);
    event BaseUri(string indexed baseUri);
    event TokensMintedPerCall(uint256 indexed num);

    constructor(
        IERC20TransferCounter _token,
        uint256 _transfersMultiplicity,
        string memory _baseUri,
        uint256 _mintedPerCall
    )
        ERC721Full("SminemNFT", "SMNMNFT")
        public
    {
        require(address(_token) != address(0), "SminemNFT::zero token address");
        require(bytes(_baseUri).length > 0, "SminemNFT::empty base uri string");
        require(
            _transfersMultiplicity > 0,
            "SminemNFT::multiplicity of transfers equals 0"
        );
        require(
            _mintedPerCall > 0,
            "SminemNFT::nfts minted per transfers amount reaching threshold equals 0"
        );

        token = _token;
        multiplicityOfTokenTransfers = _transfersMultiplicity;
        baseUri = _baseUri;
        mintingPerThreshold = _mintedPerCall;

        emit TokenAddress(_token);
        emit TransferMultiplicity(_transfersMultiplicity);
        emit BaseUri(_baseUri);
        emit TokensMintedPerCall(_mintedPerCall);
    }

    /**
     * @dev Sets a new token address, whose transfers will be observed.
     * Requirements:
     *
     * - `token` cannot be the zero address.
     * - `token` cannot be the same.
     */
    function setNewTokenAddress(IERC20TransferCounter _token) external onlyOwner {
        require(address(_token) != address(0), "SminemNFT::zero token address");
        require(address(token) != address(_token), "SminemNFT::setting the same address");

        token = _token;
        emit TokenAddress(_token);
    }

    /**
     * @dev Sets a new base uri.
     *
     * Requirements:
     *
     * - `_baseUri` cannot be empty string.
     * - `_baseUri` cannot be the same.
     */
    function setNewBaseUri(string calldata _baseUri) external onlyOwner {
        require(
            keccak256(abi.encodePacked(_baseUri)) != keccak256(abi.encodePacked(baseUri)),
            "SminemNFT::setting the same base uri value"
        );
        require(bytes(_baseUri).length > 0, "SminemNFT::empty base uri string");

        baseUri = _baseUri;
        emit BaseUri(_baseUri);
    }

    /**
     * @dev Sets a new value of transfers multiplicity.
     *
     * Requirements:
     *
     * - `num` cannot be zero.
     * - `num` cannot be the same.
     */
    function setNewTransfersMultiplicity(uint256 num) external onlyOwner {
        require(
            num != multiplicityOfTokenTransfers,
            "SminemNFT::setting the same multiplicity value"
        );
        require(
            num > 0,
            "SminemNFT::multiplicity of transfers equals 0"
        );
        _updateTransfersAndMintDataBeforeChange();

        multiplicityOfTokenTransfers = num;
        emit TransferMultiplicity(num);
    }

    /**
     * @dev Sets a new value of NFTs amount allowed to mint per reaching every `multiplicityOfTokenTransfers`
     * amount of transfers on the `token`.
     *
     * Requirements:
     *
     * - `num` cannot be zero.
     * - `num` cannot be the same.
     */
    function setNewTokensMintingPerThreshold(uint256 num) external onlyOwner {
        require(
            num != mintingPerThreshold,
            "SminemNFT::setting the same minting per threshold value"
        );
        require(
            num > 0,
            "SminemNFT::nfts minted per transfers amount reaching threshold equals 0"
        );
        _updateTransfersAndMintDataBeforeChange();

        mintingPerThreshold = num;
        emit TokensMintedPerCall(num);
    }

    /**
    * @dev Mints tokens for all the provided `receivers`
    *
    * Every time transfers value on `token` is multiple of `multiplicityOfTokenTransfers`,
    * you can mint `mintingPerThreshold`.
    *
    * Requirements:
    *
    * - `receivers` cannot be larger than 30 entries
    * - `receivers` should be less or equal to amounts possible to mint. See {SminemNFT-getPossibleMintsAmount`}.
    */
    function mint(address[] calldata receivers) external onlyMinter returns (uint256[] memory) {
        // The upper bound is set to 30, which is < 5'000'000 gas.
        require(
            receivers.length <= 30,
            "SminemNFT::can't mint more than 30 tokens at once"
        );
        require(
            receivers.length <= getPossibleMintsAmount(),
            "SminemNFT::excessive amount of token recipients"
        );

        uint256[] memory mintedTokenIds = new uint256[](receivers.length);
        string memory _baseUri = baseUri;
        for (uint8 i = 0; i < receivers.length; i++) {
            uint256 newTokenId = totalSupply();
            string memory newTokenUri = string(abi.encodePacked(_baseUri, newTokenId.toString()));

            _safeMint(receivers[i], newTokenId);
            _setTokenURI(newTokenId, newTokenUri);

            mintedTokenIds[i] = newTokenId;
        }
        return mintedTokenIds;
    }

    /**
     * @dev Gets tokens owned by the `account`.
     *
     * *Warning*. Never call on-chain. Call only using web3 "call" method!
     */
    function tokensOfOwner(address account) external view returns (uint256[] memory ownerTokens) {
        uint256 tokenAmount = balanceOf(account);
        if (tokenAmount == 0) {
            return new uint256[](0);
        } else {
            uint256[] memory output = new uint256[](tokenAmount);
            for (uint256 index = 0; index < tokenAmount; index++) {
                output[index] = tokenOfOwnerByIndex(account, index);
            }
            return output;
        }
    }

    /**
     * @dev Gets a possible amount of mints with the global values of `multiplicityOfTokenTransfers`
     * and `mintingPerThreshold`.
     *
     * For example, totally X amount of NFTs were minted with current globals.
     * Transfers on `token` reached amount of Y. So you can mint:
     * `mintingPerThreshold` * (Y//`multiplicityOfTokenTransfers`) - X.
     */
    function getPossibleMintsAmount() public view returns (uint256) {
        uint256 possibleTimesToMint = _actualTransfersAmount().div(multiplicityOfTokenTransfers);
        uint256 actualMints = _getMintedWithCurrentGlobals();
        return (mintingPerThreshold.mul(possibleTimesToMint)).sub(actualMints);
    }

    /**
     * @dev Performs safe mint with checking whether receiver is a contract that implements
     * `IERC721Receiver` interface.
     *
     * ERC721Enumerable doesn't have safeMint implementation, so we have to implement our own.
     */
    function _safeMint(address to, uint256 tokenId) internal {
        ERC721Enumerable._mint(to, tokenId);
        require(
            _checkOnERC721Received(address(0), to, tokenId, ""),
            "SminemNFT::transfer to non ERC721Receiver implementer contract");
    }

    /**
     * @dev Updates `_transfersBeforeChaningMultiplicity` and `_mintedBeforeChangingMultiplicity`
     * when globals are changed.
     *
     * The idea is to "use" for calculation of amount of possible NFTs mints only those transfer amounts
     * of the observed token, which weren't "used" for minting. This operation is needed, because
     * changing globals sometimes can freeze `mint` function for a long time.
     * For example:
     * 1. Multiplicity  = 100
     * 2. Tokens per threshold = 5.
     * 3. Transfers = 1520.
     * 4. Minted amount = 63 (not `totalSupply`).
     * 5. Available to mint = (1520//100) * 5 - 63 = 12
     * If we change multiplicity to 200, then available to mint amount will be (1520//200) * 5 - 63 = -28.
     * But what we do here, is count for the next globals only "unused transfers like this":
     * (1520-1300)//200 * 5 - 0 = 5.
     *
     * To understand how we got "1300" read {SminemNFT-_getMinimumTransfersForMintAmount}.
     *
     * Should be mentioned that we update the minted amount as well. We nullify it, because
     * for the "rest" transfers no NFTs were actually minted. So actual amount of NFTs minted
     * with current globals is: totalSupply - _mintedBeforeChangingMultiplicity.
     *
     */
    function _updateTransfersAndMintDataBeforeChange() private {
        uint256 mintedWithCurrentMultiplicity = _getMintedWithCurrentGlobals();
        uint256 transfersForMintedWithCurrentMultiplicity = _getMinimumTransfersForMintAmount(
            mintedWithCurrentMultiplicity
        );
        if (transfersForMintedWithCurrentMultiplicity > 0) {
            _transfersBeforeChaningMultiplicity = _transfersBeforeChaningMultiplicity.add(
                transfersForMintedWithCurrentMultiplicity
            );
            // todo equal to totalSupply?
            _mintedBeforeChangingMultiplicity = _mintedBeforeChangingMultiplicity.add(
                mintedWithCurrentMultiplicity
            );
        }
    }

    /**
     * @dev Gets an amount of transfers needed to calculate possible mints.
     *
     * For more details read {SminemNFT-_updateTransfersAndMintDataBeforeChange}
     */
    function _actualTransfersAmount() private view returns(uint256) {
        return token.getNumberOfTransfers().sub(_transfersBeforeChaningMultiplicity);
    }

    /**
     * @dev Gets an amount of NFTs minted with current globals.
     *
     * For more details read {SminemNFT-_updateTransfersAndMintDataBeforeChange}
     */
    function _getMintedWithCurrentGlobals() private view returns (uint256) {
        return totalSupply().sub(_mintedBeforeChangingMultiplicity);
    }

    /**
     * @dev Gets a minimum amount of transfers needed to mint an `amount` of tokens.
     *
     * Transfers = (`amount`/`mintingPerThreshold`) * currentMultiplicity.
     *
     * *Important*. If we have minted 63 tokens with globals
     * - multiplicityOfTokenTransfers = 100;
     * - mintingPerThreshold = 5;
     * then the `Transfers` value will be 1260. However, 1260 transfers could only be used to
     * mint 10 tokens ((1260//100) * 5). In such cases we take the larger multiple of multiplicityOfTokenTransfers.
     * In this case it's 1300.
     */
    function _getMinimumTransfersForMintAmount(uint256 amount) private view returns (uint256) {
        if (amount > 0) {
            uint256 currentMultiplicity = multiplicityOfTokenTransfers;
            // multiply by 1e12 to avoid zero rounding
            uint256 transfersForMintedWithCurrentMultiplicity = (amount.mul(1e12))
                .div(mintingPerThreshold)
                .mul(currentMultiplicity)    
                .div(1e12);
            transfersForMintedWithCurrentMultiplicity = transfersForMintedWithCurrentMultiplicity.mod(currentMultiplicity) == 0 ? 
                transfersForMintedWithCurrentMultiplicity : (
                    (transfersForMintedWithCurrentMultiplicity.div(currentMultiplicity)).add(1)
                ).mul(currentMultiplicity);
            return transfersForMintedWithCurrentMultiplicity;
        }
        return 0;
    }
}
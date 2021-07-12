pragma solidity 0.5.7;

import "./ITransferCounter.sol";
import "./Strings.sol";
import "openzeppelin-solidity/contracts/token/ERC721/ERC721Full.sol";
import "openzeppelin-solidity/contracts/access/roles/MinterRole.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";

contract SminemNFT is ERC721Full, MinterRole, Ownable {
    using SafeMath for uint256;
    using Strings for uint256;

    IERC20TransferCounter public token;

    string public baseUri;

    uint256 public mintingPerThreshold;
    uint256 public multiplicityOfTokenTransfers;

    uint256 private _transfersBeforeChaningMultiplicity;
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

    function setNewTokenAddress(IERC20TransferCounter _token) external onlyOwner {
        require(address(_token) != address(0), "SminemNFT::zero token address");
        require(address(token) != address(_token), "SminemNFT::setting the same address");

        token = _token;
        emit TokenAddress(_token);
    }

    // todo set new
    function setBaseUri(string calldata _baseUri) external onlyOwner {
        require(bytes(_baseUri).length > 0, "SminemNFT::empty base uri string");

        baseUri = _baseUri;
        emit BaseUri(_baseUri);
    }

    // todo set new
    function setTransfersMultiplicity(uint256 num) external onlyOwner {
        require(
            num > 0,
            "SminemNFT::multiplicity of transfers equals 0"
        );
        uint256 mintedWithCurrentMultiplicity = _getMintedDuringCurrentMultiplicity();
        uint256 transfersForMintedWithCurrentMultiplicity = _getMinimumTransfersForMintAmount(
            mintedWithCurrentMultiplicity
        );
        _transfersBeforeChaningMultiplicity = _transfersBeforeChaningMultiplicity.add(
            transfersForMintedWithCurrentMultiplicity
        );
        // todo equal to totalSupply?
        _mintedBeforeChangingMultiplicity = _mintedBeforeChangingMultiplicity.add(
            mintedWithCurrentMultiplicity
        );

        multiplicityOfTokenTransfers = num;
        emit TransferMultiplicity(num);
    }

    // todo set new
    function setTokensMintedPerThreshold(uint256 num) external onlyOwner {
        require(
            num > 0,
            "SminemNFT::nfts minted per transfers amount reaching threshold equals 0"
        );

        mintingPerThreshold = num;
        emit TokensMintedPerCall(num);
    }

    /**
    * Every time transfers on `token` is multiple of `multiplicityOfTokenTransfers`,
    * you can mint `tokensMintedPerThreshold`.
    *
    * For example, totally X amount of NFTs were minted. Transfers on `token` reached amount of Y.
    * So you can mint: `tokensMintedPerThreshold` * (Y//`multiplicityOfTokenTransfers`) - X.
    *
    */
    function mint(address[] calldata receivers) external onlyMinter returns (uint256[] memory) {
        // The upper bound is set to 30, which is < 5'000'000 gas.
        require(
            receivers.length <= 30,
            "SminemNFT::can't mint more than 255 tokens at once"
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

    // [Warning]: never call on-chain. Call only using web3 "call" method!
    function tokensOfOwner(address user) external view returns (uint256[] memory ownerTokens) {
        uint256 tokenAmount = balanceOf(user);
        if (tokenAmount == 0) {
            return new uint256[](0);
        } else {
            uint256[] memory output = new uint256[](tokenAmount);
            for (uint256 index = 0; index < tokenAmount; index++) {
                output[index] = tokenOfOwnerByIndex(user, index);
            }
            return output;
        }
    }

    function getPossibleMintsAmount() public view returns (uint256) {
        uint256 possibleTimesToMint = _actualTransfersAmount().div(multiplicityOfTokenTransfers);
        uint256 actualMints = _getMintedDuringCurrentMultiplicity();
        return (mintingPerThreshold.mul(possibleTimesToMint)).sub(actualMints);
    }

    // ERC721Enumerable doesn't have safeMint implementation
    function _safeMint(address to, uint256 tokenId) internal {
        ERC721Enumerable._mint(to, tokenId);
        require(
            _checkOnERC721Received(address(0), to, tokenId, ""),
            "SminemNFT::transfer to non ERC721Receiver implementer");
    }

    function _actualTransfersAmount() private view returns(uint256) {
        return token.getNumberOfTransfers().sub(_transfersBeforeChaningMultiplicity);
    }

    function _getMintedDuringCurrentMultiplicity() private view returns (uint256) {
        return totalSupply().sub(_mintedBeforeChangingMultiplicity);
    }

    function _getMinimumTransfersForMintAmount(uint256 amount) private view returns (uint256) {
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
}
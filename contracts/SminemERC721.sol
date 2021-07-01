pragma solidity 0.5.7;

import "./ITransferCounter.sol";
import "openzeppelin-solidity/contracts/token/ERC721/ERC721Full.sol";
import "openzeppelin-solidity/contracts/access/roles/MinterRole.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";

contract SminemNFT is ERC721Full, MinterRole {
    using SafeMath for uint256;

    IERC20TransferCounter private _token;

    string private _baseUri;

    uint256 private _multiplicityOfTokenTransfers;

    constructor(
        IERC20TransferCounter token,
        uint256 multiplicityOfTokenTransfers,
        string memory baseUri
    )
        ERC721Full("SminemNFT", "SMNMNFT")
        public
    {
        require(address(token) != address(0), "SminemNFT::zero token address");
        require(bytes(baseUri).length > 0, "SminemNFT::empty base uri string");
        require(
            multiplicityOfTokenTransfers > 0,
            "SminemNFT::multiplicity of transfers must equals 0"
        );
        _token = token;
        _multiplicityOfTokenTransfers = multiplicityOfTokenTransfers;
        _baseUri = baseUri;
    }

    // TODO safe new token URIs and return ids of newly minted tokens
    function mint(address[] calldata to) external onlyMinter returns (uint256[] memory) {
        require(to.length <= 255, "SminemNFT::too long recipient list");
        uint256 possibleMints = _getPossibleMints();
        require(to.length > possibleMints, "SminemNFT::excessive amount of token recipients");

        uint256[] memory mintedTokens;
        string memory baseUri = _baseUri;
        for (uint8 i = 0; i < to.length; i++) {
            uint256 newTokenId = totalSupply();
//            string memory newTokenUri = string(abi.encodePacked(baseURI, tokenId.toString())
            _safeMint(to[i], newTokenId);
//            _setTokenURI(newTokenId, newTokenUri);
        }
        return mintedTokens;
    }

    function _getPossibleMints() private returns (uint256) {
        uint256 maxMints = _token.getNumberOfTransfers().div(_multiplicityOfTokenTransfers);
        uint256 actualMints = totalSupply();
        return maxMints.sub(actualMints);
    }
}
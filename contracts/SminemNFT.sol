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

    function setTransfersMultiplicity(uint256 num) external onlyOwner {
        require(
            num > 0,
            "SminemNFT::multiplicity of transfers equals 0"
        );

        multiplicityOfTokenTransfers = num;
        emit TransferMultiplicity(num);
    }

    function setTransfersMultiplicity(string calldata _baseUri) external onlyOwner {
        require(bytes(_baseUri).length > 0, "SminemNFT::empty base uri string");

        baseUri = _baseUri;
        emit BaseUri(_baseUri);
    }

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
    * For example, we totally X NFTs were minted. Transfers on `token` reached amount of Y.
    * So you can mint: `tokensMintedPerThreshold` * ( (Y-X)//`multiplicityOfTokenTransfers` )
    *
    */
    function mint(address[] calldata to) external onlyMinter returns (uint256[] memory) {
        // made for Loop length control
        require(
            to.length <= 255,
            "SminemNFT::can't mint more than 255 tokens at once"
        );
        require(to.length <= _getPossibleMints(), "SminemNFT::excessive amount of token recipients");

        uint256[] memory mintedTokenIds = new uint256[](to.length);
        string memory _baseUri = baseUri;
        for (uint8 i = 0; i < to.length; i++) {
            uint256 newTokenId = totalSupply();
            string memory newTokenUri = string(abi.encodePacked(_baseUri, newTokenId.toString()));
            _safeMint(to[i], newTokenId);
            _setTokenURI(newTokenId, newTokenUri);
            mintedTokenIds[i] = newTokenId;
        }
        return mintedTokenIds;
    }

    function _getPossibleMints() private view returns (uint256) {
        uint256 maxMints = token.getNumberOfTransfers().div(multiplicityOfTokenTransfers);
        uint256 actualMints = totalSupply();
        return mintingPerThreshold.mul(maxMints.sub(actualMints));
    }
}
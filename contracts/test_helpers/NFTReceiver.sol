pragma solidity 0.5.7;

import "openzeppelin-solidity/contracts/token/ERC721/IERC721Receiver.sol";

contract NFTReceiver is IERC721Receiver {

    bytes4 constant receiver = bytes4(keccak256("onERC721Received(address,address,uint256,bytes)"));
    function onERC721Received(address operator, address from, uint256 tokenId, bytes memory data)
        public 
        returns (bytes4) 
    {
        return receiver;
    }
}
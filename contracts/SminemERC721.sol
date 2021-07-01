pragma solidity 0.5.7;

import "openzeppelin-solidity/contracts/token/ERC721/ERC721Full.sol";
import "openzeppelin-solidity/contracts/access/roles/MinterRole.sol";

contract SminemNFT is ERC721Full, MinterRole {

    constructor() ERC721Full("SminemNFT", "SMNMNFT") public {}

    function mint(address[] calldata to) external onlyMinter returns (uint256) {
        /**
          * Минт осуществляется с id, равным total supply
          * Проверяешь какое количество токенов возможно сминтить исходя из счетчика на токене:
          * - либо erc721 обращается в момент вызова этой функции к токену
          * - либо токен сообщает, какое количество токенов можно сминтить контракту nft
          * О том как устанавливать для новых токенов URI - смотри в новой реализации openzeppelin
          */
        return 1;
    }
}
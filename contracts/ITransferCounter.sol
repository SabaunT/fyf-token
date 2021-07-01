pragma solidity 0.5.7;

import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";

interface IERC20TransferCounter is IERC20 {
    function getNumberOfTransfers() external view returns (uint256);
}

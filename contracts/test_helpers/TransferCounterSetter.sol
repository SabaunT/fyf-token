pragma solidity 0.5.7;

import "../SminemERC20.sol";

contract TransferCounterSetter is SminemERC20 {

    constructor() public SminemERC20("Test", "TST", 9, 100000) {}

    function setTransferAmount(uint256 value) external {
        // this is done for the test sake, should never be done in production
        _transferCounter._value = value;
    }
}

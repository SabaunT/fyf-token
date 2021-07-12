pragma solidity 0.5.7;

import "../FYFToken.sol";

contract TransferCounterSetter is FYFToken {

    constructor() public FYFToken("Test", "TST", 9, 100000) {}

    function setTransferAmount(uint256 value) external {
        // this is done for the test sake, should never be done in production
        _transferCounter._value = value;
    }
}

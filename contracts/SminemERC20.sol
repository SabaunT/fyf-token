pragma solidity 0.5.7;

import "./ERC20.sol";
import "./ITransferCounter.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20Detailed.sol";
import "openzeppelin-solidity/contracts/drafts/Counters.sol";

/**
 * @dev Implementation of the deflationary mechanism within ERC20 token based on
 * https://github.com/reflectfinance/reflect-contracts/blob/main/contracts/REFLECT.sol.
 *
 * Term "actual" regarding token balance means a token balance of an account with earned
 * fees from transactions made by token holders. This balance isn't stored anywhere, but
 * it's calculated using the reflection rate and reflected balance of an account.
 */
contract SminemERC20 is Ownable, ERC20Detailed, ERC20, IERC20TransferCounter {
    using Counters for Counters.Counter;

    // Convenience type for a more neat transfer logic implementation
    struct TransferData {
        uint256 sendingAmount;
        uint256 receivingAmount;
        uint256 fee;
        uint256 sendingInnerAmount;
        uint256 receivingInnerAmount;
        uint256 innerFee;
    }

    // Percent of transfer distributed between token holders
    uint256 private constant _feePercent = 1;

    // Balances excluded from earning fees. For more details read {SminemERC20-excludeAccount}.
    mapping (address => bool) private _isExcluded;
    // Inner representation of the total supply, which is just another dimension.
    mapping(address => uint256) private _innerBalances;

    // Transfer counter used by SminemNFT
    Counters.Counter internal _transferCounter;

    uint256 private _feeDistributedTotal;
    uint256 private _innerTotalSupply;
    uint256 private _excludedAmount;
    uint256 private _excludedInnerAmount;
    uint256 private _lastRateBeforeChopperIsOn;

    bool private _isFeeChopperOn;

    event AccountExcluded(address indexed account);
    event AccountIncluded(address indexed account);

    // TODO waiting for constants from founders
    constructor(string memory name, string memory symbol, uint8 decimals, uint256 supply)
        ERC20Detailed(name, symbol, decimals)
        public
    {
        require(bytes(name).length > 0, "SminemERC20::empty token name string");
        require(bytes(symbol).length > 0, "SminemERC20::empty token name string");
        require(decimals != 0, "SminemERC20::decimals can't be zero");

        _totalSupply = supply * 10**uint256(decimals);
        uint256 _MAX = ~uint256(0);
        _innerTotalSupply = _MAX - (_MAX % _totalSupply);
        _innerBalances[_msgSender()] = _innerTotalSupply;

        emit Transfer(address(0), _msgSender(), _totalSupply);
    }

    function excludeAccount(address account) external onlyOwner {
        require(address(0) != account, "SminemERC20::excluding zero address");
        require(!_isExcluded[account], "SminemERC20::account is already excluded");

        uint256 innerBalance = _innerBalances[account];
        if (innerBalance > 0) {
            uint256 balance = _convertInnerToOuter(innerBalance);

            _balances[account] = balance;

            _increaseExcludedValues(balance, innerBalance);
        }
        _isExcluded[account] = true;

        emit AccountExcluded(account);
    }

    function includeAccount(address account) external onlyOwner {
        require(_isExcluded[account], "SminemERC20::account is not excluded");

        uint256 rate = _getCurrentReflectionRate();
        uint256 balance = _balances[account];
        uint256 newInnerBalance = balance.mul(rate);

        _decreaseExcludedValues(balance, newInnerBalance);

        // [DOCS] state in docs behaviour when _reflectedBalances[account] isn't changed
        _innerBalances[account] = newInnerBalance;
        _balances[account] = 0;
        _isExcluded[account] = false;

        emit AccountIncluded(account);
    }

    function getNumberOfTransfers() external view returns (uint256) {
        return _transferCounter.current();
    }

    function isExcluded(address account) external view returns (bool) {
        return _isExcluded[account];
    }

    function totalFees() external view returns (uint256) {
        return _feeDistributedTotal;
    }

    /**
     * @dev An override of the classical implementation
     */
    function balanceOf(address account) public view returns (uint256) {
        if (_isExcluded[account])
            return ERC20.balanceOf(account);
        return _convertInnerToOuter(_innerBalances[account]);
    }

    /**
     * @dev An override of the classical implementation
     */
    function _transfer(address sender, address recipient, uint256 amount) internal {
        require(sender != address(0), "SminemERC20::transfer from the zero address");
        require(recipient != address(0), "SminemERC20::transfer to the zero address");
        require(amount > 0, "SminemERC20::transfer amount must be greater than zero");

        TransferData memory td = _getTransferData(amount);

        _innerBalances[sender] = _innerBalances[sender].sub(td.sendingInnerAmount);
        _innerBalances[recipient] = _innerBalances[recipient].add(td.receivingInnerAmount);
        
        if (!_isExcluded[sender] && _isExcluded[recipient]) {
            _balances[recipient] = _balances[recipient].add(td.receivingAmount);
            _increaseExcludedValues(td.receivingAmount, td.receivingInnerAmount);
        } else if (_isExcluded[sender] && !_isExcluded[recipient]) {
            _balances[sender] = _balances[sender].sub(td.sendingAmount);
            _decreaseExcludedValues(td.sendingAmount, td.sendingInnerAmount);
        } else if (_isExcluded[sender] && _isExcluded[recipient]) {
            _balances[sender] = _balances[sender].sub(td.sendingAmount);
            _balances[recipient] = _balances[recipient].add(td.receivingAmount);
            _decreaseExcludedValues(td.fee, td.innerFee);
        }

        if (_canTakeNDistributeFees())
            _reflectFee(td.innerFee, td.fee);
        _transferCounter.increment();
        emit Transfer(sender, recipient, td.receivingAmount);
    }

    function _reflectFee(uint256 innerFee, uint256 outerFee) private {
        // !
        uint256 newInnerTotalSupply = _innerTotalSupply.sub(innerFee);
        if (newInnerTotalSupply < _excludedInnerAmount) {
            _lastRateBeforeChopperIsOn = _getCurrentReflectionRate();
            _isFeeChopperOn = true;
        }
        _innerTotalSupply = newInnerTotalSupply;
        _feeDistributedTotal = _feeDistributedTotal.add(outerFee);
    }

    function _increaseExcludedValues(uint256 amount, uint256 innerAmount) private {
        // !
        uint256 newExcludedInnerAmount = _excludedInnerAmount.add(innerAmount);
        // Original check from here https://github.com/reflectfinance/reflect-contracts/blob/6a92595bb0ff405c67a6d285d4c064b7f7276e15/contracts/REFLECT.sol#L244,
        // but instead we return last "valid" rate.
        if (_canTakeNDistributeFees() &&
            _innerTotalSupply.sub(newExcludedInnerAmount) < _innerTotalSupply.div(_totalSupply)
        ) {
            _stopFees();
        }
        _excludedAmount = _excludedAmount.add(amount);
        _excludedInnerAmount = newExcludedInnerAmount;
    }

    function _decreaseExcludedValues(uint256 amount, uint256 innerAmount) private {
        // !
        uint256 newExcludedInnerAmount = _excludedInnerAmount.sub(innerAmount);
        if (_cannotTakeNDistributeFees() &&
            _innerTotalSupply > newExcludedInnerAmount &&
            _innerTotalSupply.sub(newExcludedInnerAmount) > _innerTotalSupply.div(_totalSupply)
        ) {
            _enableFees();
        }
        _excludedAmount = _excludedAmount.sub(amount);
        _excludedInnerAmount = newExcludedInnerAmount;
    }

    function _stopFees() private {
        _lastRateBeforeChopperIsOn = _getCurrentReflectionRate();
        _isFeeChopperOn = true;
    }

    function _enableFees() private {
        _isFeeChopperOn = false;
    }

    // Just to make code more readable
    function _cannotTakeNDistributeFees() private view returns (bool) {
        return _isFeeChopperOn;
    }

    // Just to make code more readable
    function _canTakeNDistributeFees() private view returns (bool) {
        return !_isFeeChopperOn;
    }

    function _convertInnerToOuter(uint256 innerAmount) private view returns (uint256) {
        uint256 rate = _getCurrentReflectionRate();
        return innerAmount.div(rate);
    }

    function _getTransferData(uint256 amount) private view returns (TransferData memory) {
        (uint256 receivingAmount, uint256 fee) = _getTransferDataFromExternalValues(amount);
        (
            uint256 innerSendingAmount,
            uint256 innerReceivingAmount,
            uint256 innerFee
        ) = _getTransferDataFromInnerValues(amount, fee);
        return TransferData(
            amount,
            receivingAmount,
            fee,
            innerSendingAmount,
            innerReceivingAmount,
            innerFee
        );
    }

    function _getTransferDataFromExternalValues(uint256 amount) private view returns (uint256, uint256) {
        uint256 fee = 0;
        if (_canTakeNDistributeFees())
            fee = amount.mul(_feePercent).div(100);
        uint256 receivingAmount = amount.sub(fee);
        return (receivingAmount, fee);
    }

    function _getTransferDataFromInnerValues(uint256 amount, uint256 fee)
        private
        view
        returns (uint256, uint256, uint256)
    {
        uint256 rate = _getCurrentReflectionRate();
        uint256 innerSendingAmount = amount.mul(rate);
        uint256 innerFee = fee.mul(rate);
        uint256 innerReceivingAmount = innerSendingAmount.sub(innerFee);
        return (innerSendingAmount, innerReceivingAmount, innerFee);
    }

    function _getCurrentReflectionRate() private view returns (uint256) {
        if (_isFeeChopperOn)
            return _lastRateBeforeChopperIsOn;
        uint256 innerTotalSupply = _innerTotalSupply.sub(_excludedInnerAmount);
        uint256 totalSupply = _totalSupply.sub(_excludedAmount);
        return innerTotalSupply.div(totalSupply);
    }

    // [DOCS] check if this is ever called (also exclude and include) on etherscan address from here
    //https://perafinance.medium.com/safemoon-is-it-safe-though-a-detailed-explanation-of-frictionless-yield-bug-338710649846
    // https://etherscan.io/tx/0xad155519128e701aded6b82bea62039d82d1eda5dd1ddb504c296696965b5a62
    // reflect fn can be added with proxy - state in docs
    // [INFO]: The check `_excludedAmount > totalSupply` is needed only when burn happens
}


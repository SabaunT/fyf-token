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

    struct TransferData {
        uint256 amount;
        uint256 cleanedAmount;
        uint256 fee;
        uint256 innerAmount;
        uint256 innerCleanedAmount;
        uint256 innerFee;
    }

    uint256 private constant _feePercent = 1;

    mapping (address => bool) private _isExcluded;
    mapping(address => uint256) private _innerBalances;

    Counters.Counter internal _transferCounter;

    uint256 private _feeDistributedTotal;
    uint256 private _innerTotalSupply;
    uint256 private _excludedAmount;
    uint256 private _excludedInnerAmount;

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
            uint256 balance = _convertInnerToActual(innerBalance);

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
        return _convertInnerToActual(_innerBalances[account]);
    }

    /**
     * @dev An override of the classical implementation
     */
    function _transfer(address sender, address recipient, uint256 amount) internal {
        require(sender != address(0), "SminemERC20::transfer from the zero address");
        require(recipient != address(0), "SminemERC20::transfer to the zero address");
        require(amount > 0, "SminemERC20::transfer amount must be greater than zero");

        TransferData memory td = _getTransferData(amount);

        _innerBalances[sender] = _innerBalances[sender].sub(td.innerAmount);
        _innerBalances[recipient] = _innerBalances[recipient].add(td.innerCleanedAmount);
        
        if (!_isExcluded[sender] && _isExcluded[recipient]) {
            _balances[recipient] = _balances[recipient].add(td.cleanedAmount);
            _increaseExcludedValues(td.cleanedAmount, td.innerCleanedAmount);
        } else if (_isExcluded[sender] && !_isExcluded[recipient]) {
            _balances[sender] = _balances[sender].sub(td.amount);
            _decreaseExcludedValues(td.amount, td.innerAmount);
        } else if (_isExcluded[sender] && _isExcluded[recipient]) {
            _balances[sender] = _balances[sender].sub(td.amount);
            _balances[recipient] = _balances[recipient].add(td.cleanedAmount);
            _decreaseExcludedValues(td.fee, td.innerFee);
        }

        _reflectFee(td.innerFee, td.fee);
        _transferCounter.increment();
        emit Transfer(sender, recipient, td.cleanedAmount);
    }

    function _reflectFee(uint256 innerFee, uint256 outerFee) private {
        _innerTotalSupply = _innerTotalSupply.sub(innerFee);
        _feeDistributedTotal = _feeDistributedTotal.add(outerFee);
    }

    function _increaseExcludedValues(uint256 amount, uint256 innerAmount) private {
        _excludedAmount = _excludedAmount.add(amount);
        _excludedInnerAmount = _excludedInnerAmount.add(innerAmount);
    }

    function _decreaseExcludedValues(uint256 amount, uint256 innerAmount) private {
        _excludedAmount = _excludedAmount.sub(amount);
        _excludedInnerAmount = _excludedInnerAmount.sub(innerAmount);
    }

    function _convertInnerToActual(uint256 innerAmount) private view returns (uint256) {
        uint256 rate = _getCurrentReflectionRate();
        return innerAmount.div(rate);
    }

    function _getTransferData(uint256 amount) private view returns (TransferData memory) {
        (uint256 tokenCleanedAmount, uint256 tokenFee) = _getTransferDataWithExternalValues(amount);
        (
            uint256 innerAmount,
            uint256 innerCleanedAmount,
            uint256 innerFee
        ) = _getTransferDataWithInnerValues(amount, tokenFee);
        return TransferData(
            amount,
            tokenCleanedAmount,
            tokenFee,
            innerAmount,
            innerCleanedAmount,
            innerFee
        );
    }

    function _getTransferDataWithExternalValues(uint256 amount) private pure returns (uint256, uint256) {
        uint256 fee = amount.mul(_feePercent).div(100);
        uint256 cleanedAmount = amount.sub(fee);
        return (cleanedAmount, fee);
    }

    function _getTransferDataWithInnerValues(uint256 amount, uint256 fee)
        private
        view
        returns (uint256, uint256, uint256)
    {
        uint256 rate = _getCurrentReflectionRate();
        uint256 innerAmount = amount.mul(rate);
        uint256 innerFee = fee.mul(rate);
        uint256 innerCleanedAmount = innerAmount.sub(innerFee);
        return (innerAmount, innerCleanedAmount, innerFee);
    }

    function _getCurrentReflectionRate() private view returns (uint256) {
        (uint256 reflectedTotalSupply, uint256 totalSupply) = _getCurrentSupplyValues();
        return reflectedTotalSupply.div(totalSupply);
    }

    function _getCurrentSupplyValues() private view returns (uint256, uint256) {
        uint256 innerTotalSupply = _innerTotalSupply;
        uint256 totalSupply = _totalSupply;

        // [INFO]: The check `_excludedAmount > totalSupply` is needed only when burn happens
        if (_excludedInnerAmount > innerTotalSupply)
            return (innerTotalSupply, totalSupply);

        innerTotalSupply = innerTotalSupply.sub(_excludedInnerAmount);
        totalSupply = totalSupply.sub(_excludedAmount);

        // todo случай ясен, мы просто очень много вычленили из tS (приведи расчеты). что с этим делать? правильно ли сейчашнее решение
        if (innerTotalSupply < _innerTotalSupply.div(_totalSupply))
            return (_innerTotalSupply, _totalSupply);
        return (innerTotalSupply, totalSupply);
    }

    // [DOCS] check if this is ever called (also exclude and include) on etherscan address from here
    //https://perafinance.medium.com/safemoon-is-it-safe-though-a-detailed-explanation-of-frictionless-yield-bug-338710649846
    // https://etherscan.io/tx/0xad155519128e701aded6b82bea62039d82d1eda5dd1ddb504c296696965b5a62
    // reflect fn can be added with proxy - state in docs
}


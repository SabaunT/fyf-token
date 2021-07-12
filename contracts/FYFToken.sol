pragma solidity 0.5.7;

import "./ERC20.sol";
import "./ITransferCounter.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20Detailed.sol";
import "openzeppelin-solidity/contracts/drafts/Counters.sol";

/**
 * @title Frictionless yield farming token.
 * @author SabaunT https://github.com/SabaunT.
 * @notice Distributes between holders fees taken from each transfer.
 * The "inner" and "outer" value and all the other terms not described here
 * are explained in `README.md`.
 * @dev Implementation is pretty much the same as here:
 * https://github.com/reflectfinance/reflect-contracts/blob/main/contracts/REFLECT.sol.
 * Still there are some differences about excluding and including accounts and some other stuff.
 */
contract FYFToken is Ownable, ERC20Detailed, ERC20, IERC20TransferCounter {
    using Counters for Counters.Counter;

    // Convenience type for a more neat transfer logic implementation.
    struct TransferData {
        uint256 amount;
        uint256 cleanedAmount;
        uint256 fee;
        uint256 innerAmount;
        uint256 innerCleanedAmount;
        uint256 innerFee;
    }

    // Percent of transfer amount distributed between token holders.
    uint256 private constant _feePercent = 1;

    // Balances excluded from earning fees. For more details read {FYFToken-excludeAccount}.
    mapping (address => bool) private _isExcluded;
    // Inner representation of the original ERC20 `_balances`.
    mapping(address => uint256) private _innerBalances;

    // Counter of transfers. Used by contracts, which interact with IERC20TransferCounter.
    Counters.Counter internal _transferCounter;

    // Total fees distributed, the "outer" value.
    uint256 private _feeDistributedTotal;
    uint256 private _innerTotalSupply;
    // Sum of balances of excluded accounts (outer value).
    uint256 private _excludedAmount;
    // Sum of balances of excluded accounts (inner value).
    uint256 private _excludedInnerAmount;

    event AccountExcluded(address indexed account);
    event AccountIncluded(address indexed account);

    // TODO waiting for constants from founders
    constructor(string memory name, string memory symbol, uint8 decimals, uint256 supply)
        ERC20Detailed(name, symbol, decimals)
        public
    {
        require(bytes(name).length > 0, "FYFToken::empty token name string");
        require(bytes(symbol).length > 0, "FYFToken::empty token name string");
        require(decimals != 0, "FYFToken::decimals can't be zero");

        _totalSupply = supply * 10**uint256(decimals);
        uint256 _MAX = ~uint256(0);
        _innerTotalSupply = _MAX - (_MAX % _totalSupply);
        _innerBalances[_msgSender()] = _innerTotalSupply;

        emit Transfer(address(0), _msgSender(), _totalSupply);
    }

    /**
     * @dev Excludes account from earning fees.
     *
     * Account exclusion mustn't change the rate. Exclusion could be used to
     * take an opportunity of earning fees from addresses, which can potentially
     * centralize fee distribution. These are:
     * - liquidity pools,
     * - exchanges,
     * - founders,
     * - big stake holders
     * - and e.t.c.
     *
     * If a balance is excluded, it manages not only it's inner balance, but the outer as well.
     * This allows not calculating a proper rate for excluded addresses to convert their inner
     * balances to the outer representation without fees.
     *
     * Emits a {AccountExcluded} event.
     *
     * Requirements:
     *
     * - `account` cannot be the zero address.
     * - `account` cannot be excluded.
     * - `msg.sender` is the owner.
     */
    function excludeAccount(address account) external onlyOwner {
        require(address(0) != account, "FYFToken::excluding zero address");
        require(!_isExcluded[account], "FYFToken::account is already excluded");

        uint256 innerBalance = _innerBalances[account];
        if (innerBalance > 0) {
            uint256 balance = _convertInnerToActual(innerBalance);

            _balances[account] = balance;

            _increaseExcludedValues(balance, innerBalance);
        }
        _isExcluded[account] = true;

        emit AccountExcluded(account);
    }

    /**
     * @dev Includes excluded account to earning fees protocol.
     *
     * Account inclusion mustn't change the rate. If account inclusion changes
     * the rate we can face situation when all other included balances get a lower
     * outer balance after the function call.
     *
     * Function changes inner representation of the outer balance, resetting it
     * using the current rate. If it's not done, then we will face the bug, described
     * earlier.
     *
     * Emits a {AccountIncluded} event.
     *
     * Requirements:
     *
     * - `account` - must be excluded
     * - `msg.sender` is the owner.
     */
    function includeAccount(address account) external onlyOwner {
        require(_isExcluded[account], "FYFToken::account is not excluded");

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

    /**
     * @dev Get's the number of transfers made in the contract.
     */
    function getNumberOfTransfers() external view returns (uint256) {
        return _transferCounter.current();
    }

    /**
     * @dev Returns total amount of fees, distributed between holders.
     *
     * Values is shown in outer dimension.
     */
    function totalFees() external view returns (uint256) {
        return _feeDistributedTotal;
    }

    /**
     * @dev An override of the classical implementation.
     *
     * For more details why excluded accounts show the outer representation without
     * dividing inner by rate read {FYFToken-excludeAccount}.
     */
    function balanceOf(address account) public view returns (uint256) {
        if (isExcluded(account))
            return ERC20.balanceOf(account);
        return _convertInnerToActual(_innerBalances[account]);
    }

    /**
     * @dev Shows whether an account is excluded.
     *
     * Requirements:
     *
     * - `account` cannot be the zero address.
     */
    function isExcluded(address account) public view returns (bool) {
        require(address(0) != account, "FYFToken::zero address can't be excluded");
        return _isExcluded[account];
    }

    /**
     * @dev An override of the classical implementation.
     *
     * Transfers `amount` in a way depending on whether `sender` and `receiver`
     * are excluded or not. If participant is excluded, then his outer balance
     * is changes as well. Sending to excluded account increases excluded amount.
     * An opposite logic is when excluded account sends to the "included" one. Also
     * excluded amount gets lower when there is a transfer between excluded accounts,
     * because an amount (fee) of the excluded senders balance is distributed between
     * included holders.
     *
     * Emits a {Transfer} event.
     *
     * Requirements:
     *
     * - `sender` cannot be the zero address.
     * - `recipient` cannot be the zero address.
     * - `sender` must have a balance of at least `amount`.
     * - `amount` cannot be zero.
     */
    function _transfer(address sender, address recipient, uint256 amount) internal {
        require(sender != address(0), "FYFToken::transfer from the zero address");
        require(recipient != address(0), "FYFToken::transfer to the zero address");
        require(amount > 0, "FYFToken::transfer amount must be greater than zero");

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

        _distributeFee(td.innerFee, td.fee);
        _transferCounter.increment();
        emit Transfer(sender, recipient, td.cleanedAmount);
    }

    /**
     * @dev Distributes fee.
     *
     * For more info look at `README.md`.
     */
    function _distributeFee(uint256 innerFee, uint256 outerFee) private {
        _innerTotalSupply = _innerTotalSupply.sub(innerFee);
        _feeDistributedTotal = _feeDistributedTotal.add(outerFee);
    }

    /**
     * @dev Increases excluded amounts.
     *
     * Called when an account is excluded or a transfer to excluded account was done.
     */
    function _increaseExcludedValues(uint256 amount, uint256 innerAmount) private {
        _excludedAmount = _excludedAmount.add(amount);
        _excludedInnerAmount = _excludedInnerAmount.add(innerAmount);
    }

    /**
     * @dev Decreases excluded amounts.
     *
     * Called when an account is included, a transfer from excluded account or between excluded
     * accounts was done.
     */
    function _decreaseExcludedValues(uint256 amount, uint256 innerAmount) private {
        _excludedAmount = _excludedAmount.sub(amount);
        _excludedInnerAmount = _excludedInnerAmount.sub(innerAmount);
    }

    /**
     * @dev Performs conversion between inner and outer balances.
     */
    function _convertInnerToActual(uint256 innerAmount) private view returns (uint256) {
        uint256 rate = _getCurrentReflectionRate();
        return innerAmount.div(rate);
    }

    /**
     * @dev Gets from transferring amount a fee amount, an amount cleaned from fees and their
     * inner representations.
     */
    function _getTransferData(uint256 amount) private view returns (TransferData memory) {
        (uint256 tokenCleanedAmount, uint256 tokenFee) = _getTransferDataWithOuterValues(amount);
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

    /**
     * @dev Gets outer transfer data.
     */
    function _getTransferDataWithOuterValues(uint256 amount) private pure returns (uint256, uint256) {
        uint256 fee = amount.mul(_feePercent).div(100);
        uint256 cleanedAmount = amount.sub(fee);
        return (cleanedAmount, fee);
    }

    /**
     * @dev Gets inner transfer data from outer transfer data.
     */
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

    /**
     * @dev Gets conversion rate between inner and outer balances.
     */
    function _getCurrentReflectionRate() private view returns (uint256) {
        (uint256 reflectedTotalSupply, uint256 totalSupply) = _getCurrentSupplyValues();
        return reflectedTotalSupply.div(totalSupply);
    }

    /**
     * @dev Gets supply values for rate calculation.
     *
     * Inner and outer total supply values are subtracted by inner and excluded amounts,
     * which are sums of balances of excluded accounts.
     *
     * The original implementation here: https://github.com/reflectfinance/reflect-contracts/blob/main/contracts/REFLECT.sol#L236
     * checks excluded values being less than supply values. Although these checks aren't required, because
     * reaching such situations seems unrealistic due to contract usage, the check `_excludedAmount < _totalSupply`
     * should be provided if `FYFToken` is going to be featured with burning mechanism (deflation).
     *
     * For example for this check https://github.com/reflectfinance/reflect-contracts/blob/main/contracts/REFLECT.sol#L244,
     * an implementation of the FYFToken was provided here https://github.com/SabaunT/fyf-token/tree/fix-for-supply-values.
     * The idea here is to stop distributing fees and to freeze the rate.
     * [WARNING] The fix-for-supply-values branch isn't fully tested.
     */
    function _getCurrentSupplyValues() private view returns (uint256, uint256) {
        uint256 innerTotalSupply = _innerTotalSupply;
        uint256 totalSupply = _totalSupply;

        innerTotalSupply = innerTotalSupply.sub(_excludedInnerAmount);
        totalSupply = totalSupply.sub(_excludedAmount);

        return (innerTotalSupply, totalSupply);
    }
}
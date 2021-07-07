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
        uint256 reflectedAmount;
        uint256 reflectedCleanedAmount;
        uint256 reflectedFee;
    }

    uint256 private constant _feePercent = 1;

    mapping (address => bool) private _isExcluded;
    mapping(address => uint256) private _reflectedBalances;

    uint256 private _feeDistributedTotal;
    uint256 private _reflectTotalSupply;
    uint256 private _excludedAmount;
    uint256 private _excludedReflectedAmount;

    Counters.Counter private _transferCounter;

    // TODO shall check supply value?
    constructor(string memory name, string memory symbol, uint8 decimals, uint256 supply)
        ERC20Detailed(name, symbol, decimals)
        public
    {
        require(bytes(name).length > 0, "SminemERC20::empty token name string");
        require(bytes(symbol).length > 0, "SminemERC20::empty token name string");
        require(decimals != 0, "SminemERC20::decimals can't be zero");

        _totalSupply = supply * 10**uint256(decimals);
        uint256 _MAX = ~uint256(0);
        _reflectTotalSupply = _MAX - (_MAX % _totalSupply);
        _reflectedBalances[_msgSender()] = _reflectTotalSupply;

        emit Transfer(address(0), _msgSender(), _totalSupply);
    }

    function excludeAccount(address account) external onlyOwner {
        require(address(0) != account, "SminemERC20::excluding zero address");
        require(!_isExcluded[account], "SminemERC20::account is already excluded");

        uint256 reflectedBalance = _reflectedBalances[account];
        if (reflectedBalance > 0) {
            uint256 tokenBalance = convertReflectedToActual(reflectedBalance);

            _balances[account] = tokenBalance;

            _excludedAmount = _excludedAmount.add(tokenBalance);
            _excludedReflectedAmount = _excludedReflectedAmount.add(reflectedBalance);
        }
        _isExcluded[account] = true;
    }

    // todo optimize with balance check like done upper
    function includeAccount(address account) external onlyOwner {
        require(_isExcluded[account], "SminemERC20::account is not excluded");

        uint256 rate = _getCurrentReflectionRate();
        uint256 balance = _balances[account];
        uint256 newReflectedBalance = balance.mul(rate);

        _excludedAmount = _excludedAmount.sub(balance);
        // todo check for no errors in subtraction
        _excludedReflectedAmount = _excludedReflectedAmount.sub(newReflectedBalance);

        // state in docs behaviour when _reflectedBalances[account] isn't changed
        _reflectedBalances[account] = newReflectedBalance;
        _balances[account] = 0;
        _isExcluded[account] = false;
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

    // TODO not sure if the name states the idea. Test convertActualToReflected(super.balanceOf)
    function convertActualToReflected(uint256 amount, bool deductTransferFee)
        external
        view
        returns (uint256)
    {
        require(amount <= _totalSupply, "SminemERC20::token amount must be less than supply");

        TransferData memory td = _getTransferData(amount);
        if (deductTransferFee)
            return td.reflectedCleanedAmount;
        return td.reflectedAmount;
    }

    /**
     * @dev An override of the classical implementation
     */
    function balanceOf(address account) public view returns (uint256) {
        if (_isExcluded[account])
            return ERC20.balanceOf(account);
        return convertReflectedToActual(_reflectedBalances[account]);
    }

    /**
     * @dev Converts reflected amount to actual token balance.
     */
    function convertReflectedToActual(uint256 reflectedAmount) public view returns (uint256) {
        require(
            reflectedAmount <= _reflectTotalSupply,
            "SminemERC20::amount must be less than total reflections"
        );
        uint256 rate = _getCurrentReflectionRate();
        return reflectedAmount.div(rate);
    }

    /**
     * @dev An override of the classical implementation
     */
    function _transfer(address sender, address recipient, uint256 amount) internal {
        require(sender != address(0), "SminemERC20::transfer from the zero address");
        require(recipient != address(0), "SminemERC20::transfer to the zero address");
        require(amount > 0, "SminemERC20::transfer amount must be greater than zero");

        TransferData memory td = _getTransferData(amount);
        
        // todo copy paste within reflected balance change. Fix after resolving todos in transfer fns.
        if (!_isExcluded[sender] && !_isExcluded[recipient])
            _transferStandard(sender, recipient, td);
        else if (!_isExcluded[sender] && _isExcluded[recipient])
            _transferToExcluded(sender, recipient, td);
        else if (_isExcluded[sender] && !_isExcluded[recipient])
            _transferFromExcluded(sender, recipient, td);
        else
            _transferBothExcluded(sender, recipient, td);

        _reflectFee(td.reflectedFee, td.fee);
        _transferCounter.increment();
        emit Transfer(sender, recipient, td.cleanedAmount);
    }

    function _transferStandard(
        address sender,
        address recipient,
        TransferData memory td
    )
        internal
    {
        _reflectedBalances[sender] = _reflectedBalances[sender].sub(td.reflectedAmount);
        _reflectedBalances[recipient] = _reflectedBalances[recipient].add(td.reflectedCleanedAmount);
    }

    function _transferToExcluded(
        address sender,
        address recipient,
        TransferData memory td
    )
        internal
    {
        _reflectedBalances[sender] = _reflectedBalances[sender].sub(td.reflectedAmount);
        _balances[recipient] = _balances[recipient].add(td.cleanedAmount);
        _reflectedBalances[recipient] = _reflectedBalances[recipient].add(td.reflectedCleanedAmount); // TODO not sure if needed, because of how inclusion is implemented. Check
        _excludedAmount = _excludedAmount.add(td.cleanedAmount);
        _excludedReflectedAmount = _excludedReflectedAmount.add(td.reflectedCleanedAmount);
    }

    function _transferFromExcluded(
        address sender,
        address recipient,
        TransferData memory td
    )
        internal
    {
        _balances[sender] = _balances[sender].sub(td.amount);
        _reflectedBalances[sender] = _reflectedBalances[sender].sub(td.reflectedAmount); // TODO not sure if needed, because of how inclusion is implemented. Check
        _reflectedBalances[recipient] = _reflectedBalances[recipient].add(td.reflectedCleanedAmount);
        // todo check no errors because of the sub
        _excludedAmount = _excludedAmount.sub(td.amount);
        _excludedReflectedAmount = _excludedReflectedAmount.sub(td.reflectedAmount);
    }

    function _transferBothExcluded(
        address sender,
        address recipient,
        TransferData memory td
    )
        internal
    {
        _balances[sender] = _balances[sender].sub(td.amount);
        _reflectedBalances[sender] = _reflectedBalances[sender].sub(td.reflectedAmount); // TODO not sure if needed, because of how inclusion is implemented. Check
        _balances[recipient] = _balances[recipient].add(td.cleanedAmount);
        _reflectedBalances[recipient] = _reflectedBalances[recipient].add(td.reflectedCleanedAmount); // TODO not sure if needed, because of how inclusion is implemented. Check
        _excludedAmount = _excludedAmount.sub(td.fee);
        _excludedReflectedAmount = _excludedReflectedAmount.sub(td.reflectedFee);
    }

    function _reflectFee(uint256 rFee, uint256 tFee) private {
        _reflectTotalSupply = _reflectTotalSupply.sub(rFee);
        _feeDistributedTotal = _feeDistributedTotal.add(tFee);
    }

    /**
     * @dev Gets a "common" and a reflected transfer data.
     *
     * For more information see:
     * - {SminemERC20-_getTokenTransferData};
     * - {SminemERC20-_getReflectedTransferData}.
     */
    function _getTransferData(uint256 amount) private view returns (TransferData memory) {
        (uint256 tokenCleanedAmount, uint256 tokenFee) = _getCommonTransferData(amount);
        (
            uint256 reflectedAmount,
            uint256 reflectedCleanedAmount,
            uint256 reflectedFee
        ) = _getReflectedTransferData(amount, tokenFee);
        return TransferData(
            amount,
            tokenCleanedAmount,
            tokenFee,
            reflectedAmount,
            reflectedCleanedAmount,
            reflectedFee
        );
    }

    /**
     * @dev Gets transfer data from the token transfer amount.
     *
     * By transfer data we mean fee amount and a transfer amount cleaned from fee.
     */
    function _getCommonTransferData(uint256 amount) private pure returns (uint256, uint256) {
        uint256 fee = amount.mul(_feePercent).div(100);
        uint256 cleanedAmount = amount.sub(fee);
        return (cleanedAmount, fee);
    }

    /**
     * @dev Gets reflected transfer data from a "common" transfer data
     *
     * By reflected transfer data we mean multiplied with a rate transfer amount, fee amount,
     * transfer amount cleaned from fee.
     */
    function _getReflectedTransferData(uint256 amount, uint256 fee)
        private
        view
        returns (uint256, uint256, uint256)
    {
        uint256 rate = _getCurrentReflectionRate();
        uint256 reflectedAmount = amount.mul(rate);
        uint256 reflectedFee = fee.mul(rate);
        uint256 reflectedCleanedAmount = reflectedAmount.sub(reflectedFee);
        return (reflectedAmount, reflectedCleanedAmount, reflectedFee);
    }

    /**
     * @dev Gets reflection rate based on current reflect and token supply.
     *
     * The rate is used then to get the actual token balance of the account.
     */
    function _getCurrentReflectionRate() private view returns (uint256) {
        (uint256 reflectedTotalSupply, uint256 totalSupply) = _getCurrentSupplyValues();
        return reflectedTotalSupply.div(totalSupply);
    }

    /**
     * @dev Gets reflect and token supply without balances of excluded accounts.
     *
     */
    function _getCurrentSupplyValues() private view returns (uint256, uint256) {
        uint256 reflectedTotalSupply = _reflectTotalSupply;
        uint256 totalSupply = _totalSupply;

        if (_excludedAmount > totalSupply || _excludedReflectedAmount > reflectedTotalSupply)
            return (reflectedTotalSupply, totalSupply);

        reflectedTotalSupply = reflectedTotalSupply.sub(_excludedReflectedAmount);
        totalSupply = totalSupply.sub(_excludedAmount);

        if (reflectedTotalSupply < _reflectTotalSupply.div(_totalSupply)) {
            // TODO why?
            return (_reflectTotalSupply, _totalSupply);
        }
        return (reflectedTotalSupply, totalSupply);
    }

    // TODO check if this is ever called on etherscan
//    function reflect(uint256 tAmount) external {
//        address sender = _msgSender();
//        require(!_isExcluded[sender], "Excluded addresses cannot call this function");
//        (uint256 rAmount, , , , , , ) = _getValues(tAmount);
//        _reflectedBalances[sender] = _reflectedBalances[sender].sub(rAmount);
//        _reflectTotal = _reflectTotal.sub(rAmount);
//        _feeTotal = _feeTotal.add(tAmount);
//    }
}


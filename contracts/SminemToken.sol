pragma solidity 0.5.7;

import "../node_modules/openzeppelin-solidity/contracts/ownership/Ownable.sol";
//import "../node_modules/openzeppelin-solidity/contracts/GSN/Context.sol";
import "../node_modules/openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
//import "../node_modules/openzeppelin-solidity/contracts/math/SafeMath.sol";
import "../node_modules/openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "../node_modules/openzeppelin-solidity/contracts/token/ERC20/ERC20Detailed.sol";

/**
 * @dev Implementation of the deflationary mechanism within ERC20 token based on
 * https://github.com/reflectfinance/reflect-contracts/blob/main/contracts/REFLECT.sol.
 *
 * Term "actual" regarding token balance means a token balance of an account with earned
 * fees from transactions made by token holders. This balance isn't stored anywhere, but
 * it's calculated using the reflection rate and reflected balance of an account.
 */
contract SminemToken is Ownable, ERC20, ERC20Detailed {

    mapping(address => uint256) private _reflectedBalances;

//    mapping(address => bool) private _isExcluded;
//    address[] private _excluded;

    uint256 private constant _feePercent = 1;
    //uint256 private constant _MAX = ~uint256(0);
    //uint256 private constant _INITIAL_SUPPLY = 100000 * 10 ** 9;
    // uint256 private constant _BURN_STOP_SUPPLY = 2100 * 10 ** 9;

    uint256 private _totalSupply; // = _INITIAL_SUPPLY;
    uint256 private _reflectTotalSupply; //= (_MAX - (_MAX % _totalSupply));

    uint256 private _feeTotal;

    constructor(string memory name, string memory symbol, uint8 decimals)
        ERC20Detailed(name, symbol, decimals)
        public
    {
        uint256 _MAX = ~uint256(0);
        _totalSupply = 100000 * 10**uint256(decimals); // todo check for overflows
        _reflectTotalSupply = _MAX - (_MAX % _totalSupply);
/*
        uint256 rDistributed = 0;
        // loop through the addresses array and send tokens to each address except the last one
        // the corresponding amount to sent is taken from the amounts array
        for(uint8 i = 0; i < addresses.length - 1; i++) {
            (uint256 rAmount, , , , , , ) = _getValues(amounts[i]);
            _reflectedBalances[addresses[i]] = rAmount;
            rDistributed = rDistributed + rAmount;
            emit Transfer(address(0), addresses[i], amounts[i]);
        }
        // all remaining tokens will be sent to the last address in the addresses array
        uint256 rRemainder = _reflectTotal - rDistributed;
        address liQuidityWalletAddress = addresses[addresses.length - 1];
        _reflectedBalances[liQuidityWalletAddress] = rRemainder;
        emit Transfer(address(0), liQuidityWalletAddress, tokenFromReflection(rRemainder));
*/
    }

//    function excludeAccount(address account) external onlyOwner() {
//        require(!_isExcluded[account], "SminemToken::account is already excluded");
//        uint256 reflectedBalance = _reflectedBalances[account];
//        if (reflectedBalance > 0) {
//            _balances[account] = convertReflectedToActual(reflectedBalance);
//            _excludedAmounts = _balances[account];
//            _excludedReflectedAmounts = _excludedReflectedAmounts.add(reflectedBalance);
//        }
//        _isExcluded[account] = true;
//    }
//
//    function includeAccount(address account) external onlyOwner() {
//        require(_isExcluded[account], "SminemToken::account is not excluded");
//        uint256 rate = _getCurrentReflectionRate();
//        uint256 beforeInclusionBalance = _balances[account];
//        uint256 beforeInclusionReflectedBalance = _reflectedBalances[account];
//
//        _reflectedBalances[account] = beforeInclusionBalance.mul(rate);
//        _balances[account] = 0;
//
//        _excludedAmounts = _excludedAmounts.sub(beforeInclusionBalance);
//        _excludedReflectedAmounts = _excludedReflectedAmounts.sub(beforeInclusionReflectedBalance);
//
//        _isExcluded[account] = false;
//    }
//
//    function isExcluded(address account) external view returns (bool) {
//        return _isExcluded[account];
//    }

    /**
     * @dev See {IERC20-transfer}.
     *
     * Requirements:
     *
     * - `recipient` cannot be the zero address.
     * - the caller must have a balance of at least `amount`.
     */
    function transfer(address recipient, uint256 amount) public returns (bool) {
        _transfer(_msgSender(), recipient, amount);
        return true;
    }

    /**
     * @dev See {IERC20-totalSupply}.
     */
    function totalSupply() public view returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) public view returns (uint256) {
        // TODO
        //        if (_isExcluded[account])
        //            return _balances[account];
        return convertReflectedToActual(_reflectedBalances[account]);
    }

    function totalFees() external view returns (uint256) {
        return _feeTotal;
    }

    // TODO not sure if the name states the idea. Test convertActualToReflected(
    function convertActualToReflected(uint256 tokenAmount, bool deductTransferFee)
        external
        view
        returns (uint256)
    {
        require(tokenAmount <= _totalSupply, "SminemToken::token amount must be less than supply");
        if (!deductTransferFee) {
            (uint256 reflectedAmount, , , , ) = _getTransferData(tokenAmount);
            return reflectedAmount;
        } else {
            ( , uint256 reflectedCleanedAmount, , , ) = _getTransferData(tokenAmount);
            return reflectedCleanedAmount;
        }
    }

    /**
     * @dev Converts reflected amount to actual token balance.
     */
    function convertReflectedToActual(uint256 reflectedAmount) public view returns (uint256) {
        require(
            reflectedAmount <= _reflectTotalSupply,
            "SminemToken::amount must be less than total reflections"
        );
        uint256 rate = _getCurrentReflectionRate();
        return reflectedAmount.div(rate);
    }

    function _transfer(address sender, address recipient, uint256 amount) internal {
        require(sender != address(0), "SminemToken::transfer from the zero address");
        require(recipient != address(0), "SminemToken::transfer to the zero address");
        require(amount > 0, "SminemToken::transfer amount must be greater than zero");

        _transferStandard(sender, recipient, amount);

//        if (_isExcluded[sender] && !_isExcluded[recipient]) {
//            _transferFromExcluded(sender, recipient, amount);
//        } else if (!_isExcluded[sender] && _isExcluded[recipient]) {
//            _transferToExcluded(sender, recipient, amount);
//        } else if (_isExcluded[sender] && _isExcluded[recipient]) {
//            _transferBothExcluded(sender, recipient, amount);
//        } else {
//            _transferStandard(sender, recipient, amount);
//        }
    }

    function _transferStandard(address sender, address recipient, uint256 tAmount) private {
        (
            uint256 reflectedAmount,
            uint256 reflectedCleanedAmount,
            uint256 reflectedFee,
            uint256 tokenCleanedAmount,
            uint256 tokenFee
        ) = _getTransferData(tAmount);
        _reflectedBalances[sender] = _reflectedBalances[sender].sub(reflectedAmount);
        _reflectedBalances[recipient] = _reflectedBalances[recipient].add(reflectedCleanedAmount);
        _reflectFee(reflectedFee, tokenFee);
//        if (tBurn > 0) {
//            _reflectBurn(rBurn, tBurn, sender);
//        }
        emit Transfer(sender, recipient, tokenCleanedAmount);
    }

//    function _transferToExcluded(address sender, address recipient, uint256 tAmount) private {
//        (uint256 rAmount, uint256 rTransferAmount, uint256 rFee, uint256 rBurn, uint256 tTransferAmount, uint256 tFee, uint256 tBurn) = _getTransferData(tAmount);
//        _rOwned[sender] = _rOwned[sender].sub(rAmount);
//        _tOwned[recipient] = _tOwned[recipient].add(tTransferAmount);
//        _rOwned[recipient] = _rOwned[recipient].add(rTransferAmount);
//        _reflectFee(rFee, tFee);
////        if (tBurn > 0) {
////            _reflectBurn(rBurn, tBurn, sender);
////        }
//        emit Transfer(sender, recipient, tTransferAmount);
//    }
//
//    function _transferFromExcluded(address sender, address recipient, uint256 tAmount) private {
//        (uint256 rAmount, uint256 rTransferAmount, uint256 rFee, uint256 rBurn, uint256 tTransferAmount, uint256 tFee, uint256 tBurn) = _getTransferData(tAmount);
//        _tOwned[sender] = _tOwned[sender].sub(tAmount);
//        _rOwned[sender] = _rOwned[sender].sub(rAmount);
//        _rOwned[recipient] = _rOwned[recipient].add(rTransferAmount);
//        _reflectFee(rFee, tFee);
////        if (tBurn > 0) {
////            _reflectBurn(rBurn, tBurn, sender);
////        }
//        emit Transfer(sender, recipient, tTransferAmount);
//    }
//
//    function _transferBothExcluded(address sender, address recipient, uint256 tAmount) private {
//        (uint256 rAmount, uint256 rTransferAmount, uint256 rFee, uint256 rBurn, uint256 tTransferAmount, uint256 tFee, uint256 tBurn) = _getTransferData(tAmount);
//        _tOwned[sender] = _tOwned[sender].sub(tAmount);
//        _rOwned[sender] = _rOwned[sender].sub(rAmount);
//        _tOwned[recipient] = _tOwned[recipient].add(tTransferAmount);
//        _rOwned[recipient] = _rOwned[recipient].add(rTransferAmount);
//        _reflectFee(rFee, tFee);
////        if (tBurn > 0) {
////            _reflectBurn(rBurn, tBurn, sender);
////        }
//        emit Transfer(sender, recipient, tTransferAmount);
//    }

    function _reflectFee(uint256 rFee, uint256 tFee) private {
        _reflectTotalSupply = _reflectTotalSupply.sub(rFee);
        _feeTotal = _feeTotal.add(tFee);
    }

    /**
     * @dev Gets a "common" and a reflected transfer data.
     *
     * For more information see:
     * - {SminemToken-_getTokenTransferData};
     * - {SminemToken-_getReflectedTransferData}.
     */
    function _getTransferData(uint256 tokenAmount)
        private
        view
        returns (
            uint256 reflectedAmount,
            uint256 reflectedCleanedAmount,
            uint256 reflectedFee,
            uint256 tokenCleanedAmount,
            uint256 tokenFee
        )
    {
        (tokenCleanedAmount, tokenFee) = _getTokenTransferData(tokenAmount);
        (
            reflectedAmount,
            reflectedCleanedAmount,
            reflectedFee
        ) = _getReflectedTransferData(tokenAmount, tokenFee);
    }

    /**
     * @dev Gets transfer data from the token transfer amount.
     *
     * By transfer data we mean fee amount and a transfer amount cleaned from fee.
     */
    function _getTokenTransferData(uint256 tokenAmount) private pure returns (uint256, uint256) {
        uint256 fee = tokenAmount.mul(_feePercent).div(100);
        uint256 cleanedAmount = tokenAmount.sub(fee);
//        uint256 tBurn = 0;
//        if (_totalSupply > _BURN_STOP_SUPPLY) {
//            tBurn = tokenAmount.div(100);
//            if (_totalSupply < _BURN_STOP_SUPPLY.add(tBurn)) {
//                tBurn = _totalSupply.sub(_BURN_STOP_SUPPLY);
//            }
//            tTransferAmount = tTransferAmount.sub(tBurn);
//        }
        return (cleanedAmount, fee);
    }

    /**
     * @dev Gets reflected transfer data from a "common" transfer data
     *
     * By reflected transfer data we mean multiplied with a rate transfer amount, fee amount,
     * transfer amount cleaned from fee.
     */
    function _getReflectedTransferData(uint256 tokenAmount, uint256 tokenFee)
        private
        view
        returns (uint256, uint256, uint256)
    {
        uint256 rate = _getCurrentReflectionRate();
        uint256 reflectedAmount = tokenAmount.mul(rate);
        uint256 reflectedFee = tokenFee.mul(rate);
        uint256 reflectedCleanedAmount = reflectedAmount.sub(reflectedFee);
//        uint256 rBurn = 0;
//        if (tBurn > 0) {
//            rBurn = tBurn.mul(rate);
//            reflectedCleanedAmount = reflectedCleanedAmount.sub(rBurn);
//        }
        return (reflectedAmount, reflectedCleanedAmount, reflectedFee);
    }

    /**
     * @dev Gets reflection rate base on current reflect and token supply.
     *
     * The rate is used then to get the actual token balance of the account.
     */
    function _getCurrentReflectionRate() private view returns (uint256) {
        (uint256 rSupply, uint256 tSupply) = _getCurrentSupplyValues();
        return rSupply.div(tSupply);
    }

    /**
     * @dev Gets reflect and token supply without balances of excluded accounts.
     *
     */
    function _getCurrentSupplyValues() private view returns (uint256, uint256) {
        uint256 reflectSupply = _reflectTotalSupply;
        uint256 tokenSupply = _totalSupply;

//        for (uint256 i = 0; i < _excluded.length; i++) {
//            if (_rOwned[_excluded[i]] > reflectSupply || _tOwned[_excluded[i]] > tokenSupply) return (_reflectTotalSupply, _totalSupply);
//            reflectSupply = reflectSupply.sub(_rOwned[_excluded[i]]);
//            tokenSupply = tokenSupply.sub(_tOwned[_excluded[i]]);
//        }
        if (reflectSupply < _reflectTotalSupply.div(_totalSupply)) {
            // TODO why?
            return (_reflectTotalSupply, _totalSupply);
        }
        return (reflectSupply, tokenSupply);
    }

//    function reflect(uint256 tAmount) external {
//        address sender = _msgSender();
//        require(!_isExcluded[sender], "Excluded addresses cannot call this function");
//        (uint256 rAmount, , , , , , ) = _getValues(tAmount);
//        _reflectedBalances[sender] = _reflectedBalances[sender].sub(rAmount);
//        _reflectTotal = _reflectTotal.sub(rAmount);
//        _feeTotal = _feeTotal.add(tAmount);
//    }

//    function _reflectBurn(uint256 rBurn, uint256 tBurn, address account) private {
//        _reflectTotal = _reflectTotal.sub(rBurn);
//        _totalSupply = _totalSupply.sub(tBurn);
//        emit ConsoleLog("burn", tBurn);
//        emit Transfer(account, address(0), tBurn);
//    }

//    function burn(uint256 amount) public {
//        require(_msgSender() != address(0), "ERC20: burn from the zero address");
//        (uint256 rAmount, , , , , , ) = _getValues(amount);
//        _burn(_msgSender(), amount, rAmount);
//    }
//
//    function burnFrom(address account, uint256 amount) public {
//        require(account != address(0), "ERC20: burn from the zero address");
//        uint256 decreasedAllowance = allowance(account, _msgSender()).sub(amount, "ERC20: burn amount exceeds allowance");
//        _approve(account, _msgSender(), decreasedAllowance);
//        (uint256 rAmount, , , , , , ) = _getValues(amount);
//        _burn(account, amount, rAmount);
//    }
//
//    function _burn(address account, uint256 tAmount, uint256 rAmount) private {
//        if (_isExcluded[account]) {
//            _tOwned[account] = _tOwned[account].sub(tAmount, "ERC20: burn amount exceeds balance");
//            _rOwned[account] = _rOwned[account].sub(rAmount, "ERC20: burn amount exceeds balance");
//        } else {
//            _rOwned[account] = _rOwned[account].sub(rAmount, "ERC20: burn amount exceeds balance");
//        }
//        _reflectBurn(rAmount, tAmount, account);
//    }
}


pragma solidity 0.5.7;

import "./ERC20Token.sol";
import "../node_modules/openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "../node_modules/openzeppelin-solidity/contracts/token/ERC20/ERC20Detailed.sol";

/**
 * @dev Implementation of the deflationary mechanism within ERC20 token based on
 * https://github.com/reflectfinance/reflect-contracts/blob/main/contracts/REFLECT.sol.
 *
 * Term "actual" regarding token balance means a token balance of an account with earned
 * fees from transactions made by token holders. This balance isn't stored anywhere, but
 * it's calculated using the reflection rate and reflected balance of an account.
 */
contract SminemToken is Ownable, ERC20Detailed, ERC20Token {

    mapping(address => uint256) private _reflectedBalances;

    uint256 private constant _feePercent = 1;

    uint256 private _reflectTotalSupply;
    uint256 private _feeTotal;

    constructor(string memory name, string memory symbol, uint8 decimals, uint256 supply)
        ERC20Detailed(name, symbol, decimals)
        public
    {
        uint256 _MAX = ~uint256(0);
        _totalSupply = supply * 10**uint256(decimals);
        _reflectTotalSupply = _MAX - (_MAX % _totalSupply);
        _reflectedBalances[_msgSender()] = _reflectTotalSupply;
        emit Transfer(address(0), _msgSender(), _reflectTotalSupply);
    }

    /**
     * @dev An override of the classical implementation
     */
    function balanceOf(address account) public view returns (uint256) {
        return convertReflectedToActual(_reflectedBalances[account]);
    }

    function totalFees() external view returns (uint256) {
        return _feeTotal;
    }

    // TODO not sure if the name states the idea. Test convertActualToReflected(super.balanceOf)
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

    /**
     * @dev An override of the classical implementation
     */
    function _transfer(address sender, address recipient, uint256 amount) internal {
        require(sender != address(0), "SminemToken::transfer from the zero address");
        require(recipient != address(0), "SminemToken::transfer to the zero address");
        require(amount > 0, "SminemToken::transfer amount must be greater than zero");
        (
            uint256 reflectedAmount,
            uint256 reflectedCleanedAmount,
            uint256 reflectedFee,
            uint256 tokenCleanedAmount,
            uint256 tokenFee
        ) = _getTransferData(amount);
        _reflectedBalances[sender] = _reflectedBalances[sender].sub(reflectedAmount);
        _reflectedBalances[recipient] = _reflectedBalances[recipient].add(reflectedCleanedAmount);
        _reflectFee(reflectedFee, tokenFee);
        emit Transfer(sender, recipient, tokenCleanedAmount);
    }

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
        return (reflectedAmount, reflectedCleanedAmount, reflectedFee);
    }

    /**
     * @dev Gets reflection rate based on current reflect and token supply.
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
}


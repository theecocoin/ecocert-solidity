pragma solidity ^0.5.0;

import 'openzeppelin-solidity/contracts/token/ERC20/IERC20.sol';

contract Finance {

    uint256 _balance;
    string r;

    function deposit(address _token, uint256 _amount, string calldata _reference) external {
        IERC20(_token).transferFrom(msg.sender, address(this), _amount);
        _balance += _amount;
        r = _reference;
    }

    function balance() external view returns (uint256) {
        return _balance;
    }

}

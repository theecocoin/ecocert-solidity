pragma solidity ^0.5.0;

import "openzeppelin-solidity/contracts/access/Roles.sol";

contract GrantRole {

    using Roles for Roles.Role;

    event GranterAdded(address indexed account);
    event GranterRemoved(address indexed account);

    Roles.Role private _granters;

    constructor () internal {
        _addGranter(msg.sender);
    }

    modifier onlyGranter() {
        require(isGranter(msg.sender), "GranterRole: caller does not have the Granter role");
        _;
    }

    function isGranter(address account) public view returns (bool) {
        return _granters.has(account);
    }

    function addGranter(address account) public onlyGranter {
        _addGranter(account);
    }

    function renounceGranter() public {
        _removeGranter(msg.sender);
    }

    function _addGranter(address account) internal {
        _granters.add(account);
        emit GranterAdded(account);
    }

    function _removeGranter(address account) internal {
        _granters.remove(account);
        emit GranterRemoved(account);
    }

}

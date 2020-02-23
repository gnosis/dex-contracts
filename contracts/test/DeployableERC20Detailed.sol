pragma solidity ^0.5.0;

// NOTE:
//  This file's purpose is just to make sure truffle compiles all of depending
//  contracts during development.
//
//  For other environments, only use compiled contracts from the NPM package.
import "openzeppelin-solidity/contracts/token/ERC20/ERC20Detailed.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20Mintable.sol";


contract DeployableERC20Detailed is ERC20Mintable, ERC20Detailed {
    constructor(string memory name, string memory symbol, uint8 decimals) public ERC20Detailed(name, symbol, decimals) {}
}

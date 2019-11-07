pragma solidity ^0.5.0;

// NOTE:
//  This file's purpose is just to make sure truffle compiles all of depending
//  contracts during development.
//
//  For other environments, only use compiled contracts from the NPM package.
import "openzeppelin-solidity/contracts/token/ERC20/ERC20Mintable.sol";
import "solidity-multicall/contracts/MultiCaller.sol";
import "@gnosis.pm/owl-token/contracts/TokenOWLProxy.sol";


contract DevDependencies { // solhint-disable no-empty-blocks
}
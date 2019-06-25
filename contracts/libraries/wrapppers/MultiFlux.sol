pragma solidity ^0.5.0;

import "../../SnappBase.sol";


contract MultiFlux is SnappBase {
    // Testing the filled deposit batch via deposit() function
    function multiDeposit(uint8 tokenId, uint128 amount, uint multiplier) public {
        for (uint8 i = 0; i < multiplier; i++) {
            deposit(tokenId, amount);
        }
    }

     // Testing the filled deposit batch via requestWithdrawal() function
    function multiWithdraw(uint8 tokenId, uint128 amount, uint multiplier) public {
        for (uint8 i = 0; i < multiplier; i++) {
            requestWithdrawal(tokenId, amount);
        }
    }
}
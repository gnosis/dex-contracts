// TokenStore stores Tokens for applications, which have discrete States increasing with time
pragma solidity ^0.5.0;

import "@gnosis.pm/mock-contract/contracts/MockContract.sol";
import "../EpochTokenLocker.sol";


contract EpochTokenLockerTestInterface is EpochTokenLocker {
    function addBalanceTest(address user, address token, uint256 amount) public {
        super.addBalance(user, token, amount);
    }

    function addBalanceAndBlockWithdrawForThisBatchTest(address user, address token, uint256 amount) public {
        super.addBalanceAndBlockWithdrawForThisBatch(user, token, amount);
    }

    function subtractBalanceTest(address user, address token, uint256 amount) public {
        super.subtractBalance(user, token, amount);
    }
}

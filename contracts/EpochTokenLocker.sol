pragma solidity ^0.5.0;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-solidity/contracts/math/Math.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";


// EpochTokenLocker saveguards tokens for applications with constant-balances during discrete epochs
// It allows to deposit token which become credited in the next epoch and allows to request a token-withdraw
// which becomes claimable after the current epoch expired.
contract EpochTokenLocker {
    using SafeMath for uint;

    event Deposit(
        address user,
        address token,
        uint amount,
        uint stateIndex
    );

    event WithdrawRequest(
        address user,
        address token,
        uint amount,
        uint stateIndex
    );

    event Withdraw(
        address user,
        address token,
        uint amount
    );

    // User => Token => BalanceState
    mapping(address => mapping(address => BalanceState)) private balanceStates;

    struct BalanceState {
        uint256 balance;
        PendingFlux pendingDeposits; // deposits will be credited in any next epoch, i.e. currentStateIndex > stateIndex
        PendingFlux pendingWithdraws; // withdraws are allowed in any next epoch , i.e. currentStateIndex > stateIndex
    }

    struct PendingFlux {
        uint256 amount;
        uint32 stateIndex;
    }

    uint32 private currentStateIndex = 0;

    function deposit(address token, uint amount) public {
        updateDepositsBalance(msg.sender, token);
        require(
            ERC20(token).transferFrom(msg.sender, address(this), amount),
            "Tokentransfer for deposit was not successful"
        );
        balanceStates[msg.sender][token].pendingDeposits.amount = balanceStates[msg.sender][token].pendingDeposits.amount
            .add(amount);
        balanceStates[msg.sender][token].pendingDeposits.stateIndex = currentStateIndex;
        emit Deposit(msg.sender, token, amount, currentStateIndex);
    }

    function requestWithdraw(address token, uint amount) public {
        updateStateIndex();
        balanceStates[msg.sender][token].pendingWithdraws = PendingFlux({ amount: amount, stateIndex: currentStateIndex });
        emit WithdrawRequest(msg.sender, token, amount, currentStateIndex);
    }

    function withdraw(address token) public {
        updateDepositsBalance(msg.sender, token); // withdrawn amount might just be deposited before

        require(
            balanceStates[msg.sender][token].pendingWithdraws.stateIndex < currentStateIndex,
            "withdraw was not registered previously"
        );

        uint amount = Math.min(
            balanceStates[msg.sender][token].balance,
            balanceStates[msg.sender][token].pendingWithdraws.amount
        );

        balanceStates[msg.sender][token].balance = balanceStates[msg.sender][token].balance.sub(amount);
        delete balanceStates[msg.sender][token].pendingWithdraws;

        ERC20(token).transfer(msg.sender, amount);
        emit Withdraw(msg.sender, token, amount);
    }

    /**
     * view functions
     */
    function getPendingDepositAmount(address user, address token) public view returns(uint) {
        return balanceStates[user][token].pendingDeposits.amount;
    }

    function getPendingDepositBatchNumber(address user, address token) public view returns(uint) {
        return balanceStates[user][token].pendingDeposits.stateIndex;
    }

    function getPendingWithdrawAmount(address user, address token) public view returns(uint) {
        return balanceStates[user][token].pendingWithdraws.amount;
    }

    function getPendingWithdrawBatchNumber(address user, address token) public view returns(uint) {
        return balanceStates[user][token].pendingWithdraws.stateIndex;
    }

    function getCurrentStateIndex() public view returns(uint32) {
        return uint32(now / 300);
    }

    function getBalance(address user, address token) public view returns(uint256) {
        uint balance = balanceStates[user][token].balance;
        if (balanceStates[user][token].pendingDeposits.stateIndex < getCurrentStateIndex()) {
            balance = balance.add(balanceStates[user][token].pendingDeposits.amount);
        }
        if (balanceStates[user][token].pendingWithdraws.stateIndex < getCurrentStateIndex()) {
            balance -= Math.min(balanceStates[user][token].pendingWithdraws.amount, balance);
        }
        return balance;
    }

    /**
     * internal functions
     */
    function addBalance(address user, address token, uint amount) internal {
        updateDepositsBalance(user, token);
        balanceStates[user][token].balance = balanceStates[user][token].balance.add(amount);
    }

    function substractBalance(address user, address token, uint amount) internal {
        updateDepositsBalance(user, token);
        balanceStates[user][token].balance = balanceStates[user][token].balance.sub(amount);
    }

    function updateDepositsBalance(address user, address token) private {
        updateStateIndex();
        if (balanceStates[user][token].pendingDeposits.stateIndex < currentStateIndex) {
            balanceStates[user][token].balance = balanceStates[user][token].balance.add(
                balanceStates[user][token].pendingDeposits.amount
            );

            delete balanceStates[user][token].pendingDeposits;
        }
    }

    function updateStateIndex() private {
        currentStateIndex = getCurrentStateIndex();
    }
}

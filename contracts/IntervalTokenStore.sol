// TokenStore stores Tokens for applications, which have discrete States increasing with time
pragma solidity ^0.5.0;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-solidity/contracts/math/Math.sol";

contract IntervalTokenStore {

    event Deposit(
        address user,
        address token,
        uint amount
    );
    // User => Token => BalanceState
    mapping(address => mapping(address => BalanceState)) balanceStates;

    struct BalanceState {
        uint256 balance;
        PendingFlux pendingDeposits;
        PendingFlux pendingWithdraws;
    }
    
    struct PendingFlux {
        uint256 amount;
        uint256 stateIndex;  // deposits will be processed for any currentStateIndex > stateIndex
                              // withdraws are allowed for any currentStateIndex > stateIndex
    }

    uint256 public currentStateIndex=0;

    function updateAndGetBalance(address user, address token) public returns(uint256) {
        updateDepositsBalance(user, token);
        uint balance = balanceStates[user][token].balance;
        if (balanceStates[user][token].pendingWithdraws.stateIndex < currentStateIndex) {
            balance -= Math.min(balanceStates[user][token].pendingWithdraws.amount, balance);
        }
        return balance;
    }

    function deposit(address token, uint amount) public {
        updateDepositsBalance(msg.sender, token);
        require(
            ERC20(token).transferFrom(msg.sender, address(this), amount),
            "Tokentransfer for deposit was not successful"
        );
        balanceStates[msg.sender][token].pendingDeposits.amount += amount;
        balanceStates[msg.sender][token].pendingDeposits.stateIndex = currentStateIndex;
        emit Deposit(msg.sender, token, amount);
    }

    function withdrawRequest(address token, uint amount) public {
        balanceStates[msg.sender][token].pendingWithdraws = PendingFlux({ amount: amount, stateIndex: currentStateIndex });
    }

    function withdraw(address token, uint amount) public {
        updateDepositsBalance(msg.sender, token);

        require(
            balanceStates[msg.sender][token].pendingWithdraws.stateIndex < currentStateIndex,
            "withdraw was not registered previously"
        );

        require(
            balanceStates[msg.sender][token].pendingWithdraws.amount >= amount,
            "registered withdraw-amount was not sufficient"
        );

        require(
            balanceStates[msg.sender][token].balance >= amount,
            "balances not sufficient"
        );

        balanceStates[msg.sender][token].balance -= amount;
        delete balanceStates[msg.sender][token].pendingWithdraws;

        ERC20(token).transfer(msg.sender, amount);
    }

    function updateDepositsBalance(address user, address token) public {
        if ( balanceStates[user][token].pendingDeposits.stateIndex < currentStateIndex ) {
            balanceStates[user][token].balance += balanceStates[user][token].pendingDeposits.amount;

            delete balanceStates[user][token].pendingDeposits;
        }
    }

    /**
     * view functions
     */
    function getPendingDepositAmount(address user, address token) public view returns(uint){
        return balanceStates[user][token].pendingDeposits.amount;
    }
    function getPendingDepositBatchNumber(address user, address token) public view returns(uint){
        return balanceStates[user][token].pendingDeposits.stateIndex;
    }
    function getPendingWithdrawAmount(address user, address token) public view returns(uint){
        return balanceStates[user][token].pendingWithdraws.amount;
    }
    function getPendingWithdrawBatchNumber(address user, address token) public view returns(uint){
        return balanceStates[user][token].pendingWithdraws.stateIndex;
    }
    function getBalance(address user, address token) public view returns(uint){
        return balanceStates[user][token].balance;
    }
}
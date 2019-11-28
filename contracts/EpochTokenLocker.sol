pragma solidity ^0.5.0;

import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC20/SafeERC20.sol";
import "openzeppelin-solidity/contracts/math/Math.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";

/** @title Epoch Token Locker
 *  EpochTokenLocker saveguards tokens for applications with constant-balances during discrete epochs
 *  It allows to deposit a token which become credited in the next epoch and allows to request a token-withdraw
 *  which becomes claimable after the current epoch has expired.
 *  @author @gnosis/dfusion-team <https://github.com/orgs/gnosis/teams/dfusion-team/members>
 */
contract EpochTokenLocker {
    using SafeMath for uint256;

    event Deposit(
        address user,
        address token,
        uint256 amount,
        uint256 stateIndex
    );

    event WithdrawRequest(
        address user,
        address token,
        uint256 amount,
        uint256 stateIndex
    );

    event Withdraw(address user, address token, uint256 amount);

    uint32 public constant BATCH_TIME = 300;
    // User => Token => BalanceState
    mapping(address => mapping(address => BalanceState)) private balanceStates;

    // user => token => lastCreditBatchId
    mapping(address => mapping(address => uint256)) public lastCreditBatchId;

    struct BalanceState {
        uint256 balance;
        PendingFlux pendingDeposits; // deposits will be credited in any future epoch, i.e. currentStateIndex > stateIndex
        PendingFlux pendingWithdraws; // withdraws are allowed in any future epoch, i.e. currentStateIndex > stateIndex
    }

    struct PendingFlux {
        uint256 amount;
        uint32 stateIndex;
    }

    /** @dev credits user with deposit amount on next epoch (given by getCurrentBatchId)
      * @param token address of token to be deposited
      * @param amount number of token(s) to be credited to user's account
      *
      * Emits an {Deposit} event with relevent deposit information.
      *
      * Requirements:
      * - token transfer to contract is successfull
      */
    function deposit(address token, uint256 amount) public {
        updateDepositsBalance(msg.sender, token);
        SafeERC20.safeTransferFrom(
            IERC20(token),
            msg.sender,
            address(this),
            amount
        );
        // solhint-disable-next-line max-line-length
        balanceStates[msg.sender][token]
            .pendingDeposits
            .amount = balanceStates[msg.sender][token]
            .pendingDeposits
            .amount
            .add(amount);
        balanceStates[msg.sender][token]
            .pendingDeposits
            .stateIndex = getCurrentBatchId();
        emit Deposit(msg.sender, token, amount, getCurrentBatchId());
    }

    /** @dev Signals and initiates user's intent to withdraw.
      * @param token address of token to be withdrawn
      * @param amount number of token(s) to be withdrawn
      *
      * Emits an {WithdrawRequest} event with relevent request information.
      */
    function requestWithdraw(address token, uint256 amount) public {
        requestFutureWithdraw(token, amount, getCurrentBatchId());
    }

    /** @dev Signals and initiates user's intent to withdraw.
      * @param token address of token to be withdrawn
      * @param amount number of token(s) to be withdrawn
      * @param batchId state index at which request is to be made.
      *
      * Emits an {WithdrawRequest} event with relevent request information.
      */
    function requestFutureWithdraw(
        address token,
        uint256 amount,
        uint32 batchId
    ) public {
        // First process pendingWithdraw (if any), as otherwise balances might increase for currentBatchId - 1
        if (hasValidWithdrawRequest(msg.sender, token)) {
            withdraw(msg.sender, token);
        }
        require(
            batchId >= getCurrentBatchId(),
            "Request cannot be made in the past"
        );
        balanceStates[msg.sender][token].pendingWithdraws = PendingFlux({
            amount: amount,
            stateIndex: batchId
        });
        emit WithdrawRequest(msg.sender, token, amount, batchId);
    }

    /** @dev Claims pending withdraw - can be called on behalf of others
      * @param token address of token to be withdrawn
      * @param user address of user who withdraw is being claimed.
      *
      * Emits an {Withdraw} event stating that `user` withdrew `amount` of `token`
      *
      * Requirements:
      * - withdraw was requested in previous epoch
      * - token was received from exchange in current auction batch
      */
    function withdraw(address user, address token) public {
        updateDepositsBalance(user, token); // withdrawn amount may have been deposited in previous epoch
        require(
            balanceStates[user][token].pendingWithdraws.stateIndex <
                getCurrentBatchId(),
            "withdraw was not registered previously"
        );
        require(
            lastCreditBatchId[msg.sender][token] < getCurrentBatchId(),
            "Withdraw not possible for token that is traded in the current auction"
        );
        uint256 amount = Math.min(
            balanceStates[user][token].balance,
            balanceStates[msg.sender][token].pendingWithdraws.amount
        );

        balanceStates[user][token].balance = balanceStates[user][token]
            .balance
            .sub(amount);
        delete balanceStates[user][token].pendingWithdraws;

        SafeERC20.safeTransfer(IERC20(token), user, amount);
        emit Withdraw(user, token, amount);
    }
    /**
     * Public view functions
     */

    /** @dev getter function used to display pending deposit amount
      * @param user address of user
      * @param token address of ERC20 token
      * return amount of pending deposit if any (else 0)
      */
    function getPendingDepositAmount(address user, address token)
        public
        view
        returns (uint256)
    {
        if (
            balanceStates[user][token].pendingDeposits.stateIndex >=
            getCurrentBatchId()
        ) {
            return 0;
        }
        return balanceStates[user][token].pendingDeposits.amount;
    }

    /** @dev getter function used to display pending deposit batchIndex
      * @param user address of user
      * @param token address of ERC20 token
      * return stateIndex of deposit's transfer
      */
    function getPendingDepositBatchNumber(address user, address token)
        public
        view
        returns (uint256)
    {
        if (
            balanceStates[user][token].pendingDeposits.stateIndex >=
            getCurrentBatchId()
        ) {
            return 0;
        }
        return balanceStates[user][token].pendingDeposits.stateIndex;
    }

    /** @dev getter function used to display pending withdraw amount
      * @param user address of user
      * @param token address of ERC20 token
      * return stateIndex when withdraw was requested
      */
    function getClaimableAmount(address user, address token)
        public
        view
        returns (uint256)
    {
        if (
            balanceStates[user][token].pendingWithdraws.stateIndex >=
            getCurrentBatchId()
        ) {
            return 0;
        }
        return balanceStates[user][token].pendingWithdraws.amount;
    }

    /** @dev getter function used to display pending withdraw's batchIndex
      * @param user address of user
      * @param token address of ERC20 token
      * return stateIndex at time of withdraw's request
      */
    function getPendingWithdrawBatchNumber(address user, address token)
        public
        view
        returns (uint256)
    {
        if (
            balanceStates[user][token].pendingWithdraws.stateIndex >=
            getCurrentBatchId()
        ) {
            return 0;
        }
        return balanceStates[user][token].pendingWithdraws.stateIndex;
    }

    /** @dev getter function to determine current auction id.
      * return current stateIndex
      */
    function getCurrentBatchId() public view returns (uint32) {
        return uint32(now / BATCH_TIME);
    }

    /** @dev used to determine how much time is left in a batch
      * return seconds remaining in current batch
      */
    function getSecondsRemainingInBatch() public view returns (uint256) {
        return BATCH_TIME - (now % BATCH_TIME);
    }

    /** @dev fetches and returns user's balance
      * @param user address of user
      * @param token address of ERC20 token
      * return Current `token` balance of `user`'s account
      */
    function getBalance(address user, address token)
        public
        view
        returns (uint256)
    {
        uint256 balance = balanceStates[user][token].balance;
        if (
            balanceStates[user][token].pendingDeposits.stateIndex <
            getCurrentBatchId()
        ) {
            balance = balance.add(
                balanceStates[user][token].pendingDeposits.amount
            );
        }
        if (
            balanceStates[user][token].pendingWithdraws.stateIndex <
            getCurrentBatchId()
        ) {
            balance = balance.sub(
                Math.min(
                    balanceStates[user][token].pendingWithdraws.amount,
                    balance
                )
            );
        }
        return balance;
    }

    /** @dev Used to determine if user has a valid pending withdraw request of specific token
      * @param user address of user
      * @param token address of ERC20 token
      * return true if `user` has valid withdraw request for `token`, otherwise false
      */
    function hasValidWithdrawRequest(address user, address token)
        public
        view
        returns (bool)
    {
        return
            balanceStates[user][token].pendingWithdraws.stateIndex <
            getCurrentBatchId() &&
            balanceStates[user][token].pendingWithdraws.stateIndex > 0;
    }

    /**
     * internal functions
     */
    /**
     * The following function should be used to update any balances within an epoch, which
     * will not be immediately final. E.g. our stablecoin converter credits new balances to
     * the buyers in an auction, but as there are might be better solutions, the updates are
     * not final. In order to prevent withdraws from non-final updates, we disallow withdraws
     * by setting lastCreditBatchId to the current batchId and allow only withdraws in batches
     * with a higher batchId.
     */
    function addBalanceAndBlockWithdrawForThisBatch(
        address user,
        address token,
        uint256 amount
    ) internal {
        if (hasValidWithdrawRequest(user, token)) {
            lastCreditBatchId[user][token] = getCurrentBatchId();
        }
        addBalance(user, token, amount);
    }

    function addBalance(address user, address token, uint256 amount) internal {
        updateDepositsBalance(user, token);
        balanceStates[user][token].balance = balanceStates[user][token]
            .balance
            .add(amount);
    }

    function subtractBalance(address user, address token, uint256 amount)
        internal
    {
        updateDepositsBalance(user, token);
        balanceStates[user][token].balance = balanceStates[user][token]
            .balance
            .sub(amount);
    }

    function updateDepositsBalance(address user, address token) private {
        if (
            balanceStates[user][token].pendingDeposits.stateIndex <
            getCurrentBatchId()
        ) {
            balanceStates[user][token].balance = balanceStates[user][token]
                .balance
                .add(balanceStates[user][token].pendingDeposits.amount);
            delete balanceStates[user][token].pendingDeposits;
        }
    }
}

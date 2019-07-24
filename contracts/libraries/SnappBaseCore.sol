pragma solidity ^0.5.0;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "./IdToAddressBiMap.sol";
import "./Merkle.sol";
import "../SnappBase.sol";


library SnappBaseCore {
    using Merkle for bytes32;

    uint public constant MAX_UINT = 2**256 - 1;
    uint8 public constant MAX_ACCOUNT_ID = 100;
    uint8 public constant MAX_TOKENS = 30;
    uint8 public constant DEPOSIT_BATCH_SIZE = 100;
    uint8 public constant WITHDRAW_BATCH_SIZE = 100;

    event WithdrawRequest(uint16 accountId, uint8 tokenId, uint128 amount, uint slot, uint16 slotIndex);
    event Deposit(uint16 accountId, uint8 tokenId, uint128 amount, uint slot, uint16 slotIndex);
    event StateTransition(uint8 transitionType, uint stateIndex, bytes32 stateHash, uint slot);
    event SnappInitialization(bytes32 stateHash, uint8 maxTokens, uint16 maxAccounts);

    enum TransitionType {
        Deposit,
        Withdraw
    }

    struct PendingBatch {
        uint16 size;                   // Number of elements in this batch
        bytes32 shaHash;               // Rolling shaHash of all batch content
        uint creationTimestamp;        // Timestamp of batch creation
        uint appliedAccountStateIndex; // accountState index when batch applied (for rollback), 0 implies not applied.
    }

    struct ClaimableWithdrawState {
        bytes32 merkleRoot;                      // Merkle root of claimable withdraws in this block
        bool[WITHDRAW_BATCH_SIZE] claimedBitmap; // Bitmap signalling which withdraws have been claimed
        uint appliedAccountStateIndex;           // AccountState when this state was created (for rollback)
    }

    struct Data {
        bytes32[] stateRoots;
        IdToAddressBiMap.Data registeredAccounts;
        IdToAddressBiMap.Data registeredTokens;
        uint8 numTokens;
        uint depositIndex;
        mapping (uint => PendingBatch) deposits;
        uint withdrawIndex;
        mapping (uint => PendingBatch) pendingWithdraws;
        mapping (uint => ClaimableWithdrawState) claimableWithdraws;
    }

    function init(Data storage data) public {
        // The initial state should be Pederson hash of an empty balance tree
        bytes32 stateInit = bytes32(0);
        data.stateRoots.push(stateInit);
        data.depositIndex = MAX_UINT;
        data.withdrawIndex = MAX_UINT;

        emit SnappInitialization(stateInit, MAX_TOKENS, MAX_ACCOUNT_ID);
    }

    /**
     * Public View Methods
     */
    function stateIndex(Data storage data) public view returns (uint) {
        return data.stateRoots.length - 1;
    }

    function publicKeyToAccountMap(Data storage data, address addr) public view returns (uint16) {
        return IdToAddressBiMap.getId(data.registeredAccounts, addr);
    }

    function accountToPublicKeyMap(Data storage data, uint16 id) public view returns (address) {
        return IdToAddressBiMap.getAddressAt(data.registeredAccounts, id);
    }

    function tokenIdToAddressMap(Data storage data, uint16 id) public view returns (address) {
        return IdToAddressBiMap.getAddressAt(data.registeredTokens, id);
    }

    /**
     * General Snapp Functionality
     */
    function openAccount(Data storage data, uint16 accountId) public {
        require(accountId < MAX_ACCOUNT_ID, "Account index exceeds max");
        require(
            IdToAddressBiMap.insert(data.registeredAccounts, accountId, msg.sender),
            "Address occupies slot or requested slot already taken"
        );
    }

    function addToken(Data storage data, address _tokenAddress) public {
        require(data.numTokens + 1 <= MAX_TOKENS, "Max tokens reached");
        require(
            IdToAddressBiMap.insert(data.registeredTokens, data.numTokens, _tokenAddress),
            "Token already registered"
        );
        data.numTokens++;
    }

    /**
     * Deposits
     */
    function deposit(Data storage data, uint8 tokenId, uint128 amount) public {
        require(amount != 0, "Must deposit positive amount");
        require(IdToAddressBiMap.hasId(data.registeredTokens, tokenId), "Requested token is not registered");
        require(
            ERC20(tokenIdToAddressMap(data, tokenId)).transferFrom(msg.sender, address(this), amount),
            "Unsuccessful transfer"
        );

        if (data.depositIndex == MAX_UINT ||
            data.deposits[data.depositIndex].size == DEPOSIT_BATCH_SIZE ||
            block.timestamp > data.deposits[data.depositIndex].creationTimestamp + 3 minutes
        ) {
            data.depositIndex++;
            data.deposits[data.depositIndex] = PendingBatch({
                size: 0,
                shaHash: bytes32(0),
                creationTimestamp: block.timestamp,
                appliedAccountStateIndex: 0
            });
        }

        // Update Deposit Hash based on request
        uint16 accountId = publicKeyToAccountMap(data, msg.sender);
        bytes32 nextDepositHash = sha256(
            abi.encodePacked(data.deposits[data.depositIndex].shaHash, encodeFlux(accountId, tokenId, amount))
        );
        data.deposits[data.depositIndex].shaHash = nextDepositHash;

        emit Deposit(accountId, tokenId, amount, data.depositIndex, data.deposits[data.depositIndex].size);
        // Only increment size after event (so it is emitted as an index)
        data.deposits[data.depositIndex].size++;
    }

    function applyDeposits(
        Data storage data,
        uint slot,
        bytes32 _currStateRoot,
        bytes32 _newStateRoot,
        bytes32 _depositHash
    ) public {
        require(slot != MAX_UINT && slot <= data.depositIndex, "Requested deposit slot does not exist");
        require(slot == 0 || data.deposits[slot-1].appliedAccountStateIndex != 0, "Must apply deposit slots in order!");
        require(data.deposits[slot].shaHash == _depositHash, "Deposits have been reorged");
        require(data.deposits[slot].appliedAccountStateIndex == 0, "Deposits already processed");
        require(
            block.timestamp > data.deposits[slot].creationTimestamp + 3 minutes,
            "Requested deposit slot is still active"
        );
        require(data.stateRoots[stateIndex(data)] == _currStateRoot, "Incorrect State Root");

        // Note that the only slot that can ever be empty is the first (at index zero)
        // This occurs when no deposits are made within the first 20 blocks of the contract's deployment
        // This code allows for the processing of the empty block and since it will only happen once
        // No, additional verification is necessary.

        data.stateRoots.push(_newStateRoot);
        data.deposits[slot].appliedAccountStateIndex = stateIndex(data);

        emit StateTransition(uint8(TransitionType.Deposit), stateIndex(data), _newStateRoot, slot);
    }

    /**
     * Withdraws
     */
    function requestWithdrawal(Data storage data, uint8 tokenId, uint128 amount) public {
        require(amount != 0, "Must request positive amount");
        require(IdToAddressBiMap.hasId(data.registeredTokens, tokenId), "Requested token is not registered");
        require(
            ERC20(tokenIdToAddressMap(data, tokenId)).balanceOf(address(this)) >= amount,
            "Requested amount exceeds contract's balance"
        );

        // Determine or construct correct current withdraw state.
        // This is governed by WITHDRAW_BATCH_SIZE and creationTimestamp
        if (
            data.withdrawIndex == MAX_UINT ||
            data.pendingWithdraws[data.withdrawIndex].size == WITHDRAW_BATCH_SIZE ||
            block.timestamp > data.pendingWithdraws[data.withdrawIndex].creationTimestamp + 3 minutes
        ) {
            data.withdrawIndex++;
            data.pendingWithdraws[data.withdrawIndex] = PendingBatch({
                size: 0,
                shaHash: bytes32(0),
                creationTimestamp: block.timestamp,
                appliedAccountStateIndex: 0
            });
        }

        // Update Withdraw Hash based on request
        uint16 accountId = publicKeyToAccountMap(data, msg.sender);
        bytes32 nextWithdrawHash = sha256(
            abi.encodePacked(data.pendingWithdraws[data.withdrawIndex].shaHash, encodeFlux(accountId, tokenId, amount))
        );

        data.pendingWithdraws[data.withdrawIndex].shaHash = nextWithdrawHash;

        emit WithdrawRequest(accountId, tokenId, amount, data.withdrawIndex, data.pendingWithdraws[data.withdrawIndex].size);
        // Only increment size after event (so it is emitted as an index)
        data.pendingWithdraws[data.withdrawIndex].size++;
    }

    function applyWithdrawals(
        Data storage data,
        uint slot,
        bytes32 _merkleRoot,
        bytes32 _currStateRoot,
        bytes32 _newStateRoot,
        bytes32 _withdrawHash
    ) public {
        require(slot != MAX_UINT && slot <= data.withdrawIndex, "Requested withdrawal slot does not exist");
        require(
            slot == 0 || data.pendingWithdraws[slot-1].appliedAccountStateIndex != 0,
            "Previous withdraw slot not processed!"
        );
        require(data.pendingWithdraws[slot].shaHash == _withdrawHash, "Withdraws have been reorged");
        require(data.pendingWithdraws[slot].appliedAccountStateIndex == 0, "Withdraws already processed");
        require(
            block.timestamp > data.pendingWithdraws[slot].creationTimestamp + 3 minutes,
            "Requested withdraw slot is still active");
        require(data.stateRoots[stateIndex(data)] == _currStateRoot, "Incorrect State Root");

        // Update account states
        data.stateRoots.push(_newStateRoot);
        data.pendingWithdraws[slot].appliedAccountStateIndex = stateIndex(data);

        bool[WITHDRAW_BATCH_SIZE] memory nullArray;
        data.claimableWithdraws[slot] = ClaimableWithdrawState({
            merkleRoot: _merkleRoot,
            claimedBitmap: nullArray,
            appliedAccountStateIndex: stateIndex(data)
        });

        emit StateTransition(uint8(TransitionType.Withdraw), stateIndex(data), _newStateRoot, slot);
    }

    function claimWithdrawal(
        Data storage data,
        uint slot,
        uint16 inclusionIndex,
        uint16 accountId,
        uint8 tokenId,
        uint128 amount,
        bytes memory proof
    ) public {
        // No need to check tokenId or accountId (wouldn't pass merkle proof if unregistered).
        require(data.pendingWithdraws[slot].appliedAccountStateIndex > 0, "Requested slot has not been processed");
        require(data.claimableWithdraws[slot].claimedBitmap[inclusionIndex] == false, "Already claimed");

        bytes32 leaf = encodeFlux(accountId, tokenId, amount);
        require(
            leaf.checkMembership(inclusionIndex, data.claimableWithdraws[slot].merkleRoot, proof, 7),
            "Failed Merkle membership check."
        );

        // Set claim bitmap to true (indicating that funds have been claimed).
        data.claimableWithdraws[slot].claimedBitmap[inclusionIndex] = true;

        // There is no situation where contract balance can't afford the upcoming transfer.
        ERC20(tokenIdToAddressMap(data, tokenId)).transfer(accountToPublicKeyMap(data, accountId), amount);
    }

    function encodeFlux(uint16 accountId, uint8 tokenId, uint128 amount) internal pure returns (bytes32) {
        return bytes32(uint(amount) + (uint(tokenId) << 128) + (uint(accountId) << 136));
    }
}

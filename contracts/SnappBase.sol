pragma solidity ^0.5.0;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "./libraries/Merkle.sol";
import "./libraries/IdToAddressBiMap.sol";


contract SnappBase is Ownable {
    using Merkle for bytes32;

    uint public constant MAX_UINT = 2**256 - 1;
    uint8 public constant MAX_ACCOUNT_ID = 100;
    uint8 public constant MAX_TOKENS = 30;
    uint8 public constant DEPOSIT_BATCH_SIZE = 100;
    uint8 public constant WITHDRAW_BATCH_SIZE = 100;

    bytes32[] public stateRoots;  // Pedersen Hash

    enum TransitionType {
        Deposit,
        Withdraw
    }

    IdToAddressBiMap.Data private registeredAccounts;
    IdToAddressBiMap.Data private registeredTokens;
    uint8 public numTokens;

    struct PendingBatch {
        uint16 size;                   // Number of deposits in this batch
        bytes32 shaHash;               // Rolling shaHash of all deposits
        uint creationTimestamp;        // Timestamp of batch creation
        uint appliedAccountStateIndex; // accountState index when batch applied (for rollback), 0 implies not applied.
    }

    uint public depositIndex = MAX_UINT;
    mapping (uint => PendingBatch) public deposits;

    uint public withdrawIndex = MAX_UINT;
    mapping (uint => PendingBatch) public pendingWithdraws;

    struct ClaimableWithdrawState {
        bytes32 merkleRoot;                      // Merkle root of claimable withdraws in this block
        bool[WITHDRAW_BATCH_SIZE] claimedBitmap; // Bitmap signalling which withdraws have been claimed
        uint appliedAccountStateIndex;           // AccountState when this state was created (for rollback)
    }

    mapping (uint => ClaimableWithdrawState) public claimableWithdraws;

    event WithdrawRequest(uint16 accountId, uint8 tokenId, uint128 amount, uint slot, uint16 slotIndex);
    event Deposit(uint16 accountId, uint8 tokenId, uint128 amount, uint slot, uint16 slotIndex);
    event StateTransition(TransitionType transitionType, uint stateIndex, bytes32 stateHash, uint slot);
    event SnappInitialization(bytes32 stateHash, uint8 maxTokens, uint16 maxAccounts);

    constructor () public {
        // The initial state should be Pederson hash of an empty balance tree
        bytes32 stateInit = bytes32(0);
        stateRoots.push(stateInit);

        emit SnappInitialization(stateInit, MAX_TOKENS, MAX_ACCOUNT_ID);
    }

    /**
     * Public View Methods
     */
    function stateIndex() public view returns (uint) {
        return stateRoots.length - 1;
    }

    function getCurrentStateRoot() public view returns (bytes32) {
        return stateRoots[stateIndex()];
    }

    function hasDepositBeenApplied(uint index) public view returns (bool) {
        return deposits[index].appliedAccountStateIndex != 0;
    }

    function getDepositCreationTimestamp(uint slot) public view returns (uint) {
        return deposits[slot].creationTimestamp;
    }

    function getDepositHash(uint slot) public view returns (bytes32) {
        return deposits[slot].shaHash;
    }

    function hasWithdrawBeenApplied(uint index) public view returns (bool) {
        return pendingWithdraws[index].appliedAccountStateIndex != 0;
    }

    function getWithdrawCreationTimestamp(uint slot) public view returns (uint) {
        return pendingWithdraws[slot].creationTimestamp;
    }

    function getWithdrawHash(uint slot) public view returns (bytes32) {
        return pendingWithdraws[slot].shaHash;
    }

    function hasWithdrawBeenClaimed(uint slot, uint16 index) public view returns (bool) {
        return claimableWithdraws[slot].claimedBitmap[index];
    }

    function publicKeyToAccountMap(address addr) public view returns (uint16) {
        return IdToAddressBiMap.getId(registeredAccounts, addr);
    }

    function accountToPublicKeyMap(uint16 id) public view returns (address) {
        return IdToAddressBiMap.getAddressAt(registeredAccounts, id);
    }

    function tokenAddresToIdMap(address addr) public view returns (uint16) {
        return IdToAddressBiMap.getId(registeredTokens, addr);
    }

    function tokenIdToAddressMap(uint16 id) public view returns (address) {
        return IdToAddressBiMap.getAddressAt(registeredTokens, id);
    }

    function hasAccount(uint16 accountId) public view returns (bool) {
        return IdToAddressBiMap.hasId(registeredAccounts, accountId);
    }

    /**
     * Modifiers
     */
    modifier onlyRegistered() {
        require(IdToAddressBiMap.hasAddress(registeredAccounts, msg.sender), "Must have registered account");
        _;
    }

    /**
     * General Snapp Functionality
     */
    function openAccount(uint16 accountId) public {
        require(accountId < MAX_ACCOUNT_ID, "Account index exceeds max");
        require(
            IdToAddressBiMap.insert(registeredAccounts, accountId, msg.sender),
            "Address occupies slot or requested slot already taken"
        );
    }

    function addToken(address _tokenAddress) public onlyOwner() {
        require(numTokens + 1 <= MAX_TOKENS, "Max tokens reached");
        require(
            IdToAddressBiMap.insert(registeredTokens, numTokens, _tokenAddress),
            "Token already registered"
        );
        numTokens++;
    }

    /**
     * Deposits
     */
    function deposit(uint8 tokenId, uint128 amount) public onlyRegistered() {
        require(amount != 0, "Must deposit positive amount");
        require(IdToAddressBiMap.hasId(registeredTokens, tokenId), "Requested token is not registered");
        require(
            ERC20(tokenIdToAddressMap(tokenId)).transferFrom(msg.sender, address(this), amount),
            "Unsuccessful transfer"
        );

        if (depositIndex == MAX_UINT ||
            deposits[depositIndex].size == DEPOSIT_BATCH_SIZE ||
            block.timestamp > deposits[depositIndex].creationTimestamp + 3 minutes
        ) {
            depositIndex++;
            deposits[depositIndex] = PendingBatch({
                size: 0,
                shaHash: bytes32(0),
                creationTimestamp: block.timestamp,
                appliedAccountStateIndex: 0
            });
        }

        // Update Deposit Hash based on request
        uint16 accountId = publicKeyToAccountMap(msg.sender);
        bytes32 nextDepositHash = sha256(
            abi.encodePacked(deposits[depositIndex].shaHash, encodeFlux(accountId, tokenId, amount))
        );
        deposits[depositIndex].shaHash = nextDepositHash;

        emit Deposit(accountId, tokenId, amount, depositIndex, deposits[depositIndex].size);
        // Only increment size after event (so it is emitted as an index)
        deposits[depositIndex].size++;
    }

    function applyDeposits(
        uint slot,
        bytes32 _currStateRoot,
        bytes32 _newStateRoot,
        bytes32 _depositHash
    )
        public onlyOwner()
    {
        require(slot != MAX_UINT && slot <= depositIndex, "Requested deposit slot does not exist");
        require(slot == 0 || deposits[slot-1].appliedAccountStateIndex != 0, "Must apply deposit slots in order!");
        require(deposits[slot].shaHash == _depositHash, "Deposits have been reorged");
        require(deposits[slot].appliedAccountStateIndex == 0, "Deposits already processed");
        require(
            block.timestamp > deposits[slot].creationTimestamp + 3 minutes,
            "Requested deposit slot is still active"
        );
        require(stateRoots[stateIndex()] == _currStateRoot, "Incorrect State Root");

        // Note that the only slot that can ever be empty is the first (at index zero)
        // This occurs when no deposits are made within the first 20 blocks of the contract's deployment
        // This code allows for the processing of the empty block and since it will only happen once
        // No, additional verification is necessary.

        stateRoots.push(_newStateRoot);
        deposits[slot].appliedAccountStateIndex = stateIndex();

        emit StateTransition(TransitionType.Deposit, stateIndex(), _newStateRoot, slot);
    }

    /**
     * Withdraws
     */
    function requestWithdrawal(uint8 tokenId, uint128 amount) public onlyRegistered() {
        require(amount != 0, "Must request positive amount");
        require(IdToAddressBiMap.hasId(registeredTokens, tokenId), "Requested token is not registered");
        require(
            ERC20(tokenIdToAddressMap(tokenId)).balanceOf(address(this)) >= amount,
            "Requested amount exceeds contract's balance"
        );

        // Determine or construct correct current withdraw state.
        // This is governed by WITHDRAW_BATCH_SIZE and creationTimestamp
        if (
            withdrawIndex == MAX_UINT ||
            pendingWithdraws[withdrawIndex].size == WITHDRAW_BATCH_SIZE ||
            block.timestamp > pendingWithdraws[withdrawIndex].creationTimestamp + 3 minutes
        ) {
            withdrawIndex++;
            pendingWithdraws[withdrawIndex] = PendingBatch({
                size: 0,
                shaHash: bytes32(0),
                creationTimestamp: block.timestamp,
                appliedAccountStateIndex: 0
            });
        }

        // Update Withdraw Hash based on request
        uint16 accountId = publicKeyToAccountMap(msg.sender);
        bytes32 nextWithdrawHash = sha256(
            abi.encodePacked(pendingWithdraws[withdrawIndex].shaHash, encodeFlux(accountId, tokenId, amount))
        );

        pendingWithdraws[withdrawIndex].shaHash = nextWithdrawHash;

        emit WithdrawRequest(accountId, tokenId, amount, withdrawIndex, pendingWithdraws[withdrawIndex].size);
        // Only increment size after event (so it is emitted as an index)
        pendingWithdraws[withdrawIndex].size++;
    }

    function applyWithdrawals(
        uint slot,
        bytes32 _merkleRoot,
        bytes32 _currStateRoot,
        bytes32 _newStateRoot,
        bytes32 _withdrawHash
    )
        public onlyOwner()
    {
        require(slot != MAX_UINT && slot <= withdrawIndex, "Requested withdrawal slot does not exist");
        require(
            slot == 0 || pendingWithdraws[slot-1].appliedAccountStateIndex != 0,
            "Previous withdraw slot not processed!"
        );
        require(pendingWithdraws[slot].shaHash == _withdrawHash, "Withdraws have been reorged");
        require(pendingWithdraws[slot].appliedAccountStateIndex == 0, "Withdraws already processed");
        require(
            block.timestamp > pendingWithdraws[slot].creationTimestamp + 3 minutes,
            "Requested withdraw slot is still active");
        require(stateRoots[stateIndex()] == _currStateRoot, "Incorrect State Root");

        // Update account states
        stateRoots.push(_newStateRoot);
        pendingWithdraws[slot].appliedAccountStateIndex = stateIndex();

        bool[WITHDRAW_BATCH_SIZE] memory nullArray;
        claimableWithdraws[slot] = ClaimableWithdrawState({
            merkleRoot: _merkleRoot,
            claimedBitmap: nullArray,
            appliedAccountStateIndex: stateIndex()
        });

        emit StateTransition(TransitionType.Withdraw, stateIndex(), _newStateRoot, slot);
    }

    function claimWithdrawal(
        uint slot,
        uint16 inclusionIndex,
        uint16 accountId,
        uint8 tokenId,
        uint128 amount,
        bytes memory proof
    ) public {
        // No need to check tokenId or accountId (wouldn't pass merkle proof if unregistered).
        require(pendingWithdraws[slot].appliedAccountStateIndex > 0, "Requested slot has not been processed");
        require(claimableWithdraws[slot].claimedBitmap[inclusionIndex] == false, "Already claimed");

        bytes32 leaf = encodeFlux(accountId, tokenId, amount);
        require(
            leaf.checkMembership(inclusionIndex, claimableWithdraws[slot].merkleRoot, proof, 7),
            "Failed Merkle membership check."
        );

        // Set claim bitmap to true (indicating that funds have been claimed).
        claimableWithdraws[slot].claimedBitmap[inclusionIndex] = true;

        // There is no situation where contract balance can't afford the upcoming transfer.
        ERC20(tokenIdToAddressMap(tokenId)).transfer(accountToPublicKeyMap(accountId), amount);
    }

    function encodeFlux(uint16 accountId, uint8 tokenId, uint128 amount) internal pure returns (bytes32) {
        return bytes32(uint(amount) + (uint(tokenId) << 128) + (uint(accountId) << 136));
    }
}

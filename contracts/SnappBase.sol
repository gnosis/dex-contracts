pragma solidity ^0.5.0;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "./Merkle.sol";


contract SnappBase is Ownable {
    using Merkle for bytes32;

    uint8 public constant MAX_ACCOUNT_ID = 100;
    uint8 public constant MAX_TOKENS = 30;
    uint8 public constant MAX_DEPOSIT_BATCH_SIZE = 100;
    uint8 public constant MAX_WITHDRAW_BATCH_SIZE = 100;
    
    bytes32[] public stateRoots;  // Pedersen Hash

    enum TransitionType {
        Deposit,
        Withdraw,
        Auction
    }

    // Account Mapping
    mapping (address => uint16) public publicKeyToAccountMap;
    mapping (uint16 => address) public accountToPublicKeyMap;

    // Token Mapping
    uint8 public numTokens;
    mapping (address => uint8) public tokenAddresToIdMap;
    mapping (uint8 => address) public tokenIdToAddressMap;

    struct PendingFlux {
        uint16 size;                   // Number of deposits in this batch
        bytes32 shaHash;               // Rolling shaHash of all deposits
        uint creationBlock;            // Timestamp of batch creation
        uint appliedAccountStateIndex; // accountState index when batch applied (for rollback), 0 implies not applied.
    }

    uint public depositIndex;
    mapping (uint => PendingFlux) public deposits;

    uint public withdrawIndex;
    mapping (uint => PendingFlux) public pendingWithdraws;

    struct ClaimableWithdrawState {
        bytes32 merkleRoot;            // Merkle root of claimable withdraws in this block
        bool[] claimedBitmap;          // Bitmap signalling which withdraws have been claimed
        uint appliedAccountStateIndex; // AccountState when this state was created (for rollback)
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

        deposits[depositIndex].creationBlock = block.number;
        pendingWithdraws[withdrawIndex].creationBlock = block.number;

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

    function getDepositCreationBlock(uint slot) public view returns (uint) {
        return deposits[slot].creationBlock;
    }

    function getDepositHash(uint slot) public view returns (bytes32) {
        return deposits[slot].shaHash;
    }

    function hasWithdrawBeenApplied(uint index) public view returns (bool) {
        return pendingWithdraws[index].appliedAccountStateIndex != 0;
    }

    function getWithdrawCreationBlock(uint slot) public view returns (uint) {
        return pendingWithdraws[slot].creationBlock;
    }

    function getWithdrawHash(uint slot) public view returns (bytes32) {
        return pendingWithdraws[slot].shaHash;
    }

    /**
     * Modifiers
     */
    modifier onlyRegistered() {
        require(publicKeyToAccountMap[msg.sender] != 0, "Must have registered account");
        _;
    }

    /**
     * General Snapp Functionality
     */
    function openAccount(uint16 accountId) public {
        require(accountId != 0, "Account index must be positive!");
        require(accountId <= MAX_ACCOUNT_ID, "Account index exceeds max");

        // Ensure bijectivity of this maps (i.e. address can't occupy > 1 slots)
        require(publicKeyToAccountMap[msg.sender] == 0, "Address occupies account slot");
        require(accountToPublicKeyMap[accountId] == address(0), "Account slot occupied");

        publicKeyToAccountMap[msg.sender] = accountId;
        accountToPublicKeyMap[accountId] = msg.sender;
    }

    function addToken(address _tokenAddress) public onlyOwner() {
        require(tokenAddresToIdMap[_tokenAddress] == 0, "Token already registered!");
        require(numTokens + 1 <= MAX_TOKENS, "Token id exceeds max tokens");

        tokenAddresToIdMap[_tokenAddress] = numTokens + 1;
        tokenIdToAddressMap[numTokens + 1] = _tokenAddress;

        numTokens++;
    }

    /**
     * Deposits
     */
    function deposit(uint8 tokenId, uint128 amount) public onlyRegistered() {
        require(amount != 0, "Must deposit positive amount");

        address tokenAddress = tokenIdToAddressMap[tokenId];
        require(tokenAddress != address(0), "Requested token is not registered");
        require(
            ERC20(tokenAddress).transferFrom(msg.sender, address(this), amount), 
            "Unsuccessful transfer"
        );

        if (deposits[depositIndex].size == MAX_DEPOSIT_BATCH_SIZE || block.number > deposits[depositIndex].creationBlock + 20) {
            depositIndex++;
            deposits[depositIndex] = PendingFlux({
                size: 0,
                shaHash: bytes32(0),
                creationBlock: block.number,
                appliedAccountStateIndex: 0
            });
        }

        // Update Deposit Hash based on request
        uint16 accountId = publicKeyToAccountMap[msg.sender];
        bytes32 nextDepositHash = sha256(
            abi.encodePacked(deposits[depositIndex].shaHash, accountId, tokenId, amount)
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
        require(slot <= depositIndex, "Requested deposit slot does not exist");
        require(slot == 0 || deposits[slot-1].appliedAccountStateIndex != 0, "Must apply deposit slots in order!");
        require(deposits[slot].shaHash == _depositHash, "Deposits have been reorged");
        require(deposits[slot].appliedAccountStateIndex == 0, "Deposits already processed");
        require(block.number > deposits[slot].creationBlock + 20, "Requested deposit slot is still active");
        require(stateRoots[stateIndex()] == _currStateRoot, "Incorrect State Root");

        // Note that the only slot that can ever be empty is the first (at index zero) 
        // This occurs when no deposits are made within the first 20 blocks of the contract's deployment
        // This code allows for the processing of the empty block and since it will only happen once
        // No, additional verificaiton is necessary.  

        stateRoots.push(_newStateRoot);        
        deposits[slot].appliedAccountStateIndex = stateIndex();

        emit StateTransition(TransitionType.Deposit, stateIndex(), _newStateRoot, slot);
    }

    /**
     * Withdraws
     */
    function requestWithdrawal(uint8 tokenId, uint128 amount) public onlyRegistered() {
        require(amount != 0, "Must request positive amount");

        address tokenAddress = tokenIdToAddressMap[tokenId];
        require(tokenAddress != address(0), "Requested token is not registered");
        require(
            ERC20(tokenAddress).balanceOf(address(this)) >= amount,
            "Requested amount exceeds contract's balance"
        );

        // Determine or construct correct current withdraw state.
        // This is governed by MAX_WITHDRAW_BATCH_SIZE and creationBlock
        if (
            pendingWithdraws[withdrawIndex].size == MAX_WITHDRAW_BATCH_SIZE || 
            block.number > pendingWithdraws[withdrawIndex].creationBlock + 20
        ) {
            withdrawIndex++;
            pendingWithdraws[withdrawIndex] = PendingFlux({
                size: 0,
                shaHash: bytes32(0),
                creationBlock: block.number,
                appliedAccountStateIndex: 0
            });
        }

        // Update Withdraw Hash based on request
        uint16 accountId = publicKeyToAccountMap[msg.sender];
        bytes32 nextWithdrawHash = sha256(
            abi.encodePacked(pendingWithdraws[withdrawIndex].shaHash, accountId, tokenId, amount)
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
        require(slot <= withdrawIndex, "Requested withdrawal slot does not exist");
        require(
            slot == 0 || pendingWithdraws[slot-1].appliedAccountStateIndex != 0, 
            "Previous withdraw slot no processed!"
        );
        require(pendingWithdraws[slot].shaHash == _withdrawHash, "Withdraws have been reorged");
        require(pendingWithdraws[slot].appliedAccountStateIndex == 0, "Withdraws already processed");
        require(block.number > pendingWithdraws[slot].creationBlock + 20, "Requested withdraw slot is still active");
        require(stateRoots[stateIndex()] == _currStateRoot, "Incorrect State Root");

        // Update account states
        stateRoots.push(_newStateRoot);
        pendingWithdraws[slot].appliedAccountStateIndex = stateIndex();

        claimableWithdraws[slot] = ClaimableWithdrawState({
            merkleRoot: _merkleRoot,
            claimedBitmap: new bool[](MAX_WITHDRAW_BATCH_SIZE),
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
        
        bytes32 leaf = sha256(abi.encodePacked(accountId, tokenId, amount));
        require(
            leaf.checkMembership(inclusionIndex, claimableWithdraws[slot].merkleRoot, proof, 7),
            "Failed Merkle membership check."
        );
        // Set claim bitmap to true (indicating that funds have been claimed).
        claimableWithdraws[slot].claimedBitmap[inclusionIndex] = true;
        // There is no situation where contract balance can't afford the upcomming transfer.
        ERC20(tokenIdToAddressMap[tokenId]).transfer(accountToPublicKeyMap[accountId], amount);
    }
}

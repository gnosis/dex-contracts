pragma solidity ^0.5.0;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";


contract SnappBase is Ownable {

    uint16 public constant MAX_ACCOUNT_ID = 100;     // TODO - make larger or use uint8
    uint8 public constant MAX_TOKENS = 30;
    uint16 public constant MAX_DEPOSIT_BATCH = 100;  // TODO - make larger or use uint8

    bytes32[] public stateRoots;  // Pedersen Hash

    enum TransitionType {
        Deposit,
        Withdrawal,
        Auction
    }

    mapping (address => uint16) public publicKeyToAccountMap;
    mapping (uint16 => address) public accountToPublicKeyMap;

    uint8 public numTokens;
    mapping (address => uint8) public tokenAddresToIdMap;
    mapping (uint8 => address) public tokenIdToAddressMap;

    struct DepositState {
        uint16 size;                   // Number of deposits in this batch
        bytes32 shaHash;               // Rolling shaHash of all deposits
        uint creationBlock;            // Timestamp of batch creation
        uint appliedAccountStateIndex; // accountState index when batch applied (for rollback)
    }

    uint public depositIndex;
    mapping (uint => DepositState) public deposits;
    //DepositState[] public deposits;

    event Deposit(uint16 accountId, uint8 tokenId, uint amount, uint slot, uint16 slotIndex);
    event StateTransition(TransitionType transitionType, uint from, bytes32 to, uint slot);
    event SnappInitialization(bytes32 stateHash, uint8 maxTokens, uint16 maxAccounts);

    modifier onlyRegistered() {
        require(publicKeyToAccountMap[msg.sender] != 0, "Must have registered account");
        _;
    }

    constructor () public {
        // The initial state should be Pederson hash of an empty balance tree
        bytes32 stateInit = bytes32(0);  // TODO
        stateRoots.push(stateInit);
        deposits[depositIndex] = DepositState({
            size: 0,
            shaHash: bytes32(0),
            creationBlock: block.number,
            appliedAccountStateIndex: 0
        });

        emit SnappInitialization(stateInit, MAX_TOKENS, MAX_ACCOUNT_ID);
    }

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

    function deposit(uint8 tokenIndex, uint amount) public onlyRegistered() {
        require(amount != 0, "Must deposit positive amount");

        address tokenAddress = tokenIdToAddressMap[tokenIndex];
        require(tokenAddress != address(0), "Requested token is not registered");
        require(
            ERC20(tokenAddress).transferFrom(msg.sender, address(this), amount), 
            "Unsuccessful transfer"
        );

        // uint depositIndex = deposits.length - 1;
        DepositState memory currDepositState = deposits[depositIndex];
        if (currDepositState.size == MAX_DEPOSIT_BATCH || block.number > currDepositState.creationBlock + 20) {
            depositIndex++;
            deposits[depositIndex] = DepositState({
                size: 0,
                shaHash: bytes32(0),
                creationBlock: block.number,
                appliedAccountStateIndex: 0   // Default 0 implies not applied.
            });
        }

        // Update Deposit Hash based on request
        uint16 accountId = publicKeyToAccountMap[msg.sender];
        bytes32 nextDepositHash = sha256(
            abi.encodePacked(currDepositState.shaHash, accountId, tokenIndex, amount)
        );
        deposits[depositIndex].shaHash = nextDepositHash;
        deposits[depositIndex].size++;

        emit Deposit(accountId, tokenIndex, amount, depositIndex, currDepositState.size);
    }

    function stateIndex() public view returns (uint) {
        return stateRoots.length - 1;
    }

    function applyDeposits(
        uint slot,
        bytes32 _currStateRoot,
        bytes32 _newStateRoot
    )
        public onlyOwner()
    {   
        require(slot <= depositIndex, "Requested deposit slot does not exist");

        require(slot == 0 || deposits[slot-1].appliedAccountStateIndex != 0, "Must apply deposit slots in order!");
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

    function hasDepositBeenApplied(uint index) public view returns (bool) {
        return deposits[index].appliedAccountStateIndex != 0;
    }

    function isDepositSlotEmpty(uint index) public view returns (bool) {
        return deposits[index].shaHash == bytes32(0);
    }

    function getCurrentStateRoot() public view returns (bytes32) {
        return stateRoots[stateIndex()];
    }
}

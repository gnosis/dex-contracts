pragma solidity ^0.5.0;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";


contract SnappBase is Ownable {

    uint16 public constant MAX_ACCOUNT_ID = 100;
    uint8 public constant MAX_TOKENS = 30;

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
        bytes32 shaHash;
        bool applied;
    }

    uint16 public slotIndex;
    mapping (uint => DepositState) public depositHashes;

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

        uint depositSlot = depositSlot();
        if (depositHashes[depositSlot].shaHash == bytes32(0)) {
            slotIndex = 0;
        }
        uint16 accountId = publicKeyToAccountMap[msg.sender];
        bytes32 nextDepositHash = sha256(
            abi.encodePacked(depositHashes[depositSlot].shaHash, accountId, tokenIndex, amount)
        );
        depositHashes[depositSlot] = DepositState({shaHash: nextDepositHash, applied: false});

        emit Deposit(accountId, tokenIndex, amount, depositSlot, slotIndex);
        slotIndex++;
    }

    function depositSlot() public view returns (uint) {
        return block.number / 20;
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
        require(slot < depositSlot(), "Deposit slot must exist and be inactive");
        require(depositHashes[slot].applied == false, "Deposits already processed");
        require(depositHashes[slot].shaHash != bytes32(0), "Deposit slot is empty");
        require(stateRoots[stateIndex()] == _currStateRoot, "Incorrect State Root");

        stateRoots.push(_newStateRoot);        
        depositHashes[slot].applied = true;

        emit StateTransition(TransitionType.Deposit, this.stateIndex(), _newStateRoot, slot);
    }

    function hasDepositBeenApplied(uint index) public view returns (bool) {
        return depositHashes[index].applied;
    }

    function getCurrentStateRoot() public view returns (bytes32) {
        return stateRoots[stateIndex()];
    }
}
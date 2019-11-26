pragma solidity ^0.5.0;

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "./libraries/SnappBaseCore.sol";
import "@gnosis.pm/solidity-data-structures/contracts/libraries/IdToAddressBiMap.sol";

contract SnappBase is Ownable {
    using SnappBaseCore for SnappBaseCore.Data;
    SnappBaseCore.Data internal coreData;

    constructor() public {
        coreData.init();
    }

    /**
     * Modifiers
     */
    modifier onlyRegistered() {
        require(
            IdToAddressBiMap.hasAddress(
                coreData.registeredAccounts,
                msg.sender
            ),
            "Must have registered account"
        );
        _;
    }

    /**
     * Public View Methods
     */
    function numTokens() public view returns (uint8) {
        return coreData.numTokens;
    }

    function stateIndex() public view returns (uint256) {
        return coreData.stateIndex();
    }

    function getCurrentStateRoot() public view returns (bytes32) {
        return coreData.stateRoots[stateIndex()];
    }

    function getCurrentDepositIndex() public view returns (uint256) {
        return coreData.depositIndex;
    }

    function hasDepositBeenApplied(uint256 index) public view returns (bool) {
        return coreData.deposits[index].appliedAccountStateIndex != 0;
    }

    function getDepositCreationTimestamp(uint256 slot)
        public
        view
        returns (uint256)
    {
        return coreData.deposits[slot].creationTimestamp;
    }

    function getDepositHash(uint256 slot) public view returns (bytes32) {
        return coreData.deposits[slot].shaHash;
    }

    function getCurrentWithdrawIndex() public view returns (uint256) {
        return coreData.withdrawIndex;
    }

    function hasWithdrawBeenApplied(uint256 index) public view returns (bool) {
        return coreData.pendingWithdraws[index].appliedAccountStateIndex != 0;
    }

    function getWithdrawCreationTimestamp(uint256 slot)
        public
        view
        returns (uint256)
    {
        return coreData.pendingWithdraws[slot].creationTimestamp;
    }

    function getWithdrawHash(uint256 slot) public view returns (bytes32) {
        return coreData.pendingWithdraws[slot].shaHash;
    }

    function getClaimableWithdrawHash(uint256 slot)
        public
        view
        returns (bytes32)
    {
        return coreData.claimableWithdraws[slot].merkleRoot;
    }

    function hasWithdrawBeenClaimed(uint256 slot, uint16 index)
        public
        view
        returns (bool)
    {
        return coreData.claimableWithdraws[slot].claimedBitmap[index];
    }

    function isPendingWithdrawActive(uint256 slot) public view returns (bool) {
        return
            block.timestamp <=
            coreData.deposits[slot].creationTimestamp + 3 minutes;
    }

    function publicKeyToAccountMap(address addr) public view returns (uint16) {
        return coreData.publicKeyToAccountMap(addr);
    }

    function accountToPublicKeyMap(uint16 id) public view returns (address) {
        return coreData.accountToPublicKeyMap(id);
    }

    function tokenAddresToIdMap(address addr) public view returns (uint16) {
        return IdToAddressBiMap.getId(coreData.registeredTokens, addr);
    }

    function tokenIdToAddressMap(uint16 id) public view returns (address) {
        return coreData.tokenIdToAddressMap(id);
    }

    function hasAccount(uint16 accountId) public view returns (bool) {
        return IdToAddressBiMap.hasId(coreData.registeredAccounts, accountId);
    }

    /**
     * General Snapp Functionality
     */
    function openAccount(uint16 accountId) public {
        coreData.openAccount(accountId);
    }

    function addToken(address _tokenAddress) public onlyOwner() {
        coreData.addToken(_tokenAddress);
    }

    /**
     * Deposits
     */
    function deposit(uint8 tokenId, uint128 amount) public onlyRegistered() {
        coreData.deposit(tokenId, amount);
    }

    function applyDeposits(
        uint256 slot,
        bytes32 _currStateRoot,
        bytes32 _newStateRoot,
        bytes32 _depositHash
    ) public onlyOwner() {
        coreData.applyDeposits(
            slot,
            _currStateRoot,
            _newStateRoot,
            _depositHash
        );
    }

    /**
     * Withdraws
     */
    function requestWithdrawal(uint8 tokenId, uint128 amount)
        public
        onlyRegistered()
    {
        coreData.requestWithdrawal(tokenId, amount);
    }

    function applyWithdrawals(
        uint256 slot,
        bytes32 _merkleRoot,
        bytes32 _currStateRoot,
        bytes32 _newStateRoot,
        bytes32 _withdrawHash
    ) public onlyOwner() {
        coreData.applyWithdrawals(
            slot,
            _merkleRoot,
            _currStateRoot,
            _newStateRoot,
            _withdrawHash
        );
    }

    function claimWithdrawal(
        uint256 slot,
        uint16 inclusionIndex,
        uint16 accountId,
        uint8 tokenId,
        uint128 amount,
        bytes memory proof
    ) public {
        coreData.claimWithdrawal(
            slot,
            inclusionIndex,
            accountId,
            tokenId,
            amount,
            proof
        );
    }
}

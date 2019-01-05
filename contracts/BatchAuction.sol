pragma solidity ^0.5.0;

contract BatchAuction {

    uint16 MAX_ACCOUNT_NUMBER = 10000;

    mapping (address => uint16) public publicKeyToAccountMap;
    mapping (uint16 => address) public accountToPublicKeyMap;

    event AccountOpened(uint16 indexed depositor);

    function openAccount(uint16 accountIndex) public {
        require(accountIndex > 0, "Account index must be positive!")
        require(accountIndex < MAX_ACCOUNT_NUMBER, "Account index exceeds max");

        // Ensure bijectivity of this maps (i.e. address can't occupy > 1 slots)
        require(publicKeyToAccountMap[msg.sender] == 0, "Address already occupies account slot");
        require(accountToPublicKeyMap[accountIndex] == address(0), "Account slot occupied");

        publicKeyToAccountMap[msg.sender] = accountIndex;
        accountToPublicKeyMap[accountIndex] = msg.sender;
    }
}
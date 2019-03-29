pragma solidity ^0.5.0;

import "./SnappBase.sol";


contract SnappAuction is SnappBase {
  
    uint16 public constant AUCTION_BATCH_SIZE = 1000;

    uint public auctionIndex;
    mapping (uint => PendingBatch) public auctions;

    event SellOrder(
        uint auctionId, 
        uint16 slotIndex,
        uint16 accountId, 
        uint8 buyToken, 
        uint8 sellToken, 
        uint128 buyAmount,
        uint128 sellAmount
    );

    event AuctionSolution(uint auctionId, uint128[MAX_TOKENS] prices, uint128[2*AUCTION_BATCH_SIZE] volumes);

    constructor () public {
        auctions[auctionIndex].creationBlock = block.number;
    }

    function placeSellOrder(
        uint8 buyToken,
        uint8 sellToken,
        uint128 buyAmount,
        uint128 sellAmount
    ) public onlyRegistered() {
        // Must have 0 < tokenId < MAX_TOKENS anyway, so may as well ensure registered.
        require(tokenIdToAddressMap[buyToken] != address(0), "Buy token is not registered");
        require(tokenIdToAddressMap[sellToken] != address(0), "Sell token is not registered");

        // Could also enforce that buyToken != sellToken, but not technically illegal.

        if (
            auctions[auctionIndex].size == AUCTION_BATCH_SIZE || 
            block.number > auctions[auctionIndex].creationBlock + 20
        ) {
            require(
                auctionIndex < 2 || auctions[auctionIndex - 2].appliedAccountStateIndex != 0,
                "Too many pending auctions"
            );
            auctionIndex++;
            auctions[auctionIndex] = PendingBatch({
                size: 0,
                shaHash: bytes32(0),
                creationBlock: block.number,
                appliedAccountStateIndex: 0
            });
        }

        // Update Auction Hash based on request
        uint16 accountId = publicKeyToAccountMap[msg.sender];
        bytes32 nextAuctionHash = sha256(
            abi.encodePacked(
                auctions[auctionIndex].shaHash,
                encodeOrder(accountId, buyToken, sellToken, buyAmount, sellAmount)
            )
        );
        auctions[auctionIndex].shaHash = nextAuctionHash;

        emit SellOrder(auctionIndex, auctions[auctionIndex].size, accountId, buyToken, sellToken, buyAmount, sellAmount);
        // Only increment size after event (so it is emitted as an index)
        auctions[auctionIndex].size++;
    }

    function applyAuction(
        uint slot,
        bytes32 _currStateRoot,
        bytes32 _newStateRoot,
        bytes32 _orderHash,
        uint128[MAX_TOKENS] prices,
        uint128[2*AUCTION_BATCH_SIZE] volumes
    )
        public onlyOwner()
    {   
        require(slot <= auctionIndex, "Requested order slot does not exist");
        require(slot == 0 || auctions[slot-1].appliedAccountStateIndex != 0, "Must apply auction slots in order!");
        require(auctions[slot].shaHash == _orderHash, "OrderHash doesn't agree");
        require(auctions[slot].appliedAccountStateIndex == 0, "Auction already processed");
        require(block.number > auctions[slot].creationBlock + 20, "Requested order slot is still active");
        require(stateRoots[stateIndex()] == _currStateRoot, "Incorrect State Root");

        stateRoots.push(_newStateRoot);        
        auctions[slot].appliedAccountStateIndex = stateIndex();
        
        emit AuctionSolution(slot, prices, volumes);
        emit StateTransition(TransitionType.Auction, stateIndex(), _newStateRoot, slot);
    }

    function encodeOrder(
        uint16 accountId, 
        uint8 buyToken, 
        uint8 sellToken, 
        uint128 buyAmount, 
        uint128 sellAmount
    ) 
        internal pure returns (bytes32) 
    {
        // Restrict buy and sell amount to occupy at most 100 bits.
        require(buyAmount < 0x10000000000000000000000000, "Buy amount too large!");
        require(sellAmount < 0x10000000000000000000000000, "Sell amount too large!");

        // solhint-disable-next-line max-line-length
        return bytes32(uint(accountId) + (uint(buyToken) << 16) + (uint(sellToken) << 24) + (uint(sellAmount) << 32) + (uint(buyAmount) << 132));
    }
}
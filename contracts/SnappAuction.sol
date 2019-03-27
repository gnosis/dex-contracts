pragma solidity ^0.5.0;

import "./SnappBase.sol";


contract SnappAuction is SnappBase {
  
    uint16 public constant AUCTION_BATCH_SIZE = 1000;

    uint public auctionIndex;
    mapping (uint => PendingFlux) public auctions;

    event SellOrder(
        uint auctionId, 
        uint16 slotIndex,
        uint16 accountId, 
        uint8 buyToken, 
        uint8 sellToken, 
        uint128 buyAmount,
        uint128 sellAmount
    );

    constructor () public {
        auctions[auctionIndex].creationBlock = block.number;
    }

    function placeSellOrder(
        uint8 buyToken,
        uint8 sellToken,
        uint128 minBuyAmount,
        uint128 maxSellAmount
    ) public onlyRegistered() {
        require(buyToken != sellToken, "Buy and Sell tokens must differ!");

        // Must have 0 < tokenId < MAX_TOKENS anyway, so might as well ensure registered.
        require(tokenIdToAddressMap[buyToken] != address(0), "Buy token is not registered");
        require(tokenIdToAddressMap[sellToken] != address(0), "Sell token is not registered");

        // Restrict buy and sell amount to occupy less than 100 bits.
        require(minBuyAmount < 0x10000000000000000000000000, "Buy amount too large!");
        require(maxSellAmount < 0x10000000000000000000000000, "Sell amount too large!");

        if (
            auctions[auctionIndex].size == AUCTION_BATCH_SIZE || 
            block.number > auctions[auctionIndex].creationBlock + 20
        ) {
            auctionIndex++;
            auctions[auctionIndex] = PendingFlux({
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
                encodeOrder(accountId, buyToken, sellToken, minBuyAmount, maxSellAmount)
            )
        );
        auctions[auctionIndex].shaHash = nextAuctionHash;

        emit SellOrder(auctionIndex, auctions[auctionIndex].size, accountId, buyToken, sellToken, minBuyAmount, maxSellAmount);
        // Only increment size after event (so it is emitted as an index)
        auctions[auctionIndex].size++;
    }

    function encodeOrder(
        uint16 accountId, 
        uint8 buyToken, 
        uint8 sellToken, 
        uint128 buyAmount, 
        uint128 sellAmount
    ) internal pure returns (bytes32) {
        // solhint-disable-next-line max-line-length
        return bytes32(uint(accountId) + (uint(buyToken) << 16) + (uint(sellToken) << 24) + (uint(sellAmount) << 32) + (uint(buyAmount) << 132));
    }
}
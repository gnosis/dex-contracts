pragma solidity ^0.5.0;

import "./SnappBase.sol";


contract SnappAuction is SnappBase {

    uint16 public constant AUCTION_BATCH_SIZE = 1000;
    uint8 public constant AUCTION_RESERVED_ACCOUNTS = 50;
    uint8 public constant AUCTION_RESERVED_ACCOUNT_BATCH_SIZE = 10;
    
    struct StandingOrderBatch {
        bytes32 orderHash;
        uint validFromIndex; // validity is inclusive of the auction index
        // validToIndex is indirectly given as validFromIndex of next Orderbatch
    }

    struct StandingOrderData {
        mapping(uint => StandingOrderBatch) reservedAccountOrders;
        uint currentBatchIndex;
    }

    mapping (uint16 => StandingOrderData) public standingOrders;

    mapping (uint => uint) indexTransitionBlock;

    uint public auctionIndex = MAX_UINT;
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

    event StandingSellOrderBatch(
        uint currentBatchIndex, 
        uint16 accountId, 
        uint8[] buyToken, 
        uint8[] sellToken, 
        uint128[] buyAmount,
        uint128[] sellAmount
    );

    event AuctionSettlement(
        uint auctionId,
        uint stateIndex,
        bytes32 stateHash,
        bytes pricesAndVolumes
    );

    event AuctionInitialization(
        uint16 maxOrders,
        uint8 numReservedAccounts,
        uint8 ordersPerReservedAccount
    );
    
    constructor () public {
        emit AuctionInitialization(
            AUCTION_BATCH_SIZE, AUCTION_RESERVED_ACCOUNTS, AUCTION_RESERVED_ACCOUNT_BATCH_SIZE
        );
    }

    /**
     * Public View Methods
     */
    function getAuctionCreationTimestamp(uint slot) public view returns (uint) {
        return auctions[slot].creationTimestamp;
    }

    function getOrderHash(uint slot) public view returns (bytes32) {
        return auctions[slot].shaHash;
    }

    function hasAuctionBeenApplied(uint slot) public view returns (bool) {
        return auctions[slot].appliedAccountStateIndex != 0;
    }

    function getStandingOrderHash(uint16 userId, uint128 batchIndex) public view returns (bytes32) {
        return standingOrders[userId].reservedAccountOrders[batchIndex].orderHash;
    }
    
    function getStandingOrderValidFrom(uint16 userId, uint128 batchIndex) public view returns (uint) {
        return standingOrders[userId].reservedAccountOrders[batchIndex].validFromIndex;
    }

    function getStandingOrderValidTo(uint16 userId, uint128 batchIndex) public view returns (uint) {
        uint validTo = standingOrders[userId].reservedAccountOrders[batchIndex + 1].validFromIndex;
        if (validTo == 0) {
            return MAX_UINT;
        } else {
            return validTo - 1; 
        }
    }

    function getStandingOrderCounter(uint16 userId) public view returns (uint) {
        return standingOrders[userId].currentBatchIndex;
    }

    /**
     * Auction Functionality
     */
    function placeStandingSellOrder(
        uint8[] memory buyTokens,
        uint8[] memory sellTokens,
        uint128[] memory buyAmounts,
        uint128[] memory sellAmounts
    ) public onlyRegistered() {
        
        // Update Auction Hash based on request
        uint16 accountId = publicKeyToAccountMap(msg.sender);
        require(accountId <= AUCTION_RESERVED_ACCOUNTS, "Accout is not a reserved account");

        bytes32 orderHash;
        uint numOrders = buyTokens.length;
        require(numOrders <= AUCTION_RESERVED_ACCOUNT_BATCH_SIZE, "Too many orders for reserved batch");
        
        if (
            auctionIndex == MAX_UINT ||
            block.timestamp > (auctions[auctionIndex].creationTimestamp + 3 minutes)
        ) {
            createNewPendingBatch();
        }

        for (uint i = 0; i < numOrders; i++) {
            orderHash = sha256(
                abi.encodePacked(
                    orderHash,
                    encodeOrder(accountId, buyTokens[i], sellTokens[i], buyAmounts[i], sellAmounts[i])
                )
            );
        }        
        uint currentBatchIndex = standingOrders[accountId].currentBatchIndex;
        StandingOrderBatch memory standingOrderBatch = standingOrders[accountId].reservedAccountOrders[currentBatchIndex];
        if (auctionIndex > standingOrderBatch.validFromIndex) {
            currentBatchIndex = currentBatchIndex + 1;
            standingOrders[accountId].currentBatchIndex = currentBatchIndex;
            standingOrderBatch = standingOrders[accountId].reservedAccountOrders[currentBatchIndex];
            standingOrderBatch.validFromIndex = auctionIndex;
            standingOrderBatch.orderHash = orderHash;
        } else {
            standingOrderBatch.orderHash = orderHash;
        }
        //TODO: The case auctionIndex < standingOrderBatch.validFromIndex can happen once roll-backs are implemented
        //Then we have to revert the orderplacement
        standingOrders[accountId].reservedAccountOrders[currentBatchIndex] = standingOrderBatch;
        emit StandingSellOrderBatch(currentBatchIndex, accountId, buyTokens, sellTokens, buyAmounts, sellAmounts);
    }

    function placeSellOrder(
        uint8 buyToken,
        uint8 sellToken,
        uint128 buyAmount,
        uint128 sellAmount
    ) public onlyRegistered() {

        if (
            auctionIndex == MAX_UINT ||
            auctions[auctionIndex].size == maxUnreservedOrderCount() ||
            block.timestamp > (auctions[auctionIndex].creationTimestamp + 3 minutes)
        ) {
            createNewPendingBatch();
        }

        // Update Auction Hash based on request
        uint16 accountId = publicKeyToAccountMap(msg.sender);
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
        bytes32 _transitionBlockHash,
        bytes memory pricesAndVolumes
    )
        public onlyOwner()
    {
        require(slot != MAX_UINT && slot <= auctionIndex, "Requested order slot does not exist");
        require(slot == 0 || auctions[slot-1].appliedAccountStateIndex != 0, "Must apply auction slots in order!");
        require(auctions[slot].appliedAccountStateIndex == 0, "Auction already applied");
        require(auctions[slot].shaHash == _orderHash, "Order hash doesn't agree");
        require(blockhash(indexTransitionBlock[slot]) == _transitionBlockHash, "transitionBlockHash wrong, Solution was not calculated on correct data");
        require(
            block.timestamp > auctions[slot].creationTimestamp + 3 minutes ||
                auctions[slot].size == maxUnreservedOrderCount(),
            "Requested order slot is still active"
        );
        require(stateRoots[stateIndex()] == _currStateRoot, "Incorrect state root");

        stateRoots.push(_newStateRoot);
        auctions[slot].appliedAccountStateIndex = stateIndex();

        // Store solution information in shaHash of pendingBatch (required for snark proof)
        auctions[slot].shaHash = sha256(pricesAndVolumes);

        emit AuctionSettlement(slot, stateIndex(), _newStateRoot, pricesAndVolumes);
    }

    function encodeOrder(
        uint16 accountId,
        uint8 buyToken,
        uint8 sellToken,
        uint128 buyAmount,
        uint128 sellAmount
    ) 
        internal view returns (bytes32) 
    {
        // Restrict buy and sell amount to occupy at most 96 bits.
        require(buyAmount < 0x1000000000000000000000000, "Buy amount too large!");
        require(sellAmount < 0x1000000000000000000000000, "Sell amount too large!");

        // Must have 0 < tokenId < MAX_TOKENS anyway, so may as well ensure registered.
        require(buyToken < numTokens, "Buy token is not registered");
        require(sellToken < numTokens, "Sell token is not registered");

        // Could also enforce that buyToken != sellToken, but not technically illegal.

        // solhint-disable-next-line max-line-length
        return bytes32(uint(accountId) + (uint(buyToken) << 16) + (uint(sellToken) << 24) + (uint(sellAmount) << 32) + (uint(buyAmount) << 128));
    }

    function maxUnreservedOrderCount() internal pure returns (uint16) {
        return AUCTION_BATCH_SIZE - (AUCTION_RESERVED_ACCOUNTS * AUCTION_RESERVED_ACCOUNT_BATCH_SIZE);
    }

    function createNewPendingBatch() internal {
        require(
                auctionIndex == MAX_UINT || auctionIndex < 2 || auctions[auctionIndex - 2].appliedAccountStateIndex != 0,
                "Too many pending auctions"
            );
        indexTransitionBlock[auctionIndex] = block.number;    
        auctionIndex++;
        auctions[auctionIndex] = PendingBatch({
            size: 0,
            shaHash: bytes32(0),
            creationTimestamp: block.timestamp,
            appliedAccountStateIndex: 0
        });
    }
}

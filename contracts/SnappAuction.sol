pragma solidity ^0.5.0;

import "./SnappBase.sol";
import "solidity-bytes-utils/contracts/BytesLib.sol";


contract SnappAuction is SnappBase {
    using BytesLib for bytes;

    uint public constant MAX_UINT = 2**256 - 1;
    uint16 public constant AUCTION_BATCH_SIZE = 1000;
    uint16 public constant AUCTION_RESERVED_ACCOUNTS = 50;
    uint16 public constant AUCTION_RESERVED_ACCOUNT_BATCH_SIZE = 10;

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

    uint public auctionIndex = MAX_UINT;
    mapping (uint => SnappBaseCore.PendingBatch) public auctions;

    event SellOrder(
        uint auctionId,
        uint16 slotStartIndex,
        uint16 accountId,
        bytes packedOrder
    );

    event StandingSellOrderBatch(
        uint currentBatchIndex,
        uint16 accountId,
        bytes packedOrders
    );

    event AuctionSettlement(
        uint auctionId,
        uint stateIndex,
        bytes32 stateHash,
        bytes pricesAndVolumes
    );

    event AuctionInitialization(
        uint16 maxOrders,
        uint16 numReservedAccounts,
        uint16 ordersPerReservedAccount
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
        bytes memory packedOrders
    ) public onlyRegistered() {

        // Update Auction Hash based on request
        uint16 accountId = publicKeyToAccountMap(msg.sender);
        require(accountId <= AUCTION_RESERVED_ACCOUNTS, "Accout is not a reserved account");

        require(packedOrders.length % 26 == 0, "Each order should be packed in 26 bytes!");
        uint numOrders = packedOrders.length / 26;
        require(numOrders <= AUCTION_RESERVED_ACCOUNT_BATCH_SIZE, "Too many orders for reserved batch");

        if (
            auctionIndex == MAX_UINT ||
            block.timestamp > (auctions[auctionIndex].creationTimestamp + 3 minutes)
        ) {
            createNewPendingBatch();
        }
        bytes32 orderHash;
        for (uint i = 0; i < numOrders; i++) {
            orderHash = calculateNextOrderHashIteration(packedOrders.slice(26*i, 26), orderHash, accountId);
        }
        uint currentBatchIndex = standingOrders[accountId].currentBatchIndex;
        StandingOrderBatch memory currentOrderBatch = standingOrders[accountId].reservedAccountOrders[currentBatchIndex];
        if (auctionIndex > currentOrderBatch.validFromIndex) {
            currentBatchIndex = currentBatchIndex + 1;
            standingOrders[accountId].currentBatchIndex = currentBatchIndex;
            currentOrderBatch = standingOrders[accountId].reservedAccountOrders[currentBatchIndex];
            currentOrderBatch.validFromIndex = auctionIndex;
            currentOrderBatch.orderHash = orderHash;
        } else {
            currentOrderBatch.orderHash = orderHash;
        }
        //TODO: The case auctionIndex < currentOrderBatch.validFromIndex can happen once roll-backs are implemented
        //Then we have to revert the orderplacement
        standingOrders[accountId].reservedAccountOrders[currentBatchIndex] = currentOrderBatch;
        emit StandingSellOrderBatch(currentBatchIndex, accountId, packedOrders);
    }

    function placeSellOrder(
        uint8 buyToken,
        uint8 sellToken,
        uint96 buyAmount,
        uint96 sellAmount
    ) public {
        // Ignore first 4 bytes padding and last two bytes accountId
        bytes memory packed = abi.encodePacked(encodeOrder(0, buyToken, sellToken, buyAmount, sellAmount));
        placeSellOrders(BytesLib.slice(packed, 4, 26));
    }

    function placeSellOrders(bytes memory packedOrders) public onlyRegistered() {
        // Note that this could result failure of all orders if even one fails.
        require(packedOrders.length % 26 == 0, "Each order should be packed in 26 bytes!");
        // TODO - use ECRecover from signature contained in first 65 bytes of packedOrder
        uint16 accountId = publicKeyToAccountMap(msg.sender);

        for (uint i = 0; i < packedOrders.length / 26; i++) {
            createNewPendingBatchIfNecessary();
            bytes32 nextAuctionHash = calculateNextOrderHashIteration(
                packedOrders.slice(26*i, 26),
                auctions[auctionIndex].shaHash,
                accountId
            );
            // TODO - auctions.shaHash should only need to be updated once (per index) on the outside of this loop
            auctions[auctionIndex].shaHash = nextAuctionHash;

            // Only increment size after event (so it is emitted as an index)
            auctions[auctionIndex].size++;
        }
        emit SellOrder(
            auctionIndex, auctions[auctionIndex].size, accountId, packedOrders
            );
    }

    function applyAuction(
        uint slot,
        bytes32 _currStateRoot,
        bytes32 _newStateRoot,
        bytes32 _orderHash,
        bytes memory pricesAndVolumes
    )
        public onlyOwner()
    {
        require(slot != MAX_UINT && slot <= auctionIndex, "Requested order slot does not exist");
        require(slot == 0 || auctions[slot-1].appliedAccountStateIndex != 0, "Must apply auction slots in order!");
        require(auctions[slot].appliedAccountStateIndex == 0, "Auction already applied");
        require(auctions[slot].shaHash == _orderHash, "Order hash doesn't agree");
        require(
            block.timestamp > auctions[slot].creationTimestamp + 3 minutes ||
                auctions[slot].size == maxUnreservedOrderCount(),
            "Requested order slot is still active"
        );
        require(coreData.stateRoots[stateIndex()] == _currStateRoot, "Incorrect state root");

        coreData.stateRoots.push(_newStateRoot);
        auctions[slot].appliedAccountStateIndex = stateIndex();

        // Store solution information in shaHash of pendingBatch (required for snark proof)
        auctions[slot].shaHash = sha256(pricesAndVolumes);

        emit AuctionSettlement(slot, stateIndex(), _newStateRoot, pricesAndVolumes);
    }

    function maxUnreservedOrderCount() public pure returns (uint16) {
        return AUCTION_BATCH_SIZE - (AUCTION_RESERVED_ACCOUNTS * AUCTION_RESERVED_ACCOUNT_BATCH_SIZE);
    }

    function encodeOrder(
        uint16 accountId,
        uint8 buyToken,
        uint8 sellToken,
        uint96 buyAmount,
        uint96 sellAmount
    )
        internal view returns (bytes32)
    {
        // Must have 0 <= tokenId < MAX_TOKENS anyway, so may as well ensure registered.
        require(buyToken < coreData.numTokens, "Buy token is not registered");
        require(sellToken < coreData.numTokens, "Sell token is not registered");
        // Could also enforce that buyToken != sellToken, but not technically illegal.

        // solhint-disable-next-line max-line-length
        return bytes32(uint(accountId) + (uint(buyToken) << 16) + (uint(sellToken) << 24) + (uint(sellAmount) << 32) + (uint(buyAmount) << 128));
    }

    function calculateNextOrderHashIteration(bytes memory orderData, bytes32 previousHash, uint16 accountId) internal view
        returns(bytes32)
    {
        uint96 buyAmount;
        assembly {  // solhint-disable no-inline-assembly
            buyAmount := mload(add(add(orderData, 0xc), 0))
        }
        uint96 sellAmount;
        assembly {  // solhint-disable no-inline-assembly
            sellAmount := mload(add(add(orderData, 0xc), 12))
        }

        uint8 sellToken = BytesLib.toUint8(orderData, 24);
        uint8 buyToken = BytesLib.toUint8(orderData, 25);

        return sha256(
            abi.encodePacked(
                    previousHash,
                    encodeOrder(accountId, buyToken, sellToken, buyAmount, sellAmount)
                )
            );
    }

    function createNewPendingBatch() internal {
        require(
            auctionIndex == MAX_UINT || auctionIndex < 2 || auctions[auctionIndex - 2].appliedAccountStateIndex != 0,
            "Too many pending auctions"
        );
        auctionIndex++;
        auctions[auctionIndex] = SnappBaseCore.PendingBatch({
            size: 0,
            shaHash: bytes32(0),
            creationTimestamp: block.timestamp,
            appliedAccountStateIndex: 0
        });
    }

    function createNewPendingBatchIfNecessary() private {
        if (
            auctionIndex == MAX_UINT ||
            auctions[auctionIndex].size == maxUnreservedOrderCount() ||
            block.timestamp > (auctions[auctionIndex].creationTimestamp + 3 minutes)
        ) {
            createNewPendingBatch();
        }
    }
}

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

    mapping (uint24 => StandingOrderData) public standingOrders;

    uint public auctionIndex = MAX_UINT;
    mapping (uint => SnappBaseCore.PendingBatch) public auctions;

    event SellOrder(
        uint auctionId,
        uint16 slotIndex,
        uint24 accountId,
        uint8 buyToken,
        uint8 sellToken,
        uint96 buyAmount,
        uint96 sellAmount
    );

    event StandingSellOrderBatch(
        uint currentBatchIndex,
        uint24 accountId,
        uint8[] buyToken,
        uint8[] sellToken,
        uint96[] buyAmount,
        uint96[] sellAmount
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

    function getStandingOrderHash(uint24 accountId, uint128 batchIndex) public view returns (bytes32) {
        return standingOrders[accountId].reservedAccountOrders[batchIndex].orderHash;
    }

    function getStandingOrderValidFrom(uint24 accountId, uint128 batchIndex) public view returns (uint) {
        return standingOrders[accountId].reservedAccountOrders[batchIndex].validFromIndex;
    }

    function getStandingOrderValidTo(uint24 accountId, uint128 batchIndex) public view returns (uint) {
        uint validTo = standingOrders[accountId].reservedAccountOrders[batchIndex + 1].validFromIndex;
        if (validTo == 0) {
            return MAX_UINT;
        } else {
            return validTo - 1;
        }
    }

    function getStandingOrderCounter(uint24 accountId) public view returns (uint) {
        return standingOrders[accountId].currentBatchIndex;
    }

    /**
     * Auction Functionality
     */
    function placeStandingSellOrder(
        uint8[] memory buyTokens,
        uint8[] memory sellTokens,
        uint96[] memory buyAmounts,
        uint96[] memory sellAmounts
    ) public onlyRegistered() {

        // Update Auction Hash based on request
        uint24 accountId = publicKeyToAccountMap(msg.sender);
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
        emit StandingSellOrderBatch(currentBatchIndex, accountId, buyTokens, sellTokens, buyAmounts, sellAmounts);
    }

    function placeSellOrder(
        uint8 buyToken,
        uint8 sellToken,
        uint96 buyAmount,
        uint96 sellAmount
    ) public onlyRegistered() {
        createNewPendingBatchIfNecessary();

        // Update Auction Hash based on request
        uint24 accountId = publicKeyToAccountMap(msg.sender);
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

    function placeSellOrders(bytes memory packedOrders) public onlyRegistered() {
        // Note that this could result failure of all orders if even one fails.
        require(packedOrders.length % 26 == 0, "Each order should be packed in 26 bytes!");
        // TODO - use ECRecover from signature contained in first 65 bytes of packedOrder
        uint24 accountId = publicKeyToAccountMap(msg.sender);
        bytes memory orderData;

        for (uint i = 0; i < packedOrders.length / 26; i++) {
            orderData = packedOrders.slice(26*i, 26);

            uint8 buyToken = BytesLib.toUint8(orderData, 0);
            uint8 sellToken = BytesLib.toUint8(orderData, 1);

            uint96 buyAmount;
            assembly {  // solhint-disable no-inline-assembly
                buyAmount := mload(add(add(orderData, 0xc), 2))
            }
            uint96 sellAmount;
            assembly {  // solhint-disable no-inline-assembly
                sellAmount := mload(add(add(orderData, 0xc), 14))
            }
            createNewPendingBatchIfNecessary();
            bytes32 nextAuctionHash = sha256(
                abi.encodePacked(
                    auctions[auctionIndex].shaHash,  // TODO - Below todo will affect this.
                    encodeOrder(accountId, buyToken, sellToken, buyAmount, sellAmount)
                )
            );
            // TODO - auctions.shaHash should only need to be updated once (per index) on the outside of this loop
            auctions[auctionIndex].shaHash = nextAuctionHash;
            emit SellOrder(
                auctionIndex, auctions[auctionIndex].size, accountId, buyToken, sellToken, buyAmount, sellAmount
            );
            // Only increment size after event (so it is emitted as an index)
            auctions[auctionIndex].size++;
        }
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
        uint24 accountId,
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

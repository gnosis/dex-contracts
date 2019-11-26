pragma solidity ^0.5.0;

import "./SnappBase.sol";
import "solidity-bytes-utils/contracts/BytesLib.sol";

contract SnappAuction is SnappBase {
    using BytesLib for bytes;

    uint256 public constant MAX_UINT = 2**256 - 1;
    uint16 public constant AUCTION_BATCH_SIZE = 1000;
    uint16 public constant AUCTION_RESERVED_ACCOUNTS = 50;
    uint16 public constant AUCTION_RESERVED_ACCOUNT_BATCH_SIZE = 10;

    struct StandingOrderBatch {
        bytes32 orderHash;
        uint256 validFromIndex; // validity is inclusive of the auction index
        // validToIndex is indirectly given as validFromIndex of next Orderbatch
    }

    struct StandingOrderData {
        mapping(uint256 => StandingOrderBatch) reservedAccountOrders;
        uint256 currentBatchIndex;
    }

    mapping(uint16 => StandingOrderData) public standingOrders;

    uint256 public auctionIndex = MAX_UINT;

    struct PendingAuction {
        // Order Collection fields
        bytes32 orderHash; // Rolling shaHash of all orders
        uint16 numOrders; // Number of orders in this auction
        uint256 creationTimestamp; // Timestamp of batch creation
        // Solution Bidding phase
        address solver;
        uint256 objectiveValue; // Traders utility
        bytes32 tentativeState; // Proposed account state during bidding phase
        // Auction Settlement phase
        bytes32 solutionHash; // Succinct record of trade execution & prices
        uint256 auctionAppliedTime; // Time auction was applied (written at time of solutionHash)
        uint256 appliedAccountStateIndex; // stateIndex when batch applied - 0 implies unapplied.
    }

    mapping(uint256 => PendingAuction) public auctions;

    event SellOrder(
        uint256 auctionId,
        uint16 slotIndex,
        uint16 accountId,
        uint8 buyToken,
        uint8 sellToken,
        uint96 buyAmount,
        uint96 sellAmount
    );

    event StandingSellOrderBatch(
        uint256 currentBatchIndex,
        uint256 validFromAuctionId,
        uint16 accountId,
        bytes packedOrders
    );

    event AuctionSettlement(
        uint256 auctionId,
        uint256 stateIndex,
        bytes32 stateHash,
        bytes pricesAndVolumes
    );

    event AuctionInitialization(
        uint16 maxOrders,
        uint16 numReservedAccounts,
        uint16 ordersPerReservedAccount
    );

    constructor() public {
        emit AuctionInitialization(
            AUCTION_BATCH_SIZE,
            AUCTION_RESERVED_ACCOUNTS,
            AUCTION_RESERVED_ACCOUNT_BATCH_SIZE
        );
    }

    /**
     * Public View Methods
     */
    function getAuctionCreationTimestamp(uint256 slot)
        public
        view
        returns (uint256)
    {
        return auctions[slot].creationTimestamp;
    }

    function getOrderHash(uint256 slot) public view returns (bytes32) {
        return auctions[slot].orderHash;
    }

    function hasAuctionBeenApplied(uint256 slot) public view returns (bool) {
        return auctions[slot].appliedAccountStateIndex != 0;
    }

    function getStandingOrderHash(uint16 userId, uint128 batchIndex)
        public
        view
        returns (bytes32)
    {
        return
            standingOrders[userId].reservedAccountOrders[batchIndex].orderHash;
    }

    function getStandingOrderValidFrom(uint16 userId, uint128 batchIndex)
        public
        view
        returns (uint256)
    {
        return
            standingOrders[userId].reservedAccountOrders[batchIndex]
                .validFromIndex;
    }

    function getStandingOrderValidTo(uint16 userId, uint128 batchIndex)
        public
        view
        returns (uint256)
    {
        uint256 validTo = standingOrders[userId]
            .reservedAccountOrders[batchIndex + 1]
            .validFromIndex;
        if (validTo == 0) {
            return MAX_UINT;
        } else {
            return validTo - 1;
        }
    }

    function getStandingOrderCounter(uint16 userId)
        public
        view
        returns (uint256)
    {
        return standingOrders[userId].currentBatchIndex;
    }

    function biddingStartTime(uint256 slot) public view returns (uint256) {
        // Solution bidding can only begin once the previous auction has settled
        // A1: | order collection | solution bidding | solution posting |
        // A2: |                  | order collection | solution bidding |  solution posting
        // biddingStartTime = max(currentBatch.creationTimestamp + 3 minutes, previousBatch.auctionAppliedTime)
        uint256 bidStart = auctions[slot].creationTimestamp + 3 minutes;
        if (slot > 0 && auctions[slot - 1].auctionAppliedTime > bidStart) {
            bidStart = auctions[slot - 1].auctionAppliedTime;
        }
        return bidStart;
    }

    /**
     * Auction Functionality
     */
    function placeStandingSellOrder(bytes memory packedOrders)
        public
        onlyRegistered()
    {
        // Update Auction Hash based on request
        uint16 accountId = publicKeyToAccountMap(msg.sender);
        require(
            accountId <= AUCTION_RESERVED_ACCOUNTS,
            "Account is not a reserved account"
        );

        require(
            packedOrders.length % 26 == 0,
            "Each order should be packed in 26 bytes!"
        );
        uint256 numOrders = packedOrders.length / 26;
        require(
            numOrders <= AUCTION_RESERVED_ACCOUNT_BATCH_SIZE,
            "Too many orders for reserved batch"
        );

        if (
            auctionIndex == MAX_UINT ||
            block.timestamp >
            (auctions[auctionIndex].creationTimestamp + 3 minutes)
        ) {
            createNewPendingBatch();
        }
        bytes32 orderHash;
        for (uint256 i = 0; i < numOrders; i++) {
            // solhint-disable-next-line indent
            (uint8 buyToken, uint8 sellToken, uint96 buyAmount, uint96 sellAmount) = decodeOrder(
                packedOrders.slice(26 * i, 26)
            );

            orderHash = sha256(
                abi.encodePacked(
                    orderHash,
                    encodeOrder(
                        accountId,
                        buyToken,
                        sellToken,
                        buyAmount,
                        sellAmount
                    )
                )
            );
        }
        uint256 currentBatchIndex = standingOrders[accountId].currentBatchIndex;
        StandingOrderBatch memory currentOrderBatch = standingOrders[accountId]
            .reservedAccountOrders[currentBatchIndex];
        if (auctionIndex > currentOrderBatch.validFromIndex) {
            currentBatchIndex = currentBatchIndex + 1;
            standingOrders[accountId].currentBatchIndex = currentBatchIndex;
            currentOrderBatch = standingOrders[accountId]
                .reservedAccountOrders[currentBatchIndex];
            currentOrderBatch.validFromIndex = auctionIndex;
            currentOrderBatch.orderHash = orderHash;
        } else {
            currentOrderBatch.orderHash = orderHash;
        }
        //TODO: The case auctionIndex < currentOrderBatch.validFromIndex can happen once roll-backs are implemented
        //Then we have to revert the orderplacement
        standingOrders[accountId]
            .reservedAccountOrders[currentBatchIndex] = currentOrderBatch;
        emit StandingSellOrderBatch(
            currentBatchIndex,
            auctionIndex,
            accountId,
            packedOrders
        );
    }

    function placeSellOrder(
        uint8 buyToken,
        uint8 sellToken,
        uint96 buyAmount,
        uint96 sellAmount
    ) public {
        // Ignore first 4 bytes padding and last two bytes accountId
        bytes memory packed = abi.encodePacked(
            encodeOrder(0, buyToken, sellToken, buyAmount, sellAmount)
        );
        placeSellOrders(BytesLib.slice(packed, 4, 26));
    }

    function placeSellOrders(bytes memory packedOrders)
        public
        onlyRegistered()
    {
        // Note that this could result failure of all orders if even one fails.
        require(
            packedOrders.length % 26 == 0,
            "Each order should be packed in 26 bytes!"
        );
        // TODO - use ECRecover from signature contained in first 65 bytes of packedOrder
        uint16 accountId = publicKeyToAccountMap(msg.sender);
        for (uint256 i = 0; i < packedOrders.length / 26; i++) {
            // solhint-disable-next-line indent
            (uint8 buyToken, uint8 sellToken, uint96 buyAmount, uint96 sellAmount) = decodeOrder(
                packedOrders.slice(26 * i, 26)
            );

            createNewPendingBatchIfNecessary();
            bytes32 nextAuctionHash = sha256(
                abi.encodePacked(
                    auctions[auctionIndex].orderHash, // TODO - Below todo will affect this.
                    encodeOrder(
                        accountId,
                        buyToken,
                        sellToken,
                        buyAmount,
                        sellAmount
                    )
                )
            );
            // TODO - auctions.orderHash should only need to be updated once (per index) on the outside of this loop
            auctions[auctionIndex].orderHash = nextAuctionHash;
            emit SellOrder(
                auctionIndex,
                auctions[auctionIndex].numOrders,
                accountId,
                buyToken,
                sellToken,
                buyAmount,
                sellAmount
            );
            // Only increment size after event (so it is emitted as an index)
            auctions[auctionIndex].numOrders++;
        }
    }

    function auctionSolutionBid(
        uint256 slot,
        bytes32 _currStateRoot,
        bytes32 _orderHash,
        uint128[] memory _standingOrderIndex,
        bytes32 proposedStateRoot,
        uint256 proposedObjectiveValue
    ) public {
        require(
            slot == 0 || auctions[slot - 1].appliedAccountStateIndex != 0,
            "Previous auction not yet resolved!"
        );

        // Ensure that auction batch is inactive, unprocessed and in correct phase for bidding
        require(
            auctions[slot].appliedAccountStateIndex == 0,
            "Auction already applied"
        );
        require(
            slot != MAX_UINT && slot <= auctionIndex,
            "Requested auction slot does not exist"
        );
        require(
            block.timestamp > biddingStartTime(slot) ||
                auctions[slot].numOrders == maxUnreservedOrderCount(),
            "Requested auction slot is still active"
        );
        require(
            block.timestamp < biddingStartTime(slot) + 3 minutes,
            "Bidding period for this auction has expired"
        );

        require(
            coreData.stateRoots[stateIndex()] == _currStateRoot,
            "Incorrect state root"
        );
        require(
            calculateOrderHash(slot, _standingOrderIndex) == _orderHash,
            "Order hash doesn't agree"
        );

        // Ensure proposed value exceeds current max.
        require(
            auctions[slot].objectiveValue == 0 ||
                proposedObjectiveValue > auctions[slot].objectiveValue,
            "Proposed objective value is less than existing"
        );

        // Set appropriate fields in auction batch
        auctions[slot].solver = msg.sender;
        auctions[slot].objectiveValue = proposedObjectiveValue;
        auctions[slot].tentativeState = proposedStateRoot;
    }

    function applyAuction(
        uint256 slot,
        bytes32 _currStateRoot,
        bytes32 newStateRoot, // Only needed in the case of fallback
        bytes memory pricesAndVolumes // Can be empty in the trivial case.
    ) public onlyOwner() {
        // Auction related constraints (slot exists, is inactive, no previous auction pending and not already applied)
        require(
            slot != MAX_UINT && slot <= auctionIndex,
            "Requested auction slot does not exist"
        );
        require(
            slot == 0 || auctions[slot - 1].appliedAccountStateIndex != 0,
            "Must apply auction slots in order!"
        );
        require(
            auctions[slot].appliedAccountStateIndex == 0,
            "Auction already applied"
        );

        // State related constraints (order hash and state root agree)
        require(
            coreData.stateRoots[stateIndex()] == _currStateRoot,
            "Incorrect state root"
        );

        // Phase related constraints
        require(
            block.timestamp > auctions[slot].creationTimestamp + 3 minutes ||
                auctions[slot].numOrders == maxUnreservedOrderCount(),
            "Requested auction slot is still active"
        );
        require(
            block.timestamp > biddingStartTime(slot) + 3 minutes,
            "Requested auction still in bidding phase or earlier"
        );

        if (
            block.timestamp < biddingStartTime(slot) + 270 seconds &&
            auctions[slot].solver != address(0)
        ) {
            // Winner Apply Auction
            require(
                auctions[slot].solver == msg.sender,
                "Only winner of bidding phase may apply auction here"
            );
            internalApplyAuction(
                slot,
                auctions[slot].tentativeState,
                pricesAndVolumes
            );
        } else if (block.timestamp < biddingStartTime(slot) + 6 minutes) {
            // Fallback Apply Auction
            internalApplyAuction(slot, newStateRoot, pricesAndVolumes);
        } else {
            // Trivial Apply Auction
            bytes memory trivialSolution; // p_i = 1 and (bA, sA)_j = (0, 0) \forall i, j
            internalApplyAuction(
                slot,
                coreData.stateRoots[stateIndex()],
                trivialSolution
            );
        }
    }

    function calculateOrderHash(
        uint256 slot,
        uint128[] memory _standingOrderIndex
    ) public view returns (bytes32) {
        bytes32[] memory orderHashes = new bytes32[](AUCTION_RESERVED_ACCOUNTS);
        for (uint256 i = 0; i < AUCTION_RESERVED_ACCOUNTS; i++) {
            require(
                orderBatchIsValidAtAuctionIndex(
                    slot,
                    uint8(i),
                    _standingOrderIndex[i]
                ),
                "invalid standingOrderBatch referenced"
            );
            orderHashes[i] = standingOrders[uint16(i)]
                .reservedAccountOrders[_standingOrderIndex[i]]
                .orderHash;
        }
        return sha256(abi.encodePacked(auctions[slot].orderHash, orderHashes));
    }

    function orderBatchIsValidAtAuctionIndex(
        uint256 _auctionIndex,
        uint8 userId,
        uint128 orderBatchIndex
    ) public view returns (bool) {
        return
            _auctionIndex >=
            getStandingOrderValidFrom(userId, orderBatchIndex) &&
            _auctionIndex <= getStandingOrderValidTo(userId, orderBatchIndex);
    }

    function maxUnreservedOrderCount() public pure returns (uint16) {
        return
            AUCTION_BATCH_SIZE -
            (AUCTION_RESERVED_ACCOUNTS * AUCTION_RESERVED_ACCOUNT_BATCH_SIZE);
    }

    function encodeOrder(
        uint16 accountId,
        uint8 buyToken,
        uint8 sellToken,
        uint96 buyAmount,
        uint96 sellAmount
    ) internal view returns (bytes32) {
        // Must have 0 <= tokenId < MAX_TOKENS anyway, so may as well ensure registered.
        require(buyToken < coreData.numTokens, "Buy token is not registered");
        require(sellToken < coreData.numTokens, "Sell token is not registered");
        // Could also enforce that buyToken != sellToken, but not technically illegal.

        // solhint-disable-next-line max-line-length
        return
            bytes32(
                uint256(accountId) +
                    (uint256(buyToken) << 16) +
                    (uint256(sellToken) << 24) +
                    (uint256(sellAmount) << 32) +
                    (uint256(buyAmount) << 128)
            );
    }

    function decodeOrder(bytes memory orderData)
        internal
        pure
        returns (
            uint8 buyToken,
            uint8 sellToken,
            uint96 buyAmount,
            uint96 sellAmount
        )
    {
        buyAmount = BytesLib.toUint96(orderData, 0);
        sellAmount = BytesLib.toUint96(orderData, 12);

        sellToken = BytesLib.toUint8(orderData, 24);
        buyToken = BytesLib.toUint8(orderData, 25);
    }

    function internalApplyAuction(
        uint256 slot,
        bytes32 newStateRoot,
        bytes memory pricesAndVolumes
    ) internal {
        coreData.stateRoots.push(newStateRoot);
        auctions[slot].appliedAccountStateIndex = stateIndex();
        auctions[slot].solutionHash = sha256(pricesAndVolumes);
        auctions[slot].auctionAppliedTime = block.timestamp;
        emit AuctionSettlement(
            slot,
            stateIndex(),
            newStateRoot,
            pricesAndVolumes
        );
    }

    function createNewPendingBatch() internal {
        require(
            auctionIndex == MAX_UINT ||
                auctionIndex < 2 ||
                auctions[auctionIndex - 2].appliedAccountStateIndex != 0,
            "Too many pending auctions"
        );
        auctionIndex++;
        auctions[auctionIndex] = PendingAuction({
            orderHash: bytes32(0),
            numOrders: 0,
            creationTimestamp: block.timestamp,
            solver: address(0),
            objectiveValue: 0,
            tentativeState: bytes32(0),
            solutionHash: bytes32(0),
            auctionAppliedTime: 0,
            appliedAccountStateIndex: 0
        });
    }

    function createNewPendingBatchIfNecessary() private {
        if (
            auctionIndex == MAX_UINT ||
            auctions[auctionIndex].numOrders == maxUnreservedOrderCount() ||
            block.timestamp >
            (auctions[auctionIndex].creationTimestamp + 3 minutes)
        ) {
            createNewPendingBatch();
        }
    }
}

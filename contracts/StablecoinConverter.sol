pragma solidity ^0.5.0;

import "./EpochTokenLocker.sol";
import "./libraries/IdToAddressBiMap.sol";
import "solidity-bytes-utils/contracts/BytesLib.sol";
import "./libraries/IdToAddressBiMap.sol";


contract StablecoinConverter is EpochTokenLocker {
    using SafeMath for uint128;
    using BytesLib for bytes32;

    event OrderPlacement(
        address owner,
        uint16 buyToken,
        uint16 sellToken,
        bool isSellOrder,
        uint32 validFrom,
        uint32 validUntil,
        uint128 buyAmount,
        uint128 sellAmount
    );

    event OrderCancelation(
        address owner,
        uint id
    );

    //outstanding volume of an order is encoded as buyAmount or sellAmount depending on isSellOrder
    struct Order {
        uint16 buyToken;
        uint16 sellToken;
        uint32 validFrom;  // order is valid from auction collection period: validFrom inclusively
        uint32 validUntil;  // order is valid till auction collection period: validUntil inclusively
        bool isSellOrder;
        uint128 buyAmount;
        uint128 sellAmount;
    }

    // User-> Order
    mapping(address => Order[]) public orders;

    IdToAddressBiMap.Data private registeredTokens;

    uint public MAX_TOKENS; // solhint-disable-line
    uint16 public numTokens = 0;

    constructor(uint maxTokens) public {
        MAX_TOKENS = maxTokens;
    }

    function addToken(address _tokenAddress) public {
        require(numTokens < MAX_TOKENS, "Max tokens reached");
        require(
            IdToAddressBiMap.insert(registeredTokens, numTokens, _tokenAddress),
            "Token already registered"
        );
        numTokens++;
    }

    function placeOrder(
        uint16 buyToken,
        uint16 sellToken,
        bool isSellOrder,
        uint32 validUntil,
        uint128 buyAmount,
        uint128 sellAmount
    ) public returns (uint) {
        orders[msg.sender].push(Order({
            buyToken: buyToken,
            sellToken: sellToken,
            validFrom: getCurrentStateIndex(),
            validUntil: validUntil,
            isSellOrder: isSellOrder,
            buyAmount: buyAmount,
            sellAmount: sellAmount
        }));
        emit OrderPlacement(
            msg.sender,
            buyToken,
            sellToken,
            isSellOrder,
            getCurrentStateIndex(),
            validUntil,
            buyAmount,
            sellAmount
        );
        return orders[msg.sender].length - 1;
    }

    function cancelOrder(
        uint id
    ) public {
        orders[msg.sender][id].validUntil = getCurrentStateIndex() - 1;
        emit OrderCancelation(msg.sender, id);
    }

    function freeStorageOfOrder(
        uint id
    ) public {
        require(orders[msg.sender][id].validUntil + 1 < getCurrentStateIndex(), "Order is still valid");
        delete orders[msg.sender][id];
    }

    function tokenAddressToIdMap(address addr) public view returns (uint16) {
        return IdToAddressBiMap.getId(registeredTokens, addr);
    }

    function tokenIdToAddressMap(uint16 id) public view returns (address) {
        return IdToAddressBiMap.getAddressAt(registeredTokens, id);
    }

    uint public previousSolutionBatchId;
    TradeData[] public previousSolutionTrades;
    uint[] public previousSolutionPrices;
    uint16[] public previousSolutionTokenIdForPrice;

    struct TradeData {
        address owner;
        uint volume;
        uint16 orderId;
    }

    function submitSolution(
        uint32 batchIndex,
        address[] memory owner,  //tradeData is submitted as arrays
        uint16[] memory orderId,
        uint128[] memory volume,
        uint128[] memory prices,
        uint16[] memory tokenIdForPrice
    ) public {
        require(
            batchIndex == getCurrentStateIndex() - 1,
            "Solutions are no longer accepted for this batch"
        );
        // checkTradersUtility();
        // checkPriceConformity(prices);
        // checkNorm(prices);
        undoPreviousSolution(batchIndex);
        uint len = owner.length;
        for (uint i = 0; i < len; i++) {
            Order memory order = orders[owner[i]][orderId[i]];
            require(order.validFrom <= batchIndex, "Order is not yet valid");
            require(order.validUntil >= batchIndex, "Order is no longer valid");
            // Assume for now that we always have sellOrders
            uint128 sellVolume = volume[i];
            uint128 buyVolume = uint128(
                volume[i].mul(prices[findPriceIndex(order.buyToken, tokenIdForPrice)]) /
                prices[findPriceIndex(order.sellToken, tokenIdForPrice)]
            );
            require(
                sellVolume.mul(order.buyAmount) >= buyVolume.mul(order.sellAmount),
                "limit price not met"
            );
            require(order.sellAmount >= sellVolume, "sellVolume bigger than specified in order");
            orders[owner[i]][orderId[i]].buyAmount = uint128(
                order.sellAmount.sub(sellVolume)
                .mul(order.buyAmount) / order.sellAmount
            );
            orders[owner[i]][orderId[i]].sellAmount = uint128(order.sellAmount.sub(sellVolume));
            addBalance(owner[i], tokenIdToAddressMap(order.buyToken), buyVolume);
        }
        //doing the substracts after doing all additions, in order to avoid negative values
        for (uint i = 0; i < len; i++) {
            Order memory order = orders[owner[i]][orderId[i]];
            substractBalance(owner[i], tokenIdToAddressMap(order.sellToken), volume[i]);
        }
        documentTrades(batchIndex, owner, orderId, volume, prices, tokenIdForPrice);
    }

    function findPriceIndex(uint16 index, uint16[] memory tokenIdForPrice) public pure returns (uint) {
        uint length = tokenIdForPrice.length;
        for (uint i = 0; i < length; i++) {
            if (tokenIdForPrice[i] == index) {
                return i;
            }
        }
        revert("Price not provided for token");
    }

    function documentTrades(
        uint batchIndex,
        address[] memory owner,  //tradeData is submitted as arrays
        uint16[] memory orderId,
        uint128[] memory volume,
        uint128[] memory prices,
        uint16[] memory tokenIdForPrice
    ) internal {
        previousSolutionBatchId = batchIndex;
        uint len = owner.length;
        for (uint i = 0; i < len; i++) {
            previousSolutionTrades.push(TradeData({
                owner: owner[i],
                orderId: orderId[i],
                volume: volume[i]
            }));
        }
        len = prices.length;
        for (uint i = 0; i < len; i++) {
            previousSolutionPrices.push(prices[i]);
            previousSolutionTokenIdForPrice.push(tokenIdForPrice[i]);
        }
    }

    function undoPreviousSolution(uint batchIndex) internal {
        if (previousSolutionBatchId == batchIndex) {
            for (uint i = 0; i < previousSolutionTrades.length; i++) {
                Order memory order = orders[previousSolutionTrades[i].owner][previousSolutionTrades[i].orderId];
                uint sellVolume = previousSolutionTrades[i].volume;
                uint buyVolume = previousSolutionTrades[i].volume
                    .mul(previousSolutionPrices[findPriceIndex(order.buyToken, previousSolutionTokenIdForPrice)]) /
                    previousSolutionPrices[findPriceIndex(order.sellToken, previousSolutionTokenIdForPrice)];

                order.buyAmount = uint128(order.sellAmount.add(sellVolume).mul(order.buyAmount) / order.sellAmount);
                order.sellAmount = uint128(order.sellAmount.add(sellVolume));
                orders[previousSolutionTrades[i].owner][previousSolutionTrades[i].orderId] = order;
                substractBalance(previousSolutionTrades[i].owner, tokenIdToAddressMap(order.buyToken), buyVolume);
                addBalance(previousSolutionTrades[i].owner, tokenIdToAddressMap(order.sellToken), sellVolume);
            }
        }
        delete previousSolutionTrades;
        delete previousSolutionPrices;
    }
}
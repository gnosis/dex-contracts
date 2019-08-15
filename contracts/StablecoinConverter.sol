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
        address[] memory owners,  //tradeData is submitted as arrays
        uint16[] memory orderIds,
        uint128[] memory volumes,
        uint128[] memory prices,  //list of prices for touched token only
        uint16[] memory tokenIdsForPrice  // price[i] is the price for the token with tokenID tokenIdsForPrice[i]
    ) public {
        require(
            batchIndex == getCurrentStateIndex() - 1,
            "Solutions are no longer accepted for this batch"
        );
        undoPreviousSolution(batchIndex);
        uint len = owners.length;
        for (uint i = 0; i < len; i++) {
            Order memory order = orders[owners[i]][orderIds[i]];
            require(order.validFrom <= batchIndex, "Order is not yet valid");
            require(order.validUntil >= batchIndex, "Order is no longer valid");
            // Assume for now that we always have sellOrders
            uint128 executedSellAmount = volumes[i];
            uint128 executedBuyAmount = uint128(
                volumes[i].mul(prices[findPriceIndex(order.buyToken, tokenIdsForPrice)]) /
                prices[findPriceIndex(order.sellToken, tokenIdsForPrice)]
            );
            require(
                executedSellAmount.mul(order.buyAmount) >= executedBuyAmount.mul(order.sellAmount),
                "limit price not satisfied"
            );
            require(order.sellAmount >= executedSellAmount, "executedSellAmount bigger than specified in order");
            uint128 newSellAmount = uint128(order.sellAmount.sub(executedSellAmount));
            orders[owners[i]][orderIds[i]].buyAmount = uint128(
                newSellAmount
                .mul(order.buyAmount) / order.sellAmount
            );
            orders[owners[i]][orderIds[i]].sellAmount = newSellAmount;
            addBalance(owners[i], tokenIdToAddressMap(order.buyToken), executedBuyAmount);
        }
        // doing all subtractions after all additions (in order to avoid negative values)
        for (uint i = 0; i < len; i++) {
            Order memory order = orders[owners[i]][orderIds[i]];
            subtractBalance(owners[i], tokenIdToAddressMap(order.sellToken), volumes[i]);
        }
        documentTrades(batchIndex, owners, orderIds, volumes, prices, tokenIdsForPrice);
    }

    function findPriceIndex(uint16 index, uint16[] memory tokenIdsForPrice) public pure returns (uint) {
        uint length = tokenIdsForPrice.length;
        for (uint i = 0; i < length; i++) {
            if (tokenIdsForPrice[i] == index) {
                return i;
            }
        }
        revert("Price not provided for token");
    }

    function documentTrades(
        uint batchIndex,
        address[] memory owners,  //tradeData is submitted as arrays
        uint16[] memory orderIds,
        uint128[] memory volumes,
        uint128[] memory prices,
        uint16[] memory tokenIdsForPrice
    ) internal {
        previousSolutionBatchId = batchIndex;
        uint len = owners.length;
        for (uint i = 0; i < len; i++) {
            previousSolutionTrades.push(TradeData({
                owner: owners[i],
                orderId: orderIds[i],
                volume: volumes[i]
            }));
        }
        len = prices.length;
        for (uint i = 0; i < len; i++) {
            previousSolutionPrices.push(prices[i]);
            previousSolutionTokenIdForPrice.push(tokenIdsForPrice[i]);
        }
    }

    function undoPreviousSolution(uint batchIndex) internal {
        if (previousSolutionBatchId == batchIndex) {
            for (uint i = 0; i < previousSolutionTrades.length; i++) {
                address owner = previousSolutionTrades[i].owner;
                uint orderId = previousSolutionTrades[i].orderId;
                Order memory order = orders[owner][orderId];
                uint sellVolume = previousSolutionTrades[i].volume;
                uint buyVolume = sellVolume
                    .mul(previousSolutionPrices[findPriceIndex(order.buyToken, previousSolutionTokenIdForPrice)]) /
                    previousSolutionPrices[findPriceIndex(order.sellToken, previousSolutionTokenIdForPrice)];
                uint128 newSellAmount = uint128(order.sellAmount.add(sellVolume));
                order.buyAmount = uint128(newSellAmount.mul(order.buyAmount) / order.sellAmount);
                order.sellAmount = newSellAmount;

                orders[owner][orderId] = order;
                subtractBalance(owner, tokenIdToAddressMap(order.buyToken), buyVolume);
                addBalance(owner, tokenIdToAddressMap(order.sellToken), sellVolume);
            }
            // for (uint i = 0; i < previousSolutionTrades.length; i++) {
            //     Order memory order = orders[previousSolutionTrades[i].owner][previousSolutionTrades[i].orderId];
            //     uint sellVolume = previousSolutionTrades[i].volume;
            //     uint buyVolume = sellVolume
            //         .mul(previousSolutionPrices[findPriceIndex(order.buyToken, previousSolutionTokenIdForPrice)]) /
            //         previousSolutionPrices[findPriceIndex(order.sellToken, previousSolutionTokenIdForPrice)];
            //     subtractBalance(previousSolutionTrades[i].owner, tokenIdToAddressMap(order.buyToken), buyVolume);
            // }
        }
        delete previousSolutionTrades;
        delete previousSolutionPrices;
    }
}


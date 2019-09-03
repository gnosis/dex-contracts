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
        uint128 priceNominator,
        uint128 priceDenominator
    );

    event OrderCancelation(
        address owner,
        uint id
    );

    struct Order {
        uint16 buyToken;
        uint16 sellToken;
        uint32 validFrom;  // order is valid from auction collection period: validFrom inclusively
        uint32 validUntil;  // order is valid till auction collection period: validUntil inclusively
        bool isSellOrder;
        uint128 priceNominator;
        uint128 priceDenominator;
        uint128 remainingAmount;
    }

    // User-> Order
    mapping(address => Order[]) public orders;

    IdToAddressBiMap.Data private registeredTokens;

    uint public MAX_TOKENS; // solhint-disable-line
    uint16 public numTokens = 0;
    uint128 public feeDenominator;

    constructor(uint maxTokens, uint128 _feeDenominator, address feeToken) public {
        MAX_TOKENS = maxTokens;
        feeDenominator = _feeDenominator;
        addToken(feeToken);
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
        uint128 priceNominator,
        uint128 priceDenominator
    ) public returns (uint) {
        orders[msg.sender].push(Order({
            buyToken: buyToken,
            sellToken: sellToken,
            validFrom: getCurrentStateIndex(),
            validUntil: validUntil,
            isSellOrder: isSellOrder,
            priceNominator: priceNominator,
            priceDenominator: priceDenominator,
            remainingAmount: priceDenominator
        }));
        emit OrderPlacement(
            msg.sender,
            buyToken,
            sellToken,
            isSellOrder,
            getCurrentStateIndex(),
            validUntil,
            priceNominator,
            priceDenominator
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

    mapping (uint16 => uint128) public currentPrices;
    mapping (uint32 => AuctionData) public auctionData;
    PreviousSolutionData public previousSolution;

    struct AuctionData {
        int256 feeCollected;
        address bestSolutionSubmitter;
    }

    struct PreviousSolutionData {
        uint batchId;
        TradeData[] trades;
        uint16[] tokenIdsForPrice;
    }

    struct TradeData {
        address owner;
        uint128 remainingAmount;
        uint16 orderId;
    }

    function submitSolution(
        uint32 batchIndex,
        address[] memory owners,  //tradeData is submitted as arrays
        uint16[] memory orderIds,
        uint128[] memory remainingAmounts,
        uint128[] memory prices,  //list of prices for touched token only
        uint16[] memory tokenIdsForPrice  // price[i] is the price for the token with tokenID tokenIdsForPrice[i]
    ) public {
        require(
            batchIndex == getCurrentStateIndex() - 1,
            "Solutions are no longer accepted for this batch"
        );
        require(checkPriceOrdering(tokenIdsForPrice), "prices are not ordered by tokenId");
        undoPreviousSolution(batchIndex);
        updateCurrentPrices(prices, tokenIdsForPrice);
        delete previousSolution.trades;
        int[] memory tokenConservation = new int[](prices.length);
        for (uint i = 0; i < owners.length; i++) {
            Order memory order = orders[owners[i]][orderIds[i]];
            require(order.validFrom <= batchIndex, "Order is not yet valid");
            require(order.validUntil >= batchIndex, "Order is no longer valid");
            // Assume for now that we always have sellOrders
            uint128 executedSellAmount = remainingAmounts[i];
            require(currentPrices[order.sellToken] != 0, "prices are not allowed to be zero");
            uint128 executedBuyAmount = getExecutedBuyAmount(
                remainingAmounts[i],
                currentPrices[order.buyToken],
                currentPrices[order.sellToken]
            );
            executedBuyAmount = uint128(executedBuyAmount.mul(feeDenominator - 1) / feeDenominator);
            tokenConservation[findPriceIndex(order.buyToken, tokenIdsForPrice)] += int(executedBuyAmount);
            tokenConservation[findPriceIndex(order.sellToken, tokenIdsForPrice)] -= int(executedSellAmount);
            require(order.remainingAmount >= executedSellAmount, "executedSellAmount bigger than specified in order");
            // Ensure executed price is not lower than the order price:
            //       executedSellAmount / executedBuyAmount <= order.priceDenominator / order.priceNominator
            require(
                executedSellAmount.mul(order.priceNominator) <= executedBuyAmount.mul(order.priceDenominator),
                "limit price not satisfied"
            );
            updateRemainingOrder(owners[i], orderIds[i], executedSellAmount);
            addBalance(owners[i], tokenIdToAddressMap(order.buyToken), executedBuyAmount);
        }
        // doing all subtractions after all additions (in order to avoid negative values)
        for (uint i = 0; i < owners.length; i++) {
            subtractBalance(
                owners[i],
                tokenIdToAddressMap(orders[owners[i]][orderIds[i]].sellToken),
                remainingAmounts[i]
            );
        }
        int fee = tokenConservation[0];
        require(fee < auctionData[batchIndex].feeCollected, "Fee is not higher than before");
        auctionData[batchIndex].feeCollected = fee;
        auctionData[batchIndex].bestSolutionSubmitter = msg.sender;
        checkTokenConservation(tokenConservation);
        documentTrades(batchIndex, owners, orderIds, remainingAmounts, tokenIdsForPrice);
    }

    function checkTokenConservation(
        int[] memory tokenConservation
    ) internal pure {
        for (uint i = 1; i < tokenConservation.length; i++) {
            require(tokenConservation[i] == 0, "Token conservation does not hold");
        }
    }

    function updateCurrentPrices(
        uint128[] memory prices,  //list of prices for touched token only, frist price is fee Token price
        uint16[] memory tokenIdsForPrice  // price[i] is the price for the token with tokenID tokenIdsForPrice[i]
    ) internal {
        for (uint i = 0; i < previousSolution.tokenIdsForPrice.length; i++) {
            currentPrices[previousSolution.tokenIdsForPrice[i]] = 0;
        }
        currentPrices[0] = prices[0];
        for (uint i = 0; i < tokenIdsForPrice.length; i++) {
            currentPrices[tokenIdsForPrice[i]] = prices[i + 1];
        }
    }

    function getExecutedBuyAmount(
        uint128 executedSellAmount,
        uint128 buyTokenPrice,
        uint128 sellTokenPrice
    ) internal pure returns (uint128) {
        return uint128(
            executedSellAmount.mul(buyTokenPrice) /
            sellTokenPrice
        );
    }

    function updateRemainingOrder(
        address owner,
        uint orderId,
        uint128 remainingAmount
    ) internal returns (uint) {
        orders[owner][orderId].remainingAmount = uint128(orders[owner][orderId].remainingAmount.sub(remainingAmount));
    }

    function revertRemainingOrder(
        address owner,
        uint orderId,
        uint128 remainingAmount
    ) internal returns (uint) {
        orders[owner][orderId].remainingAmount = uint128(orders[owner][orderId].remainingAmount.add(remainingAmount));
    }

    function documentTrades(
        uint batchIndex,
        address[] memory owners,  //tradeData is submitted as arrays
        uint16[] memory orderIds,
        uint128[] memory remainingAmounts,
        uint16[] memory tokenIdsForPrice
    ) internal {
        previousSolution.batchId = batchIndex;
        for (uint i = 0; i < owners.length; i++) {
            previousSolution.trades.push(TradeData({
                owner: owners[i],
                orderId: orderIds[i],
                remainingAmount: remainingAmounts[i]
            }));
        }
        previousSolution.tokenIdsForPrice = tokenIdsForPrice;
    }

    function undoPreviousSolution(uint batchIndex) internal {
        if (previousSolution.batchId == batchIndex) {
            for (uint i = 0; i < previousSolution.trades.length; i++) {
                address owner = previousSolution.trades[i].owner;
                uint orderId = previousSolution.trades[i].orderId;
                Order memory order = orders[owner][orderId];
                uint sellAmount = previousSolution.trades[i].remainingAmount;
                addBalance(owner, tokenIdToAddressMap(order.sellToken), sellAmount);
            }
            for (uint i = 0; i < previousSolution.trades.length; i++) {
                address owner = previousSolution.trades[i].owner;
                uint orderId = previousSolution.trades[i].orderId;
                Order memory order = orders[owner][orderId];
                uint128 sellAmount = previousSolution.trades[i].remainingAmount;
                uint128 buyAmount = getExecutedBuyAmount(
                    sellAmount,
                    currentPrices[order.buyToken],
                    currentPrices[order.sellToken]
                );
                buyAmount = uint128(buyAmount.mul(feeDenominator - 1) / feeDenominator);
                revertRemainingOrder(owner, orderId, sellAmount);
                subtractBalance(owner, tokenIdToAddressMap(order.buyToken), buyAmount);
            }
        }
    }

    function findPriceIndex(uint16 index, uint16[] memory tokenIdForPrice) private pure returns (uint) {
        // return fee token straight away
        if (index == 0) {
            return 0;
        }
        // binary search for the other tokens
        uint leftValue = 0;
        uint rightValue = tokenIdForPrice.length - 1;
        while (rightValue >= leftValue) {
            uint middleValue = leftValue + (rightValue-leftValue) / 2;
            if (tokenIdForPrice[middleValue] == index) {
                return middleValue + 1;
            } else if (tokenIdForPrice[middleValue] < index) {
                leftValue = middleValue + 1;
            } else {
                require(middleValue > 0, "Price not provided for token");
                rightValue = middleValue - 1;
            }
        }
        revert("Price not provided for token");
    }

    function checkPriceOrdering(uint16[] memory tokenIdsForPrice) private pure returns (bool) {
        require(tokenIdsForPrice[0] > 0, "price for fee token should not be overwritten");
        for (uint i = 1; i < tokenIdsForPrice.length; i++) {
            if (tokenIdsForPrice[i] <= tokenIdsForPrice[i - 1]) {
                return false;
            }
        }
        return true;
    }
}

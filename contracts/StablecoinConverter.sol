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
        uint128 priceNumerator,
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
        uint128 priceNumerator;
        uint128 priceDenominator;
        uint128 remainingAmount; // remainingAmount can either be a sellAmount or buyAmount, depending on the flag isSellOrder
    }

    // User-> Order
    mapping(address => Order[]) public orders;

    IdToAddressBiMap.Data private registeredTokens;

    uint public MAX_TOKENS; // solhint-disable-line
    uint16 public numTokens = 0;
    uint128 public feeDenominator; // fee is (1 / feeDenominator)

    constructor(uint maxTokens, uint128 _feeDenominator, address feeToken) public {
        MAX_TOKENS = maxTokens;
        feeDenominator = _feeDenominator;
        addToken(feeToken); // fee Token will always have the token index 0
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
            priceNumerator: buyAmount,
            priceDenominator: sellAmount,
            remainingAmount: sellAmount
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

    mapping (uint16 => uint128) public currentPrices;
    int256 public currentFeeCollected;
    PreviousSolutionData public previousSolution;

    struct PreviousSolutionData {
        uint batchId;
        TradeData[] trades;
        uint16[] tokenIdsForPrice;
    }

    struct TradeData {
        address owner;
        uint128 volume;
        uint16 orderId;
    }

    function submitSolution(
        uint32 batchIndex,
        address[] memory owners,  //tradeData is submitted as arrays
        uint16[] memory orderIds,
        uint128[] memory volumes,
        uint128[] memory prices,  //list of prices for touched token only
        uint16[] memory tokenIdsForPrice  // price[i] is the price for the token with tokenID tokenIdsForPrice[i]
                                          // fee token id not required since always 0
    ) public {
        require(
            batchIndex == getCurrentStateIndex() - 1,
            "Solutions are no longer accepted for this batch"
        );
        require(checkPriceOrdering(tokenIdsForPrice), "prices are not ordered by tokenId");
        if (previousSolution.batchId == batchIndex) {
            undoPreviousSolution();
        } else {
            currentFeeCollected = 0;
        }
        updateCurrentPrices(prices, tokenIdsForPrice);
        delete previousSolution.trades;
        int[] memory tokenConservation = new int[](prices.length);
        for (uint i = 0; i < owners.length; i++) {
            Order memory order = orders[owners[i]][orderIds[i]];
            require(order.validFrom <= batchIndex, "Order is not yet valid");
            require(order.validUntil >= batchIndex, "Order is no longer valid");
            // Assume for now that we always have sellOrders
            uint128 executedSellAmount = volumes[i];
            require(currentPrices[order.sellToken] != 0, "prices are not allowed to be zero");
            uint128 executedBuyAmount = getExecutedBuyAmount(
                volumes[i],
                currentPrices[order.buyToken],
                currentPrices[order.sellToken]
            );
            tokenConservation[findPriceIndex(order.buyToken, tokenIdsForPrice)] -= int(executedBuyAmount);
            tokenConservation[findPriceIndex(order.sellToken, tokenIdsForPrice)] += int(executedSellAmount);
            require(order.remainingAmount >= executedSellAmount, "executedSellAmount bigger than specified in order");
            // Ensure executed price is not lower than the order price:
            //       executedSellAmount / executedBuyAmount <= order.priceDenominator / order.priceNumerator
            require(
                executedSellAmount.mul(order.priceNumerator) <= executedBuyAmount.mul(order.priceDenominator),
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
                volumes[i]
            );
        }
        checkForBestSolutionSubmission(tokenConservation[0]);
        checkTokenConservation(tokenConservation);
        documentTrades(batchIndex, owners, orderIds, volumes, tokenIdsForPrice);
    }

    function checkTokenConservation(
        int[] memory tokenConservation
    ) internal pure {
        for (uint i = 1; i < tokenConservation.length; i++) {
            require(tokenConservation[i] == 0, "Token conservation does not hold");
        }
    }

    function updateCurrentPrices(
        uint128[] memory prices,          // list of prices for touched tokens only, frist price is fee token price
        uint16[] memory tokenIdsForPrice  // price[i + 1] is the price for the token with tokenID tokenIdsForPrice[i]
    ) internal {
        for (uint i = 0; i < tokenIdsForPrice.length; i++) {
            currentPrices[tokenIdsForPrice[i]] = prices[i];
        }
    }

    function getExecutedBuyAmount(
        uint128 executedSellAmount,
        uint128 buyTokenPrice,
        uint128 sellTokenPrice
    ) internal view returns (uint128) {
        uint128 buyAmount = uint128(
            executedSellAmount.mul(buyTokenPrice) /
            sellTokenPrice
        );
        // executedBuyAmount = buyAmount * (1 - (1/feeDenominator)
        //           = buyAmount - buyAmount/feeDenominator (*)
        //           = (buyAmount * feeDenominator)/ feeDenominator - buyAmount/feeDenominator
        //           = (buyAmount * feeDenominator - buyAmount) / feeDenominator
        //           = (buyAmount* (feeDenominator - 1)/feeDenominator
        return uint128(buyAmount.mul(feeDenominator - 1) / feeDenominator);
    }

    function updateRemainingOrder(
        address owner,
        uint orderId,
        uint128 exectuedAmount
    ) internal returns (uint) {
        orders[owner][orderId].remainingAmount = uint128(orders[owner][orderId].remainingAmount.sub(exectuedAmount));
    }

    function revertRemainingOrder(
        address owner,
        uint orderId,
        uint128 exectuedAmount
    ) internal returns (uint) {
        orders[owner][orderId].remainingAmount = uint128(orders[owner][orderId].remainingAmount.add(exectuedAmount));
    }

    function documentTrades(
        uint batchIndex,
        address[] memory owners,  //tradeData is submitted as arrays
        uint16[] memory orderIds,
        uint128[] memory volumes,
        uint16[] memory tokenIdsForPrice
    ) internal {
        previousSolution.batchId = batchIndex;
        for (uint i = 0; i < owners.length; i++) {
            previousSolution.trades.push(TradeData({
                owner: owners[i],
                orderId: orderIds[i],
                volume: volumes[i]
            }));
        }
        previousSolution.tokenIdsForPrice = tokenIdsForPrice;
    }

    function undoPreviousSolution() internal {
        for (uint i = 0; i < previousSolution.trades.length; i++) {
            address owner = previousSolution.trades[i].owner;
            uint orderId = previousSolution.trades[i].orderId;
            Order memory order = orders[owner][orderId];
            uint sellVolume = previousSolution.trades[i].volume;
            addBalance(owner, tokenIdToAddressMap(order.sellToken), sellVolume);
        }
        for (uint i = 0; i < previousSolution.trades.length; i++) {
            address owner = previousSolution.trades[i].owner;
            uint orderId = previousSolution.trades[i].orderId;
            Order memory order = orders[owner][orderId];
            uint128 sellVolume = previousSolution.trades[i].volume;
            uint128 buyVolume = getExecutedBuyAmount(
                sellVolume,
                currentPrices[order.buyToken],
                currentPrices[order.sellToken]
            );
            revertRemainingOrder(owner, orderId, sellVolume);
            subtractBalance(owner, tokenIdToAddressMap(order.buyToken), buyVolume);
        }
    }

    function checkForBestSolutionSubmission(int256 fee) private {
        require(fee > currentFeeCollected, "Solution does not generate a higher fee than a previous solution");
        currentFeeCollected = fee;
    }

    function findPriceIndex(uint16 index, uint16[] memory tokenIdForPrice) private pure returns (uint) {
        // binary search for the other tokens
        uint leftValue = 0;
        uint rightValue = tokenIdForPrice.length - 1;
        while (rightValue >= leftValue) {
            uint middleValue = leftValue + (rightValue-leftValue) / 2;
            if (tokenIdForPrice[middleValue] == index) {
                return middleValue;
            } else if (tokenIdForPrice[middleValue] < index) {
                leftValue = middleValue + 1;
            } else {
                rightValue = middleValue - 1;
            }
        }
        revert("Price not provided for token");
    }

    function checkPriceOrdering(uint16[] memory tokenIdsForPrice) private pure returns (bool) {
        require(tokenIdsForPrice[0] == 0, "fee token price has to be specified");
        for (uint i = 1; i < tokenIdsForPrice.length; i++) {
            if (tokenIdsForPrice[i] <= tokenIdsForPrice[i - 1]) {
                return false;
            }
        }
        return true;
    }
}

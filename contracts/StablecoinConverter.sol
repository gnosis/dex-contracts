pragma solidity ^0.5.0;

import "./EpochTokenLocker.sol";
import "@gnosis.pm/solidity-data-structures/contracts/libraries/IdToAddressBiMap.sol";
import "@gnosis.pm/solidity-data-structures/contracts/libraries/IterableAppendOnlySet.sol";
import "@gnosis.pm/owl-token/contracts/TokenOWL.sol";
import "openzeppelin-solidity/contracts/utils/SafeCast.sol";
import "solidity-bytes-utils/contracts/BytesLib.sol";
import "./libraries/TokenConservation.sol";


/** @title Stable Coin Converter - A decentralized exchange for stable tokens as a batch auciton.
 *  @author @gnosis/dfusion-team <https://github.com/orgs/gnosis/teams/dfusion-team/members>
 */
contract StablecoinConverter is EpochTokenLocker {
    using SafeCast for uint256;
    using SafeMath for uint128;
    using BytesLib for bytes32;
    using BytesLib for bytes;
    using TokenConservation for int[];
    using TokenConservation for uint16[];
    using IterableAppendOnlySet for IterableAppendOnlySet.Data;

    // Iterable set of all users, required to collect auction information
    IterableAppendOnlySet.Data private allUsers;
    IdToAddressBiMap.Data private registeredTokens;

    /** @dev Maximum number of touched orders in auction (used in submitSolution) */
    uint256 constant public MAX_TOUCHED_ORDERS = 25;

    /** @dev Fee charged for adding a token) */
    uint256 constant public TOKEN_ADDITION_FEE_IN_OWL = 10 ether;

    /** @dev maximum number of tokens that can be listed for exchange */
    // solhint-disable-next-line var-name-mixedcase
    uint256 public MAX_TOKENS;

    /** @dev Current number of tokens listed/available for exchange */
    uint16 public numTokens;

    /** @dev A fixed integer used to evaluate fees as a fraction of trade execution 1/feeDenominator */
    uint128 public feeDenominator;

    /** @dev The feeToken of the exchange will be the OWL Token */
    TokenOWL public feeToken;

    /** @dev mapping of type userAddress -> List[Order] where all the user's orders are stored */
    mapping(address => Order[]) public orders;

    /** @dev mapping of type tokenId -> curentPrice of tokenId */
    mapping (uint16 => uint128) public currentPrices;

    /** @dev Sufficient information for current winning auction solution */
    SolutionData public latestSolution;

    struct SolutionData {
        uint32 batchId;
        TradeData[] trades;
        uint16[] tokenIdsForPrice;
        address solutionSubmitter;
        uint256 feeReward;
        uint256 objectiveValue;
    }

    event OrderPlacement(
        address owner,
        uint16 buyToken,
        uint16 sellToken,
        uint32 validFrom,
        uint32 validUntil,
        uint128 priceNumerator,
        uint128 priceDenominator
    );

    event OrderCancelation(
        address owner,
        uint256 id
    );

    struct Order {
        uint16 buyToken;
        uint16 sellToken;
        uint32 validFrom;   // order is valid from auction collection period: validFrom inclusive
        uint32 validUntil;  // order is valid till auction collection period: validUntil inclusive
        uint128 priceNumerator;
        uint128 priceDenominator;
        uint128 usedAmount; // remainingAmount = priceDenominator - usedAmount
    }

    struct TradeData {
        address owner;
        uint128 volume;
        uint16 orderId;
    }

    /** @dev Constructor determines exchange parameters
      * @param maxTokens The maximum number of tokens that can be listed.
      * @param _feeDenominator fee as a proportion is (1 / feeDenominator)
      * @param _feeToken Address of ERC20 fee token.
      */
    constructor(uint256 maxTokens, uint128 _feeDenominator, address _feeToken) public {
        MAX_TOKENS = maxTokens;
        feeToken = TokenOWL(_feeToken);
        feeDenominator = _feeDenominator;
        addToken(_feeToken); // feeToken will always have the token index 0
    }

    /** @dev Used to list a new token on the contract: Hence, making it available for exchange in an auction.
      * @param token ERC20 token to be listed.
      *
      * Requirements:
      * - `maxTokens` has not already been reached
      * - `token` has not already been added
      */
    function addToken(address token) public {
        require(numTokens < MAX_TOKENS, "Max tokens reached");
        if (numTokens > 0) {
            // Only charge fees for tokens other than the fee token itself
            feeToken.burnOWL(msg.sender, TOKEN_ADDITION_FEE_IN_OWL);
        }
        require(
            IdToAddressBiMap.insert(registeredTokens, numTokens, token),
            "Token already registered"
        );
        numTokens++;
    }

    /** @dev A user facing function used to place limit sell orders in auction with expiry defined by batchId
      * @param buyToken id of token to be bought
      * @param sellToken id of token to be sold
      * @param validFrom batchId represnting order's validity start time
      * @param validUntil batchId represnting order's expiry
      * @param buyAmount relative minimum amount of requested buy amount
      * @param sellAmount maximum amount of sell token to be exchanged
      * @return orderId as index of user's current orders
      *
      * Emits an {OrderPlacement} event with all relevant order details.
      */
    function placeValidFromOrder(
        uint16 buyToken,
        uint16 sellToken,
        uint32 validFrom,
        uint32 validUntil,
        uint128 buyAmount,
        uint128 sellAmount
    ) public returns (uint256) {
        orders[msg.sender].push(Order({
            buyToken: buyToken,
            sellToken: sellToken,
            validFrom: validFrom,
            validUntil: validUntil,
            priceNumerator: buyAmount,
            priceDenominator: sellAmount,
            usedAmount: 0
        }));
        emit OrderPlacement(
            msg.sender,
            buyToken,
            sellToken,
            validFrom,
            validUntil,
            buyAmount,
            sellAmount
        );
        allUsers.insert(msg.sender);
        return orders[msg.sender].length - 1;
    }

    /** @dev A user facing function used to place limit sell orders in auction with expiry defined by batchId
      * @param buyToken id of token to be bought
      * @param sellToken id of token to be sold
      * @param validUntil batchId represnting order's expiry
      * @param buyAmount relative minimum amount of requested buy amount
      * @param sellAmount maximum amount of sell token to be exchanged
      * @return orderId as index of user's current orders
      *
      * Emits an {OrderPlacement} event with all relevant order details.
      */
    function placeOrder(
        uint16 buyToken,
        uint16 sellToken,
        uint32 validUntil,
        uint128 buyAmount,
        uint128 sellAmount
    ) public returns (uint256) {
        return placeValidFromOrder(buyToken, sellToken, getCurrentBatchId(), validUntil, buyAmount, sellAmount);
    }

    /** @dev a user facing function used to cancel orders (sets order expiry to previous batchId)
      * @param id referencing the index of user's order to be canceled
      *
      * Emits an {OrderCancelation} with sender's address and orderId
      */
    function cancelOrder(uint256 id) public {
        orders[msg.sender][id].validUntil = getCurrentBatchId() - 1;
        emit OrderCancelation(msg.sender, id);
    }

    /** @dev A user facing function used to delete expired orders.
      * This release of storage gives a gas refund to msg.sender and requires that all orders are expired.
      * @param ids referencing the indices of user's orders to be deleted
      *
      * Requirements:
      * - Each requested order is expired
      */
    function freeStorageOfOrder(uint256[] memory ids) public {
        for (uint256 i = 0; i < ids.length; i++) {
            require(orders[msg.sender][ids[i]].validUntil + 1 < getCurrentBatchId(), "Order is still valid");
            delete orders[msg.sender][ids[i]];
        }
    }

    /** @dev a solver facing function called for auction settlement
      * @param batchIndex index of auction solution is referring to
      * @param owners array of addresses corresponding to touched orders
      * @param orderIds array of order ids used in parallel with owners to identify touched order
      * @param volumes executed buy amounts for each order identified by index of owner-orderId arrays
      * @param prices list of prices for touched tokens indexed by next parameter
      * @param tokenIdsForPrice price[i] is the price for the token with tokenID tokenIdsForPrice[i]
      *
      * Requirements:
      * - Solutions for this `batchIndex` are currently being accepted.
      * - Fee Token price is non-zero
      * - `tokenIdsForPrice` is sorted.
      * - Number of touched orders does not exceed `MAX_TOUCHED_ORDERS`.
      * - Each touched order is valid at current `batchIndex`.
      * - Each touched order's `executedSellAmount` does not exceed its remaining amount.
      * - Limit Price of each touched order is respected.
      * - Solution's objective evaluation must be positive.
      *
      * Sub Requirements: Those nested within other functions
      * - checkAndOverrideObjectiveValue; Objetive Evaluation is greater than current winning solution
      * - checkTokenConservation; for all, non-fee, tokens total amount sold == total amount bought
      */
    function submitSolution(
        uint32 batchIndex,
        address[] memory owners,
        uint16[] memory orderIds,
        uint128[] memory volumes,
        uint128[] memory prices,
        uint16[] memory tokenIdsForPrice
    ) public {
        require(acceptingSolutions(batchIndex), "Solutions are no longer accepted for this batch");
        require(tokenIdsForPrice[0] == 0, "fee token price has to be specified");
        require(tokenIdsForPrice.checkPriceOrdering(), "prices are not ordered by tokenId");
        require(owners.length <= MAX_TOUCHED_ORDERS, "Solution exceeds MAX_TOUCHED_ORDERS");
        undoCurrentSolution(batchIndex);
        updateCurrentPrices(prices, tokenIdsForPrice);
        delete latestSolution.trades;
        int[] memory tokenConservation = new int[](prices.length);
        uint256 utility = 0;
        for (uint256 i = 0; i < owners.length; i++) {
            Order memory order = orders[owners[i]][orderIds[i]];
            require(checkOrderValidity(order, batchIndex), "Order is invalid");
            (uint128 executedBuyAmount, uint128 executedSellAmount) = getTradedAmounts(volumes[i], order);
            tokenConservation.updateTokenConservation(
                order.buyToken,
                order.sellToken,
                tokenIdsForPrice,
                executedBuyAmount,
                executedSellAmount
            );
            require(getRemainingAmount(order) >= executedSellAmount, "executedSellAmount bigger than specified in order");
            // Ensure executed price is not lower than the order price:
            //       executedSellAmount / executedBuyAmount <= order.priceDenominator / order.priceNumerator
            require(
                executedSellAmount.mul(order.priceNumerator) <= executedBuyAmount.mul(order.priceDenominator),
                "limit price not satisfied"
            );
            // accumulate utility before updateRemainingOrder, but after limitPrice verified!
            utility = utility.add(evaluateUtility(executedBuyAmount, order));
            updateRemainingOrder(owners[i], orderIds[i], executedSellAmount);
            addBalanceAndBlockWithdrawForThisBatch(owners[i], tokenIdToAddressMap(order.buyToken), executedBuyAmount);
        }
        // doing all subtractions after all additions (in order to avoid negative values)
        for (uint256 i = 0; i < owners.length; i++) {
            (, uint128 executedSellAmount) = getTradedAmounts(
                volumes[i],
                orders[owners[i]][orderIds[i]]
            );
            subtractBalance(
                owners[i],
                tokenIdToAddressMap(orders[owners[i]][orderIds[i]].sellToken),
                executedSellAmount
            );
        }
        uint256 disregardedUtility = 0;
        for (uint256 i = 0; i < owners.length; i++) {
            disregardedUtility = disregardedUtility.add(
                evaluateDisregardedUtility(orders[owners[i]][orderIds[i]], owners[i])
            );
        }
        uint256 burntFees = uint256(tokenConservation[0]) / 2;
        require(utility + burntFees > disregardedUtility, "Solution must be better than trivial");
        // burntFees ensures direct trades (when available) yield better solutions than longer rings
        checkAndOverrideObjectiveValue(utility - disregardedUtility + burntFees);
        grantRewardToSolutionSubmitter(burntFees);
        tokenConservation.checkTokenConservation();
        documentTrades(batchIndex, owners, orderIds, volumes, tokenIdsForPrice);
    }
    /**
     * Public View Methods
     */

    /** @dev View returning ID of listed tokens
      * @param addr address of listed token.
      * @return tokenId as stored within the contract.
      */
    function tokenAddressToIdMap(address addr) public view returns (uint16) {
        return IdToAddressBiMap.getId(registeredTokens, addr);
    }

    /** @dev View returning address of listed token by ID
      * @param id tokenId as stored, via BiMap, within the contract.
      * @return address of (listed) token
      */
    function tokenIdToAddressMap(uint16 id) public view returns (address) {
        return IdToAddressBiMap.getAddressAt(registeredTokens, id);
    }

    /** @dev View returning all currently stored, byte-encoded sell orders
      * @return encoded bytes representing all orders ordered by (user, index)
      */
    function getEncodedAuctionElements() public view returns (bytes memory elements) {
        if (allUsers.size() > 0) {
            address user = allUsers.first();
            bool stop = false;
            while (!stop) {
                for (uint256 i = 0; i < orders[user].length; i++) {
                    Order memory order = orders[user][i];
                    elements = elements.concat(encodeAuctionElement(
                        user,
                        getBalance(user, tokenIdToAddressMap(order.sellToken)),
                        order
                    ));
                }
                if (user == allUsers.last) {
                    stop = true;
                } else {
                    user = allUsers.next(user);
                }
            }
        }
        return elements;
    }

    function acceptingSolutions(uint32 batchIndex) public view returns (bool) {
        return batchIndex == getCurrentBatchId() - 1 && getSecondsRemainingInBatch() >= 1 minutes;
    }

    /** @dev gets the objective value of currently winning solution.
      * @return objective function evaluation of the currently winning solution, or zero if no solution proposed.
      */
    function getCurrentObjectiveValue() public view returns(uint256) {
        if (latestSolution.batchId == getCurrentBatchId() - 1) {
            return latestSolution.objectiveValue;
        } else {
            return 0;
        }
    }
    /**
     * Internal Functions
     */

    /** @dev called at the end of submitSolution with a value of tokenConservation / 2
      * @param feeReward amount to be rewarded to the solver
      */
    function grantRewardToSolutionSubmitter(uint256 feeReward) internal {
        latestSolution.feeReward = feeReward;
        addBalanceAndBlockWithdrawForThisBatch(msg.sender, tokenIdToAddressMap(0), feeReward);
    }

    /** @dev Called from within submitSolution to update the token prices.
      * @param prices list of prices for touched tokens only, first price is always fee token price
      * @param tokenIdsForPrice price[i] is the price for the token with tokenID tokenIdsForPrice[i]
      */
    function updateCurrentPrices(
        uint128[] memory prices,
        uint16[] memory tokenIdsForPrice
    ) internal {
        for (uint256 i = 0; i < latestSolution.tokenIdsForPrice.length; i++) {
            currentPrices[latestSolution.tokenIdsForPrice[i]] = 0;
        }
        for (uint256 i = 0; i < tokenIdsForPrice.length; i++) {
            currentPrices[tokenIdsForPrice[i]] = prices[i];
        }
    }

    /** @dev Updates an order's remaing requested sell amount upon (partial) execution of a standing order
      * @param owner order's corresponding user address
      * @param orderId index of order in list of owner's orders
      * @param executedAmount proportion of order's requested sellAmount that was filled.
      */
    function updateRemainingOrder(
        address owner,
        uint256 orderId,
        uint128 executedAmount
    ) internal {
        orders[owner][orderId].usedAmount = orders[owner][orderId].usedAmount.add(executedAmount).toUint128();
    }

    /** @dev The inverse of updateRemainingOrder, called when reverting a solution in favour of a better one.
      * @param owner order's corresponding user address
      * @param orderId index of order in list of owner's orders
      * @param executedAmount proportion of order's requested sellAmount that was filled.
      */
    function revertRemainingOrder(
        address owner,
        uint256 orderId,
        uint128 executedAmount
    ) internal {
        orders[owner][orderId].usedAmount = orders[owner][orderId].usedAmount.sub(executedAmount).toUint128();
    }

    /** @dev This function writes solution information into contract storage
      * @param batchIndex index of referenced auction
      * @param owners array of addresses corresponding to touched orders
      * @param orderIds array of order ids used in parallel with owners to identify touched order
      * @param volumes executed buy amounts for each order identified by index of owner-orderId arrays
      * @param tokenIdsForPrice price[i] is the price for the token with tokenID tokenIdsForPrice[i]
      */
    function documentTrades(
        uint32 batchIndex,
        address[] memory owners,
        uint16[] memory orderIds,
        uint128[] memory volumes,
        uint16[] memory tokenIdsForPrice
    ) internal {
        latestSolution.batchId = batchIndex;
        for (uint256 i = 0; i < owners.length; i++) {
            latestSolution.trades.push(TradeData({
                owner: owners[i],
                orderId: orderIds[i],
                volume: volumes[i]
            }));
        }
        latestSolution.tokenIdsForPrice = tokenIdsForPrice;
        latestSolution.solutionSubmitter = msg.sender;
    }

    /** @dev reverts all relevant contract storage relating to an overwritten auction solution.
      * @param batchIndex index of referenced auction
      */
    function undoCurrentSolution(uint32 batchIndex) internal {
        if (latestSolution.batchId == batchIndex) {
            for (uint256 i = 0; i < latestSolution.trades.length; i++) {
                address owner = latestSolution.trades[i].owner;
                uint256 orderId = latestSolution.trades[i].orderId;
                Order memory order = orders[owner][orderId];
                (, uint128 sellAmount) = getTradedAmounts(latestSolution.trades[i].volume, order);
                addBalance(owner, tokenIdToAddressMap(order.sellToken), sellAmount);
            }
            for (uint256 i = 0; i < latestSolution.trades.length; i++) {
                address owner = latestSolution.trades[i].owner;
                uint256 orderId = latestSolution.trades[i].orderId;
                Order memory order = orders[owner][orderId];
                (uint128 buyAmount, uint128 sellAmount) = getTradedAmounts(latestSolution.trades[i].volume, order);
                revertRemainingOrder(owner, orderId, sellAmount);
                subtractBalance(owner, tokenIdToAddressMap(order.buyToken), buyAmount);
            }
            // subtract granted fees:
            subtractBalance(
                latestSolution.solutionSubmitter,
                tokenIdToAddressMap(0),
                latestSolution.feeReward
            );
        }
    }
    // Internal view

    /** @dev Evaluates utility of executed trade
      * @param execBuy represents proportion of order executed (in terms of buy amount)
      * @param order the sell order whose utility is being evaluated
      * @return Utility = ((execBuy * order.sellAmt - execSell * order.buyAmt) * price.buyToken) / order.sellAmt
      */
    function evaluateUtility(uint128 execBuy, Order memory order) internal view returns(uint256) {
        // Utility = ((execBuy * order.sellAmt - execSell * order.buyAmt) * price.buyToken) / order.sellAmt
        uint256 execSell = getExecutedSellAmount(
            execBuy,
            currentPrices[order.buyToken],
            currentPrices[order.sellToken]
        );
        return execBuy.sub(execSell.mul(order.priceNumerator)
            .div(order.priceDenominator)).mul(currentPrices[order.buyToken]);
    }

    /** @dev computes a measure of how much of an order was disregarded (only valid when limit price is respected)
      * @param order the sell order whose disregarded utility is being evaluated
      * @param user address of order's owner
      * @return disregardedUtility of the order (after it has been applied)
      * Note that:
      * |disregardedUtility| = (limitTerm * leftoverSellAmount) / order.sellAmount
      * where limitTerm = price.SellToken * order.sellAmt - order.buyAmt * price.buyToken
      * and leftoverSellAmount = order.sellAmt - execSellAmt
      * Balances and orders have all been updated so: sellAmount - execSellAmt == remainingAmount(order).
      * For correctness, we take the minimum of this with the user's token balance.
      */
    function evaluateDisregardedUtility(Order memory order, address user) internal view returns(uint256) {
        uint256 leftoverSellAmount = Math.min(
            getRemainingAmount(order),
            getBalance(user, tokenIdToAddressMap(order.sellToken))
        );
        uint256 limitTerm = currentPrices[order.sellToken].mul(order.priceDenominator)
            .sub(currentPrices[order.buyToken].mul(order.priceNumerator));
        return leftoverSellAmount.mul(limitTerm).div(order.priceDenominator);
    }

    /** @dev Evaluates executedBuy amount based on prices and executedBuyAmout (fees included)
      * @param executedBuyAmount amount of buyToken executed for purchase in batch auction
      * @param buyTokenPrice uniform clearing price of buyToken
      * @param sellTokenPrice uniform clearing price of sellToken
      * @return executedSellAmount as expressed in Equation (2)
      * https://github.com/gnosis/dex-contracts/issues/173#issuecomment-526163117
      * execSellAmount * p[sellToken] * (1 - phi) == execBuyAmount * p[buyToken]
      * where phi = 1/feeDenominator
      * Note that: 1 - phi = (feeDenominator - 1) / feeDenominator
      * And so, 1/(1-phi) = feeDenominator / (feeDenominator - 1)
      * execSellAmount = (execBuyAmount * p[buyToken]) / (p[sellToken] * (1 - phi))
      *                = (execBuyAmount * buyTokenPrice / sellTokenPrice) * feeDenominator / (feeDenominator - 1)
      * in order to minimize rounding errors, the order of operations is switched
      *                = ((executedBuyAmount * buyTokenPrice) / (feeDenominator - 1)) * feeDenominator) / sellTokenPrice
      */
    function getExecutedSellAmount(
        uint128 executedBuyAmount,
        uint128 buyTokenPrice,
        uint128 sellTokenPrice
    ) internal view returns (uint128) {
        return uint256(executedBuyAmount).mul(buyTokenPrice).div(feeDenominator - 1)
            .mul(feeDenominator).div(sellTokenPrice).toUint128();
    }
    /**
     * Private Functions
     */

    /** @dev determines if value is better than currently and updates if it is.
      * @param newObjectiveValue proposed value to be updated if greater than current.
      */
    function checkAndOverrideObjectiveValue(uint256 newObjectiveValue) private {
        require(
            newObjectiveValue > getCurrentObjectiveValue(),
            "Solution must have a higher objective value than current solution"
        );
        latestSolution.objectiveValue = newObjectiveValue;
    }
    // Private view

    /** @dev Compute trade execution based on executedBuyAmount and relevant token prices
      * @param volume executed buy amount
      * @param order contains relevant buy-sell token information
      * @return (executedBuyAmount, executedSellAmount)
      */
    function getTradedAmounts(uint128 volume, Order memory order) private view returns (uint128, uint128) {
        uint128 executedBuyAmount = volume;
        require(currentPrices[order.sellToken] != 0, "prices are not allowed to be zero");
        uint128 executedSellAmount = getExecutedSellAmount(
            executedBuyAmount,
            currentPrices[order.buyToken],
            currentPrices[order.sellToken]
        );
        return (executedBuyAmount, executedSellAmount);
    }
    // Private pure

    /** @dev used to determine if an order is valid for specific auction/batch
      * @param order object whose validity is in question
      * @param batchIndex auction index of validity
      * @return true if order is valid in auction batchIndex else false
      */
    function checkOrderValidity(Order memory order, uint256 batchIndex) private pure returns (bool) {
        return order.validFrom <= batchIndex && order.validUntil >= batchIndex;
    }

    /** @dev computes the remaining sell amount for a given order
      * @param order the order for which remaining amount should be calculated
      * @return the remaining sell amount
      */
    function getRemainingAmount(Order memory order) private pure returns (uint128) {
        return order.priceDenominator - order.usedAmount;
    }

    /** @dev called only by getEncodedAuctionElements and used to pack auction info into bytes
      * @param user list of tokenIds
      * @param sellTokenBalance user's account balance of sell token
      * @param order a sell order
      * @return byte encoded, packed, concatenation of relevant order information
      */
    function encodeAuctionElement(
        address user,
        uint256 sellTokenBalance,
        Order memory order
    ) private pure returns (bytes memory element) {
        element = abi.encodePacked(user);
        element = element.concat(abi.encodePacked(sellTokenBalance));
        element = element.concat(abi.encodePacked(order.buyToken));
        element = element.concat(abi.encodePacked(order.sellToken));
        element = element.concat(abi.encodePacked(order.validFrom));
        element = element.concat(abi.encodePacked(order.validUntil));
        element = element.concat(abi.encodePacked(order.priceNumerator));
        element = element.concat(abi.encodePacked(order.priceDenominator));
        element = element.concat(abi.encodePacked(getRemainingAmount(order)));
        return element;
    }
}

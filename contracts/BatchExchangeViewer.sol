pragma solidity ^0.5.0;

import "solidity-bytes-utils/contracts/BytesLib.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./BatchExchange.sol";


contract BatchExchangeViewer {
    using BytesLib for bytes;
    using SafeMath for uint256;

    uint8 public constant AUCTION_ELEMENT_WIDTH = 112;
    // Can be used by external contracts to indicate no filter as it doesn't seem possible
    // to create an empty memory array in solidity.
    uint16[] public ALL_TOKEN_FILTER;

    BatchExchange batchExchange;

    constructor(BatchExchange exchange) public {
        batchExchange = exchange;
    }

    /** @dev Queries the orderbook for the auction that is still accepting orders
     *  @param tokenFilter all returned order will have buy *and* sell token from this list (leave empty for "no filter")
     *  @return encoded bytes representing orders
     */
    function getOpenOrderBook(address[] memory tokenFilter) public view returns (bytes memory) {
        (bytes memory elements, , ) = getOpenOrderBookPaginated(tokenFilter, address(0), 0, uint16(-1));
        return elements;
    }

    /** @dev Queries a page of the orderbook for the auction that is still accepting orders
     *  @param tokenFilter all returned order will have buy *and* sell token from this list (leave empty for "no filter")
     *  @param previousPageUser address taken from nextPageUser return value from last page (address(0) for first page)
     *  @param previousPageUserOffset offset taken nextPageUserOffset return value from last page (0 for first page)
     *  @param pageSize count of elements to be returned per page (same value is used for subqueries on the exchange)
     *  @return encoded bytes representing orders and page information for next page
     */
    function getOpenOrderBookPaginated(
        address[] memory tokenFilter,
        address previousPageUser,
        uint16 previousPageUserOffset,
        uint16 pageSize
    ) public view returns (bytes memory elements, address nextPageUser, uint16 nextPageUserOffset) {
        uint32 batch = batchExchange.getCurrentBatchId();
        return
            getEncodedOrdersPaginated(
                batch,
                batch,
                batch + 1,
                getTokenIdsFromAdresses(tokenFilter),
                previousPageUser,
                previousPageUserOffset,
                pageSize
            );
    }

    /** @dev Queries the orderbook for the auction that is currently being solved
     *  @param tokenFilter all returned order will have buy *and* sell token from this list (leave empty for "no filter")
     *  @return encoded bytes representing orders
     */
    function getFinalizedOrderBook(address[] memory tokenFilter) public view returns (bytes memory) {
        (bytes memory elements, , ) = getFinalizedOrderBookPaginated(tokenFilter, address(0), 0, uint16(-1));
        return elements;
    }

    /** @dev Queries a page of the orderbook for the auction that is currently being solved
     *  @param tokenFilter all returned order will have buy *and* sell token from this list (leave empty for "no filter")
     *  @param previousPageUser address taken from nextPageUser return value from last page (address(0) for first page)
     *  @param previousPageUserOffset offset taken nextPageUserOffset return value from last page (0 for first page)
     *  @param pageSize count of elements to be returned per page (same value is used for subqueries on the exchange)
     *  @return encoded bytes representing orders and page information for next page
     */
    function getFinalizedOrderBookPaginated(
        address[] memory tokenFilter,
        address previousPageUser,
        uint16 previousPageUserOffset,
        uint16 pageSize
    ) public view returns (bytes memory elements, address nextPageUser, uint16 nextPageUserOffset) {
        uint32 batch = batchExchange.getCurrentBatchId();
        return
            getEncodedOrdersPaginated(
                batch - 1,
                batch - 1,
                batch,
                getTokenIdsFromAdresses(tokenFilter),
                previousPageUser,
                previousPageUserOffset,
                pageSize
            );
    }

    /** @dev Queries a page in the list of all orders
     *  @param maxValidFrom all returned orders will have a validFrom <= this value (they were placed at or before that batch)
     *  @param minValidUntil all returned orders will have a validUntil >= this value (validity ends at or after that batch)
     *  @param sellBalanceTargetBatchIndex the batchIndex at which we are expecting the sellTokenBalance to be valid
        (e.g. in the current live orderbook we want to include sellBalances that are valid in currentBatch + 1).
     *  @param tokenFilter all returned order will have buy *and* sell token from this list (leave empty for "no filter")
     *  @param previousPageUser address taken from nextPageUser return value from last page (address(0) for first page)
     *  @param previousPageUserOffset offset taken nextPageUserOffset return value from last page (0 for first page)
     *  @param pageSize count of elements to be returned per page (same value is used for subqueries on the exchange)
     *  @return encoded bytes representing orders and page information for next page
     */
    function getEncodedOrdersPaginated(
        uint32 maxValidFrom,
        uint32 minValidUntil,
        uint32 sellBalanceTargetBatchIndex,
        uint16[] memory tokenFilter,
        address previousPageUser,
        uint16 previousPageUserOffset,
        uint16 pageSize
    ) public view returns (bytes memory elements, address nextPageUser, uint16 nextPageUserOffset) {
        nextPageUser = previousPageUser;
        nextPageUserOffset = previousPageUserOffset;
        bool hasNextPage = true;
        while (hasNextPage) {
            bytes memory unfiltered = batchExchange.getEncodedUsersPaginated(nextPageUser, nextPageUserOffset, pageSize);
            hasNextPage = unfiltered.length / AUCTION_ELEMENT_WIDTH == pageSize;
            for (uint16 index = 0; index < unfiltered.length / AUCTION_ELEMENT_WIDTH; index++) {
                // make sure we don't overflow index * AUCTION_ELEMENT_WIDTH
                bytes memory element = unfiltered.slice(uint256(index) * AUCTION_ELEMENT_WIDTH, AUCTION_ELEMENT_WIDTH);
                element = updateSellTokenBalanceForBatchId(element, sellBalanceTargetBatchIndex);
                if (
                    maxValidFrom >= getValidFrom(element) &&
                    minValidUntil <= getValidUntil(element) &&
                    matchesTokenFilter(getBuyToken(element), getSellToken(element), tokenFilter)
                ) {
                    elements = elements.concat(element);
                }
                // Update pagination info
                address user = getUser(element);
                if (user == nextPageUser) {
                    nextPageUserOffset += 1;
                } else {
                    nextPageUserOffset = 1;
                    nextPageUser = user;
                }
                if (elements.length / AUCTION_ELEMENT_WIDTH >= pageSize) {
                    // We are at capacity, return
                    return (elements, nextPageUser, nextPageUserOffset);
                }
            }
        }
        return (elements, nextPageUser, nextPageUserOffset);
    }

    function matchesTokenFilter(uint16 buyToken, uint16 sellToken, uint16[] memory filter) public pure returns (bool) {
        // An empty filter is interpreted as "select all"
        if (filter.length == 0) {
            return true;
        }
        (bool foundBuyToken, bool foundSellToken) = (false, false);
        for (uint256 index = 0; index < filter.length; index++) {
            if (filter[index] == buyToken) {
                foundBuyToken = true;
            }
            if (filter[index] == sellToken) {
                foundSellToken = true;
            }
        }
        return foundBuyToken && foundSellToken;
    }

    function getUser(bytes memory element) public pure returns (address) {
        bytes memory slice = element.slice(0, 20);
        return slice.toAddress(0);
    }

    function getSellTokenBalance(bytes memory element) public pure returns (uint256) {
        bytes memory slice = element.slice(20, 52);
        return slice.toUint(0);
    }

    function updateSellTokenBalance(bytes memory element, uint256 amount) public pure returns (bytes memory) {
        return element.slice(0, 20).concat(abi.encodePacked(amount)).concat(element.slice(52, AUCTION_ELEMENT_WIDTH - 52));
    }

    function getBuyToken(bytes memory element) public pure returns (uint16) {
        bytes memory slice = element.slice(52, 2);
        return slice.toUint16(0);
    }

    function getSellToken(bytes memory element) public pure returns (uint16) {
        bytes memory slice = element.slice(54, 2);
        return slice.toUint16(0);
    }

    function getValidFrom(bytes memory element) public pure returns (uint32) {
        bytes memory slice = element.slice(56, 4);
        return slice.toUint32(0);
    }

    function getValidUntil(bytes memory element) public pure returns (uint32) {
        bytes memory slice = element.slice(60, 4);
        return slice.toUint32(0);
    }

    function getTokenIdsFromAdresses(address[] memory tokenIds) public view returns (uint16[] memory) {
        uint16[] memory result = new uint16[](tokenIds.length);
        for (uint256 index = 0; index < tokenIds.length; index++) {
            result[index] = batchExchange.tokenAddressToIdMap(tokenIds[index]);
        }
        return result;
    }

    function updateSellTokenBalanceForBatchId(bytes memory element, uint32 targetBatchIndex) public view returns (bytes memory) {
        address user = getUser(element);
        uint16 sellToken = getSellToken(element);
        address sellTokenAddress = batchExchange.tokenIdToAddressMap(sellToken);
        uint256 sellTokenBalance = getSellTokenBalance(element);
        (uint256 depositAmount, uint32 depositBatch) = batchExchange.getPendingDeposit(user, sellTokenAddress);
        // The deposit is not valid currently but will be valid at target batch, thus add to balance
        if (depositBatch >= getCurrentBatchId() && depositBatch < targetBatchIndex) {
            sellTokenBalance = sellTokenBalance.add(depositAmount);
        }
        (uint256 withdrawAmount, uint32 withdrawBatch) = batchExchange.getPendingWithdraw(user, sellTokenAddress);
        // The withdraw is not valid currently but will be valid at target batch, thus subtract from balance
        if (withdrawBatch >= getCurrentBatchId() && withdrawBatch < targetBatchIndex) {
            sellTokenBalance = sellTokenBalance.sub(Math.min(sellTokenBalance, withdrawAmount));
        }
        return updateSellTokenBalance(element, sellTokenBalance);
    }
}

pragma solidity ^0.5.0;

import "solidity-bytes-utils/contracts/BytesLib.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./BatchExchange.sol";


contract BatchExchangeViewer {
    using BytesLib for bytes;
    using SafeMath for uint256;

    uint8 public constant AUCTION_ELEMENT_WIDTH = 112;
    uint16 public constant LARGE_PAGE_SIZE = 5000;
    // Can be used by external contracts to indicate no filter as it doesn't seem possible
    // to create an empty memory array in solidity.
    uint16[] public ALL_TOKEN_FILTER;

    BatchExchange batchExchange;

    constructor(BatchExchange exchange) public {
        batchExchange = exchange;
    }

    /** @dev Queries the orderbook for the auction that is still accepting orders
     *  @param tokenFilter all returned order will have buy *and* sell token from this list (leave empty for "no filter")
     *  @return encoded bytes representing orders, maxed at 5000 elements
     */
    function getOpenOrderBook(address[] memory tokenFilter) public view returns (bytes memory) {
        (bytes memory elements, , , ) = getOpenOrderBookPaginated(tokenFilter, address(0), 0, LARGE_PAGE_SIZE);
        require(elements.length < LARGE_PAGE_SIZE * AUCTION_ELEMENT_WIDTH, "Orderbook too large, use paginated view functions");
        return elements;
    }

    /** @dev Queries a page of the orderbook for the auction that is still accepting orders
     *  @param tokenFilter all returned order will have buy *and* sell token from this list (leave empty for "no filter")
     *  @param previousPageUser address taken from nextPageUser return value from last page (address(0) for first page)
     *  @param previousPageUserOffset offset taken nextPageUserOffset return value from last page (0 for first page)
     *  @param maxPageSize count of elements to be returned per page (same value is used for subqueries on the exchange)
     *  @return encoded bytes representing orders and page information for next page
     */
    function getOpenOrderBookPaginated(
        address[] memory tokenFilter,
        address previousPageUser,
        uint16 previousPageUserOffset,
        uint16 maxPageSize
    ) public view returns (bytes memory elements, bool hasNextPage, address nextPageUser, uint16 nextPageUserOffset) {
        uint32 batch = batchExchange.getCurrentBatchId();
        return
            getFilteredOrdersPaginated(
                [batch, batch, batch + 1],
                getTokenIdsFromAdresses(tokenFilter),
                previousPageUser,
                previousPageUserOffset,
                maxPageSize
            );
    }

    /** @dev Queries the orderbook for the auction that is currently being solved
     *  @param tokenFilter all returned order will have buy *and* sell token from this list (leave empty for "no filter")
     *  @return encoded bytes representing orders, maxed at 5000 elements
     */
    function getFinalizedOrderBook(address[] memory tokenFilter) public view returns (bytes memory) {
        (bytes memory elements, , , ) = getFinalizedOrderBookPaginated(tokenFilter, address(0), 0, LARGE_PAGE_SIZE);
        require(elements.length < LARGE_PAGE_SIZE * AUCTION_ELEMENT_WIDTH, "Orderbook too large, use paginated view functions");
        return elements;
    }

    /** @dev Queries a page of the orderbook for the auction that is currently being solved
     *  @param tokenFilter all returned order will have buy *and* sell token from this list (leave empty for "no filter")
     *  @param previousPageUser address taken from nextPageUser return value from last page (address(0) for first page)
     *  @param previousPageUserOffset offset taken nextPageUserOffset return value from last page (0 for first page)
     *  @param maxPageSize count of elements to be returned per page (same value is used for subqueries on the exchange)
     *  @return encoded bytes representing orders and page information for next page
     */
    function getFinalizedOrderBookPaginated(
        address[] memory tokenFilter,
        address previousPageUser,
        uint16 previousPageUserOffset,
        uint16 maxPageSize
    ) public view returns (bytes memory elements, bool hasNextPage, address nextPageUser, uint16 nextPageUserOffset) {
        uint32 batch = batchExchange.getCurrentBatchId();
        return
            getFilteredOrdersPaginated(
                [batch - 1, batch - 1, batch],
                getTokenIdsFromAdresses(tokenFilter),
                previousPageUser,
                previousPageUserOffset,
                maxPageSize
            );
    }

    /** @dev Queries a page in the list of all orders
     *  @param batchIds Triple with the following values [maxValidFrom, minValidUntil, sellBalanceTargetBatchIndex]
     *  Batched together as we are running out of local variables (Solidity does not compile with Stack too deep error)
     *      - maxValidFrom: all returned orders will have a validFrom <= this value (they were placed at or before that batch)
     *      - minValidUntil all returned orders will have a validUntil >= this value (validity ends at or after that batch)
     *      - sellBalanceTargetBatchIndex the batchIndex at which we are expecting the sellTokenBalance to be valid
        (e.g. in the current live orderbook we want to include sellBalances that are valid in currentBatch + 1).
     *  @param tokenFilter all returned order will have buy *and* sell token from this list (leave empty for "no filter")
     *  @param previousPageUser address taken from nextPageUser return value from last page (address(0) for first page)
     *  @param previousPageUserOffset offset taken nextPageUserOffset return value from last page (0 for first page)
     *  @param maxPageSize maximum count of elements to be returned per page (same value is used for subqueries on the exchange)
     *  @return encoded bytes representing orders and page information for next page. Result can contain less elements than
     *  maxPageSize if remaining gas is low.
     */
    function getFilteredOrdersPaginated(
        uint32[3] memory batchIds, // batched to save local variables
        uint16[] memory tokenFilter,
        address previousPageUser,
        uint16 previousPageUserOffset,
        uint16 maxPageSize
    ) public view returns (bytes memory elements, bool hasNextPage, address nextPageUser, uint16 nextPageUserOffset) {
        elements = new bytes(maxPageSize * AUCTION_ELEMENT_WIDTH);
        uint256 elementCount = 0;
        nextPageUser = previousPageUser;
        nextPageUserOffset = previousPageUserOffset;
        hasNextPage = true;
        uint256 gasLeftBeforePage = gasleft();
        // Continue while more pages exist or we used more than 1/2 of remaining gas in previous page
        while (hasNextPage && 2 * gasleft() > gasLeftBeforePage) {
            gasLeftBeforePage = gasleft();
            bytes memory unfiltered = getEncodedOrdersPaginated(nextPageUser, nextPageUserOffset, maxPageSize);
            hasNextPage = unfiltered.length / AUCTION_ELEMENT_WIDTH == maxPageSize;
            for (uint16 index = 0; index < unfiltered.length / AUCTION_ELEMENT_WIDTH; index++) {
                // make sure we don't overflow index * AUCTION_ELEMENT_WIDTH
                bytes memory element = unfiltered.slice(uint256(index) * AUCTION_ELEMENT_WIDTH, AUCTION_ELEMENT_WIDTH);
                element = updateSellTokenBalanceForBatchId(element, batchIds[2]);
                if (
                    batchIds[0] >= getValidFrom(element) &&
                    batchIds[1] <= getValidUntil(element) &&
                    matchesTokenFilter(getBuyToken(element), getSellToken(element), tokenFilter)
                ) {
                    copyInPlace(element, elements, elementCount * AUCTION_ELEMENT_WIDTH);
                    elementCount += 1;
                }
                // Update pagination info
                address user = getUser(element);
                if (user == nextPageUser) {
                    nextPageUserOffset += 1;
                } else {
                    nextPageUserOffset = 1;
                    nextPageUser = user;
                }
                if (elementCount >= maxPageSize) {
                    // We are at capacity, return
                    return (elements, hasNextPage, nextPageUser, nextPageUserOffset);
                }
            }
        }
        setLength(elements, elementCount * AUCTION_ELEMENT_WIDTH);
        return (elements, hasNextPage, nextPageUser, nextPageUserOffset);
    }

    /** @dev View returning byte-encoded sell orders in paginated form. It has the same behavior as
     * BatchExchange.getEncodedUsersPaginated but uses less memory and thus is more gas efficient.
     * @param previousPageUser address of last user received in the previous page (address(0) for first page)
     * @param previousPageUserOffset the number of orders received for the last user on the previous page (0 for first page).
     * @param pageSize uint determining the count of orders to be returned per page
     * @return encoded bytes representing a page of orders ordered by (user, index)
     */
    function getEncodedOrdersPaginated(address previousPageUser, uint16 previousPageUserOffset, uint256 pageSize)
        public
        view
        returns (bytes memory)
    {
        bytes memory elements = new bytes(pageSize * AUCTION_ELEMENT_WIDTH);
        uint16 currentOffset = previousPageUserOffset;
        uint256 index = 0;
        address currentUser = previousPageUser;
        while (index < pageSize) {
            bytes memory element = batchExchange.getEncodedUserOrdersPaginated(currentUser, currentOffset, 1);
            if (element.length > 0) {
                currentOffset += 1;
                copyInPlace(element, elements, index * AUCTION_ELEMENT_WIDTH);
                index += 1;
            } else {
                currentOffset = 0;
                bytes memory nextUser = batchExchange.getUsersPaginated(currentUser, 1);
                if (nextUser.length > 0) {
                    currentUser = nextUser.toAddress(0);
                } else {
                    break;
                }
            }
        }
        setLength(elements, index * AUCTION_ELEMENT_WIDTH);
        return elements;
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
        if (depositBatch >= batchExchange.getCurrentBatchId() && depositBatch < targetBatchIndex) {
            sellTokenBalance = sellTokenBalance.add(depositAmount);
        }
        (uint256 withdrawAmount, uint32 withdrawBatch) = batchExchange.getPendingWithdraw(user, sellTokenAddress);
        // The withdraw is not valid currently but will be valid at target batch, thus subtract from balance
        if (withdrawBatch >= batchExchange.getCurrentBatchId() && withdrawBatch < targetBatchIndex) {
            sellTokenBalance = sellTokenBalance.sub(Math.min(sellTokenBalance, withdrawAmount));
        }
        return updateSellTokenBalance(element, sellTokenBalance);
    }

    /**
     * @dev Sets the length of the given buffer (truncating any items exceeding the length).
     * Note, that this can lead to memory leakage or undefined behavior if length  is larger than the size
     * that was originally allocated by the buffer.
     */
    function setLength(bytes memory buffer, uint256 length) public pure {
        assembly {
            mstore(buffer, length)
        }
    }

    function copyInPlace(bytes memory source, bytes memory destination, uint256 offset) public pure {
        for (uint256 i = 0; i < source.length; i++) {
            destination[offset + i] = source[i];
        }
    }
}

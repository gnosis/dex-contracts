pragma solidity ^0.5.10;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol";
import "solidity-bytes-utils/contracts/BytesLib.sol";
import "./BatchExchange.sol";

contract BatchExchangeViewer {
    using BytesLib for bytes;
    using SafeMath for uint256;

    uint8 public constant AUCTION_ELEMENT_WIDTH = 112;
    // Contains the orderId on top of the normal auction element data
    uint8 public constant INDEXED_AUCTION_ELEMENT_WIDTH = AUCTION_ELEMENT_WIDTH + 2;
    uint8 public constant ADDRESS_WIDTH = 20;
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
        require(
            elements.length < uint256(LARGE_PAGE_SIZE) * INDEXED_AUCTION_ELEMENT_WIDTH,
            "Orderbook too large, use paginated view functions"
        );
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
    )
        public
        view
        returns (
            bytes memory elements,
            bool hasNextPage,
            address nextPageUser,
            uint16 nextPageUserOffset
        )
    {
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
        require(
            elements.length < uint256(LARGE_PAGE_SIZE) * INDEXED_AUCTION_ELEMENT_WIDTH,
            "Orderbook too large, use paginated view functions"
        );
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
    )
        public
        view
        returns (
            bytes memory elements,
            bool hasNextPage,
            address nextPageUser,
            uint16 nextPageUserOffset
        )
    {
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
    )
        public
        view
        returns (
            bytes memory elements,
            bool hasNextPage,
            address nextPageUser,
            uint16 nextPageUserOffset
        )
    {
        elements = new bytes(uint256(maxPageSize) * INDEXED_AUCTION_ELEMENT_WIDTH);
        setLength(elements, 0);
        bytes memory unfiltered = new bytes(uint256(maxPageSize) * AUCTION_ELEMENT_WIDTH);
        nextPageUser = previousPageUser;
        nextPageUserOffset = previousPageUserOffset;
        hasNextPage = true;
        uint256 gasLeftBeforePage = gasleft();
        // Continue while more pages exist or we still have 3/5 (60%) of remaining gas from previous page
        while (hasNextPage && 5 * gasleft() > 3 * gasLeftBeforePage) {
            gasLeftBeforePage = gasleft();
            uint256 unfilteredCount = writeEncodedOrdersPaginatedWithTokenFilter(
                tokenFilter,
                nextPageUser,
                nextPageUserOffset,
                unfiltered
            );
            hasNextPage = unfilteredCount == maxPageSize;
            for (uint16 index = 0; index < unfilteredCount; index++) {
                // make sure we don't overflow index * AUCTION_ELEMENT_WIDTH
                bytes memory element = unfiltered.slice(uint256(index) * AUCTION_ELEMENT_WIDTH, AUCTION_ELEMENT_WIDTH);
                element = updateSellTokenBalanceForBatchId(element, batchIds[2]);
                // Update pagination info
                address user = getUser(element);
                if (user == nextPageUser) {
                    nextPageUserOffset += 1;
                } else {
                    nextPageUserOffset = 1;
                    nextPageUser = user;
                }
                if (batchIds[0] >= getValidFrom(element) && batchIds[1] <= getValidUntil(element)) {
                    setLength(elements, elements.length + INDEXED_AUCTION_ELEMENT_WIDTH);
                    copyInPlace(element, elements, elements.length - INDEXED_AUCTION_ELEMENT_WIDTH);
                    // Append index so order information can be used to construct solutions
                    copyInPlace(
                        abi.encodePacked(nextPageUserOffset - 1),
                        elements,
                        elements.length - INDEXED_AUCTION_ELEMENT_WIDTH + AUCTION_ELEMENT_WIDTH
                    );
                }
                if (elements.length >= maxPageSize * INDEXED_AUCTION_ELEMENT_WIDTH) {
                    // We are at capacity, return
                    // Note, that we might indicate a nextPage although we exactly made it to the end.
                    // However, since the inner call to fetch unfiltered orders might also indicate a next
                    // page even though it is right at the end, this cannot really be avoided.
                    return (elements, true, nextPageUser, nextPageUserOffset);
                }
            }
        }
        return (elements, hasNextPage, nextPageUser, nextPageUserOffset);
    }

    /** @dev View returning byte-encoded sell orders in paginated form. It has the same behavior as
     * BatchExchange.getEncodedUsersPaginated but uses less memory and thus is more gas efficient.
     * @param previousPageUser address of last user received in the previous page (address(0) for first page)
     * @param previousPageUserOffset the number of orders received for the last user on the previous page (0 for first page).
     * @param pageSize uint determining the count of orders to be returned per page
     * @return encoded bytes representing a page of orders ordered by (user, index)
     */
    function getEncodedOrdersPaginated(
        address previousPageUser,
        uint16 previousPageUserOffset,
        uint256 pageSize
    ) public view returns (bytes memory) {
        return getEncodedOrdersPaginatedWithTokenFilter(ALL_TOKEN_FILTER, previousPageUser, previousPageUserOffset, pageSize);
    }

    function getEncodedOrdersPaginatedWithTokenFilter(
        uint16[] memory tokenFilter,
        address previousPageUser,
        uint16 previousPageUserOffset,
        uint256 pageSize
    ) public view returns (bytes memory) {
        bytes memory elements = new bytes(pageSize * AUCTION_ELEMENT_WIDTH);
        uint256 orderCount = writeEncodedOrdersPaginatedWithTokenFilter(
            tokenFilter,
            previousPageUser,
            previousPageUserOffset,
            elements
        );
        setLength(elements, orderCount * AUCTION_ELEMENT_WIDTH);
        return elements;
    }

    function writeEncodedOrdersPaginatedWithTokenFilter(
        uint16[] memory tokenFilter,
        address previousPageUser,
        uint16 previousPageUserOffset,
        bytes memory elements
    ) public view returns (uint256) {
        uint256 pageSize = elements.length / AUCTION_ELEMENT_WIDTH;
        bytes memory users = batchExchange.getUsersPaginated(previousPageUser, uint16(pageSize));
        uint16 currentOffset = previousPageUserOffset;
        address currentUser = previousPageUser;
        uint256 orderIndex = 0;
        uint256 userIndex = 0;
        while (orderIndex < pageSize) {
            // There is no way of getting the number of orders a user has, thus "try" fetching the next order and
            // check if the static call succeeded. Otherwise move on to the next user. Limit the amount of gas as
            // in the failure case IVALID_OPCODE consumes all remaining gas.
            (bool success, bytes memory order) = address(batchExchange).staticcall.gas(5000)(
                abi.encodeWithSignature("orders(address,uint256)", currentUser, currentOffset)
            );
            if (success) {
                currentOffset += 1;
                encodeAuctionElement(tokenFilter, currentUser, order, elements, orderIndex * AUCTION_ELEMENT_WIDTH);
                orderIndex += 1;
            } else {
                currentOffset = 0;
                if (users.length >= (userIndex * ADDRESS_WIDTH) + ADDRESS_WIDTH) {
                    currentUser = getUser(users.slice(userIndex * ADDRESS_WIDTH, ADDRESS_WIDTH));
                    userIndex += 1;
                } else {
                    break;
                }
            }
        }
        return orderIndex;
    }

    function matchesTokenFilter(
        uint16 buyToken,
        uint16 sellToken,
        uint16[] memory filter
    ) public pure returns (bool) {
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
        bytes memory slice = element.slice(0, ADDRESS_WIDTH);
        return slice.toAddress(0);
    }

    function getSellTokenBalance(bytes memory element) public pure returns (uint256) {
        bytes memory slice = element.slice(ADDRESS_WIDTH, 52);
        return slice.toUint256(0);
    }

    function updateSellTokenBalance(bytes memory element, uint256 amount) public pure returns (bytes memory) {
        return
            element.slice(0, ADDRESS_WIDTH).concat(abi.encodePacked(amount)).concat(
                element.slice(52, AUCTION_ELEMENT_WIDTH - 52)
            );
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
     * @dev Queries the token information for the given tokenId. Can handle symbols of type string and bytes (e.g. MKR).
     * Returns "Unknown" as symbol value if it cannot be retrieved and reverts if decimals can not be fetched
     * (to avoid ambiguity with a "valid" value).
     * @param tokenId the ID of a token listed on BatchExchange
     * @return the address, symbol and decimals of the token contract
     */
    function getTokenInfo(uint16 tokenId)
        public
        view
        returns (
            address,
            string memory symbol,
            uint8 decimals
        )
    {
        address tokenAddress = batchExchange.tokenIdToAddressMap(tokenId);
        symbol = "";
        (bool hasStringSymbol, ) = address(this).staticcall(
            abi.encodeWithSignature("getTokenSymbolString(address)", tokenAddress)
        );
        if (hasStringSymbol) {
            symbol = getTokenSymbolString(tokenAddress);
        } else {
            (bool hasBytesSymbol, ) = address(this).staticcall(
                abi.encodeWithSignature("getTokenSymbolBytes(address)", tokenAddress)
            );
            if (hasBytesSymbol) {
                symbol = getTokenSymbolBytes(tokenAddress);
            }
        }
        return (tokenAddress, symbol, ERC20Detailed(tokenAddress).decimals());
    }

    /**
     * @dev returns the symbol() of the given address assuming it is returned as a string.
     * Reverts if method does not exist or returns data that is not a valid string.
     * @param token the token address from which to receive the symbol
     * @return the token's symbol
     */
    function getTokenSymbolString(address token) public view returns (string memory) {
        return ERC20Detailed(token).symbol();
    }

    /**
     * @dev returns the symbol() of the given address assuming it is returned as a bytes.
     * Reverts if method does not exist or returns data that cannot be casted into a string.
     * @param token the token address from which to receive the symbol
     * @return the token's symbol converted into a trimmed (trailing 0 bytes remove) string.
     */
    function getTokenSymbolBytes(address token) public view returns (string memory) {
        (bool success, bytes memory result) = token.staticcall(abi.encodeWithSignature("symbol()"));
        if (!success) {
            revert("Cannot get symbol");
        }
        //Find last non-zero byte
        for (uint256 index = 0; index < result.length; index++) {
            if (result[index] == 0) {
                setLength(result, index);
                break;
            }
        }
        return string(result);
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

    function copyInPlace(
        bytes memory source,
        bytes memory destination,
        uint256 offset
    ) public pure {
        for (uint256 i = 0; i < source.length; i++) {
            destination[offset + i] = source[i];
        }
    }

    /** @dev Encodes the auction elements in the same format as BatchExchange.encodeAuctionElement with
     * the only difference that order with tokens that match the token filter will be 0 serialized
     * (as if they were deleted)
     */
    function encodeAuctionElement(
        uint16[] memory tokenFilter,
        address user,
        bytes memory order,
        bytes memory target,
        uint256 offset
    ) private view {
        (
            uint16 buyToken,
            uint16 sellToken,
            uint32 validFrom,
            uint32 validUntil,
            uint128 priceNumerator,
            uint128 priceDenominator,
            uint128 usedAmount
        ) = abi.decode(order, (uint16, uint16, uint32, uint32, uint128, uint128, uint128));
        // Unconditionally serialize user address to not break pagination
        copyInPlace(abi.encodePacked(user), target, offset);
        if (matchesTokenFilter(buyToken, sellToken, tokenFilter)) {
            uint128 remainingAmount = priceDenominator - usedAmount;
            uint256 sellTokenBalance = batchExchange.getBalance(user, batchExchange.tokenIdToAddressMap(sellToken));
            copyInPlace(
                abi.encodePacked(
                    sellTokenBalance,
                    buyToken,
                    sellToken,
                    validFrom,
                    validUntil,
                    priceNumerator,
                    priceDenominator,
                    remainingAmount
                ),
                target,
                offset + ADDRESS_WIDTH
            );
        } else {
            // NOTE: Ensure we write 0-s to the target memory location as we are
            // reusing buffer and want to avoid stale data being left behind.
            for (uint256 i = ADDRESS_WIDTH; i < AUCTION_ELEMENT_WIDTH; i++) {
                target[i + offset] = 0;
            }
        }
    }
}

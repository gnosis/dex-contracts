pragma solidity ^0.5.0;

import "solidity-bytes-utils/contracts/BytesLib.sol";
import "./BatchExchange.sol";


contract BatchExchangeViewer {
    using BytesLib for bytes;

    uint8 public constant AUCTION_ELEMENT_WIDTH = 112;

    BatchExchange batchExchange;

    constructor(BatchExchange exchange) public {
        batchExchange = exchange;
    }

    /** @dev Queries the orderbook for the auction that is still accepting orders
     *  @return encoded bytes representing orders
     */
    function getOpenOrderBook() public view returns (bytes memory) {
        (bytes memory elements, , ) = getOpenOrderBookPaginated(address(0), 0, uint16(-1));
        return elements;
    }

    /** @dev Queries a page of the orderbook for the auction that is still accepting orders
     *  @param previousPageUser address taken from nextPageUser return value from last page (address(0) for first page)
     *  @param previousPageUserOffset offset taken nextPageUserOffset return value from last page (0 for first page)
     *  @param pageSize count of elements to be returned per page (same value is used for subqueries on the exchange)
     *  @return encoded bytes representing orders and page information for next page
     */
    function getOpenOrderBookPaginated(address previousPageUser, uint16 previousPageUserOffset, uint16 pageSize)
        public
        view
        returns (bytes memory elements, address nextPageUser, uint16 nextPageUserOffset)
    {
        uint32 batch = batchExchange.getCurrentBatchId();
        return getEncodedOrdersPaginated(batch, batch, previousPageUser, previousPageUserOffset, pageSize);
    }

    /** @dev Queries the orderbook for the auction that is currently being solved
     *  @return encoded bytes representing orders
     */
    function getFinalizedOrderBook() public view returns (bytes memory) {
        (bytes memory elements, , ) = getFinalizedOrderBookPaginated(address(0), 0, uint16(-1));
        return elements;
    }

    /** @dev Queries a page of the orderbook for the auction that is currently being solved
     *  @param previousPageUser address taken from nextPageUser return value from last page (address(0) for first page)
     *  @param previousPageUserOffset offset taken nextPageUserOffset return value from last page (0 for first page)
     *  @param pageSize count of elements to be returned per page (same value is used for subqueries on the exchange)
     *  @return encoded bytes representing orders and page information for next page
     */
    function getFinalizedOrderBookPaginated(address previousPageUser, uint16 previousPageUserOffset, uint16 pageSize)
        public
        view
        returns (bytes memory elements, address nextPageUser, uint16 nextPageUserOffset)
    {
        uint32 batch = batchExchange.getCurrentBatchId();
        return getEncodedOrdersPaginated(batch - 1, batch - 1, previousPageUser, previousPageUserOffset, pageSize);
    }

    /** @dev Queries a page in the list of all orders
     *  @param maxValidFrom all returned orders will have a validFrom <= this value (they were placed at or before that batch)
     *  @param minValidUntil all returned orders will have a validUntil >= this value (validity ends at or after that batch)
     *  @param previousPageUser address taken from nextPageUser return value from last page (address(0) for first page)
     *  @param previousPageUserOffset offset taken nextPageUserOffset return value from last page (0 for first page)
     *  @param pageSize count of elements to be returned per page (same value is used for subqueries on the exchange)
     *  @return encoded bytes representing orders and page information for next page
     */
    function getEncodedOrdersPaginated(
        uint32 maxValidFrom,
        uint32 minValidUntil,
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
                bytes memory element = unfiltered.slice(index * AUCTION_ELEMENT_WIDTH, AUCTION_ELEMENT_WIDTH);
                if (maxValidFrom >= getValidFrom(element) && minValidUntil <= getValidUntil(element)) {
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

    function getUser(bytes memory element) public pure returns (address) {
        bytes memory slice = element.slice(0, 20);
        return slice.toAddress(0);
    }

    function getValidFrom(bytes memory element) public pure returns (uint32) {
        bytes memory slice = element.slice(56, 4);
        return slice.toUint32(0);
    }

    function getValidUntil(bytes memory element) public pure returns (uint32) {
        bytes memory slice = element.slice(60, 4);
        return slice.toUint32(0);
    }
}

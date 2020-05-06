const { decodeOrdersBN, decodeIndexedOrdersBN } = require("./encoding");

/**
 * Returns an iterator yielding an item for each page of order in the orderbook that is currently being collected.
 * @param {BatchExchangeViewer} contract to query from
 * @param {number} pageSize the number of items to fetch per page
 */
const getOpenOrdersPaginated = async function* (contract, pageSize) {
  let nextPageUser = "0x0000000000000000000000000000000000000000";
  let nextPageUserOffset = 0;
  let hasNextPage = true;

  while (hasNextPage) {
    const page = await contract.methods
      .getOpenOrderBookPaginated([], nextPageUser, nextPageUserOffset, pageSize)
      .call();
    const elements = decodeIndexedOrdersBN(page.elements);
    yield elements;

    //Update page info
    hasNextPage = page.hasNextPage;
    nextPageUser = page.nextPageUser;
    nextPageUserOffset = page.nextPageUserOffset;
  }
};

/**
 * Returns all orders in the orderbook.
 * @param {BatchExchange} contract to query from
 * @param {number} pageSize the number of items to fetch per page
 */
const getOrdersPaginated = async (contract, pageSize) => {
  let orders = [];
  let currentUser = "0x0000000000000000000000000000000000000000";
  let currentOffSet = 0;
  let lastPageSize = pageSize;
  while (lastPageSize == pageSize) {
    const page = decodeOrdersBN(
      await contract.methods
        .getEncodedUsersPaginated(currentUser, currentOffSet, pageSize)
        .call(),
    );
    orders = orders.concat(page);
    for (const index in page) {
      if (page[index].user != currentUser) {
        currentUser = page[index].user;
        currentOffSet = 0;
      }
      currentOffSet += 1;
    }
    lastPageSize = page.length;
  }
  return orders;
};

module.exports = {
  getOpenOrdersPaginated,
  getOrdersPaginated,
};

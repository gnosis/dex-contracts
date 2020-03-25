const { decodeOrdersBN } = require("./encoding")

/**
 * Returns an iterator yielding an item for each page of order in the orderbook that is currently being collected.
 * @param {BatchExchangeViewer} contract to query from
 * @param {number} pageSize the number of items to fetch per page
 */
const getOpenOrdersPaginated = async function* (contract, pageSize) {
  let nextPageUser = "0x0000000000000000000000000000000000000000"
  let nextPageUserOffset = 0
  let lastPageSize = pageSize

  while (lastPageSize == pageSize) {
    const page = await contract.methods.getOpenOrderBookPaginated([], nextPageUser, nextPageUserOffset, pageSize).call()
    const elements = decodeOrdersBN(page.elements)
    yield elements

    //Update page info
    lastPageSize = elements.length
    nextPageUser = page.nextPageUser
    nextPageUserOffset = page.nextPageUserOffset
  }
}

module.exports = {
  getOpenOrdersPaginated,
}

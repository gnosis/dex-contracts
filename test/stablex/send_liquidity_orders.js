const { closeAuction, sendLiquidityOrders, getOrdersViaPaginatedApproach } = require("../../scripts/stablex/utilities.js")
const BatchExchange = artifacts.require("BatchExchange")
const MockContract = artifacts.require("MockContract")
const IdToAddressBiMap = artifacts.require("IdToAddressBiMap")
const IterableAppendOnlySet = artifacts.require("IterableAppendOnlySet")
const ERC20 = artifacts.require("ERC20")

contract("Liquidity order placement test", async accounts => {
  let feeToken
  before(async () => {
    feeToken = await MockContract.new()
    await feeToken.givenAnyReturnBool(true)
    const lib1 = await IdToAddressBiMap.new()
    const lib2 = await IterableAppendOnlySet.new()
    await BatchExchange.link("IdToAddressBiMap", lib1.address)
    await BatchExchange.link("IterableAppendOnlySet", lib2.address)
  })

  // In the following tests, it might be possible that an batchId is read from the blockchain
  // and in the next moment this batchId is no longer the current one. In order to prevent these
  // situations, we set the adjust the start-time of each test to the start of an new auction.
  beforeEach(async () => {
    const batchExchange = await BatchExchange.deployed()
    await closeAuction(batchExchange)
  })

  describe("OWL liquidity provision test", async () => {
    it("Adds new tokens to the exchange and create the liquidity for a subset of them", async () => {
      const batchExchange = await BatchExchange.new(2 ** 16 - 1, feeToken.address)

      Array.from(Array(10)).forEach(async () => {
        const token_1 = await ERC20.new()
        await batchExchange.addToken(token_1.address, { from: accounts[0] })
      })

      const tokenIds = [1, 3, 5]
      await sendLiquidityOrders(batchExchange, tokenIds)

      const orders = await getOrdersViaPaginatedApproach(batchExchange, 100)
      assert.equals(orders[0].buyToken, 0)
      assert.equals(orders[0].sellToken, tokenIds[0])
    })
  })
})

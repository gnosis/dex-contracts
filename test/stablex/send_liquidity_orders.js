const { closeAuction, sendLiquidityOrders, getOrdersViaPaginatedApproach } = require("../../scripts/stablex/utilities.js")
const BatchExchange = artifacts.require("BatchExchange")
const MockContract = artifacts.require("MockContract")
const IdToAddressBiMap = artifacts.require("IdToAddressBiMap")
const IterableAppendOnlySet = artifacts.require("IterableAppendOnlySet")
const DeployableERC20Detailed = artifacts.require("DeployableERC20Detailed")
const BN = require("bn.js")

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
      const SELL_ORDER_AMOUNT_OWL = new BN(10).pow(new BN(18)).mul(new BN(5))
      const PRICE_FOR_LIQUIDITY_PROVISION = new BN(10000)
      for (let i = 0; i < 6; i++) {
        const token_1 = await DeployableERC20Detailed.new("NAME-" + i, "Symbol-" + i, 18)
        await batchExchange.addToken(token_1.address, { from: accounts[0] })
      }
      const tokenIds = [1, 3, 5]
      await sendLiquidityOrders(batchExchange, tokenIds, PRICE_FOR_LIQUIDITY_PROVISION, SELL_ORDER_AMOUNT_OWL, artifacts)

      const orders = await getOrdersViaPaginatedApproach(batchExchange, 100)
      assert.deepEqual(
        orders.map(o => o.buyToken),
        tokenIds
      )
      assert.equal(orders[0].sellToken, 0)
    })
  })
})

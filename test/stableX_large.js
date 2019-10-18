const StablecoinConverter = artifacts.require("StablecoinConverter")
const MockContract = artifacts.require("MockContract")

const truffleAssert = require("truffle-assertions")

const {
  waitForNSeconds,
  sendTxAndGetReturnValue
} = require("./utilities.js")

const feeDenominator = 1000 // fee is (1 / feeDenominator)

function feeSubtracted(x) {
  return Math.floor(x * (feeDenominator - 1) / feeDenominator)
}

function feeAdded(x) {
  return Math.floor(x * (feeDenominator) / (feeDenominator - 1))
}

contract("StablecoinConverter", async (accounts) => {

  const [user_1, user_2, solutionSubmitter] = accounts

  // Basic Trade used in most of the tests:
  // Trade for user_1: amount of token_1 sold: 20020, amount of token_2 bought: 10000,
  // Trade for user_2: amount of token_2 sold: 10000, amount of token_1 bought: feeSubtracted(10000) * 2
  // ==> Token conservation holds for token_2, and fee token == token_1 has negative balance of 40

  const basicTrade = {
    deposits: [{ amount: feeAdded(2000000), token: 0, user: user_1 }, { amount: feeAdded(1000000) * 2, token: 1, user: user_2 }],
    orders: [
      { sellToken: 0, buyToken: 1, sellAmount: feeAdded(2000000), buyAmount: 1000000, user: user_1 },
      { sellToken: 1, buyToken: 0, sellAmount: feeAdded(1000000), buyAmount: feeSubtracted(1000000) * 2, user: user_2 }
    ],
    solution: { prices: [1, 2], owners: [user_1, user_2], volume: [1000000, feeSubtracted(1000000) * 2], tokenIdsForPrice: [0, 1] }
  }

  let stablecoinConverter
  let batchIndex, orderId1, orderId2, prices, seedOwners, seedVolumes, tokenIdsForPrice
  beforeEach(async () => {
    const feeToken = await MockContract.new()
    stablecoinConverter = await StablecoinConverter.new(2 ** 16 - 1, feeDenominator, feeToken.address)

    const erc20_2 = await MockContract.new()
    await feeToken.givenAnyReturnBool(true)
    await erc20_2.givenAnyReturnBool(true)

    await stablecoinConverter.deposit(feeToken.address, basicTrade.deposits[0].amount, { from: basicTrade.deposits[0].user })
    await stablecoinConverter.deposit(erc20_2.address, basicTrade.deposits[1].amount, { from: basicTrade.deposits[1].user })

    await stablecoinConverter.addToken(erc20_2.address)
    batchIndex = (await stablecoinConverter.getCurrentBatchId.call()).toNumber()

    orderId1 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[0].buyToken, basicTrade.orders[0].sellToken, true, batchIndex + 1, basicTrade.orders[0].buyAmount, basicTrade.orders[0].sellAmount, { from: basicTrade.orders[0].user })
    orderId2 = await sendTxAndGetReturnValue(stablecoinConverter.placeOrder, basicTrade.orders[1].buyToken, basicTrade.orders[1].sellToken, true, batchIndex + 1, basicTrade.orders[1].buyAmount, basicTrade.orders[1].sellAmount, { from: basicTrade.orders[1].user })

    await closeAuction(stablecoinConverter)

    prices = basicTrade.solution.prices
    seedOwners = basicTrade.solution.owners
    seedVolumes = [10000, feeSubtracted(10000) * 2]
    tokenIdsForPrice = basicTrade.solution.tokenIdsForPrice
  })

  describe("submit single solutions", () => {
    it("filling 10 orders", async () => {
      const halfNumTouched = 5
      const owner = Array(halfNumTouched).fill(seedOwners[0]).concat(Array(halfNumTouched).fill(seedOwners[1]))
      const orderId = Array(halfNumTouched).fill(orderId1).concat(Array(halfNumTouched).fill(orderId2))
      const volume = Array(halfNumTouched).fill(seedVolumes[0] / halfNumTouched).concat(Array(halfNumTouched).fill(seedVolumes[1] / halfNumTouched))

      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice, { from: solutionSubmitter })
    })
    it("filling 20 orders", async () => {
      const halfNumTouched = 10
      const owner = Array(halfNumTouched).fill(seedOwners[0]).concat(Array(halfNumTouched).fill(seedOwners[1]))
      const orderId = Array(halfNumTouched).fill(orderId1).concat(Array(halfNumTouched).fill(orderId2))
      const volume = Array(halfNumTouched).fill(seedVolumes[0] / halfNumTouched).concat(Array(halfNumTouched).fill(seedVolumes[1] / halfNumTouched))

      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice, { from: solutionSubmitter })
    })
    it("filling 40 orders", async () => {
      const halfNumTouched = 20
      const owner = Array(halfNumTouched).fill(seedOwners[0]).concat(Array(halfNumTouched).fill(seedOwners[1]))
      const orderId = Array(halfNumTouched).fill(orderId1).concat(Array(halfNumTouched).fill(orderId2))
      const volume = Array(halfNumTouched).fill(seedVolumes[0] / halfNumTouched).concat(Array(halfNumTouched).fill(seedVolumes[1] / halfNumTouched))

      await stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice, { from: solutionSubmitter })
    })
    it("fails when trying to fill 80 orders", async () => {
      const halfNumTouched = 40
      const specialSeedVolumes = [100000, feeSubtracted(100000) * 2]

      const owner = Array(halfNumTouched).fill(seedOwners[0]).concat(Array(halfNumTouched).fill(seedOwners[1]))
      const orderId = Array(halfNumTouched).fill(orderId1).concat(Array(halfNumTouched).fill(orderId2))
      const volume = Array(halfNumTouched).fill(specialSeedVolumes[0] / halfNumTouched).concat(Array(halfNumTouched).fill(specialSeedVolumes[1] / halfNumTouched))
      await truffleAssert.fails(
        stablecoinConverter.submitSolution(batchIndex, owner, orderId, volume, prices, tokenIdsForPrice, { from: solutionSubmitter }),
        "out of gas"
      )
    })
  })
  describe("submit competing solutions", () => {
    it("submits 1 competing solution with 10 touched", async () => {
      const halfNumTouched = 5
      const owner = Array(halfNumTouched).fill(seedOwners[0]).concat(Array(halfNumTouched).fill(seedOwners[1]))
      const orderIds = Array(halfNumTouched).fill(orderId1).concat(Array(halfNumTouched).fill(orderId2))

      const volume = Array(halfNumTouched).fill(seedVolumes[0] / halfNumTouched).concat(Array(halfNumTouched).fill(seedVolumes[1] / halfNumTouched))
      await stablecoinConverter.submitSolution(batchIndex, owner, orderIds, volume, prices, tokenIdsForPrice, { from: solutionSubmitter })

      const seedVolumes2 = [100000, feeSubtracted(100000) * 2]
      const volume2 = Array(halfNumTouched).fill(seedVolumes2[0] / halfNumTouched).concat(Array(halfNumTouched).fill(seedVolumes2[1] / halfNumTouched))
      await stablecoinConverter.submitSolution(batchIndex, owner, orderIds, volume2, prices, tokenIdsForPrice, { from: solutionSubmitter })
    })
    it("submits 2 competing solutions with 10 touched", async () => {
      const halfNumTouched = 5
      const owner = Array(halfNumTouched).fill(seedOwners[0]).concat(Array(halfNumTouched).fill(seedOwners[1]))
      const orderIds = Array(halfNumTouched).fill(orderId1).concat(Array(halfNumTouched).fill(orderId2))

      const volume = Array(halfNumTouched).fill(seedVolumes[0] / halfNumTouched).concat(Array(halfNumTouched).fill(seedVolumes[1] / halfNumTouched))
      await stablecoinConverter.submitSolution(batchIndex, owner, orderIds, volume, prices, tokenIdsForPrice, { from: solutionSubmitter })

      const seedVolumes2 = [50000, feeSubtracted(50000) * 2]
      const volume2 = Array(halfNumTouched).fill(seedVolumes2[0] / halfNumTouched).concat(Array(halfNumTouched).fill(seedVolumes2[1] / halfNumTouched))
      await stablecoinConverter.submitSolution(batchIndex, owner, orderIds, volume2, prices, tokenIdsForPrice, { from: solutionSubmitter })


      const seedVolumes3 = [100000, feeSubtracted(100000) * 2]
      const volume3 = Array(halfNumTouched).fill(seedVolumes3[0] / halfNumTouched).concat(Array(halfNumTouched).fill(seedVolumes3[1] / halfNumTouched))
      await stablecoinConverter.submitSolution(batchIndex, owner, orderIds, volume3, prices, tokenIdsForPrice, { from: solutionSubmitter })
    })
    it("submits 1 competing solution with 20 touched", async () => {
      const halfNumTouched = 10
      const owner = Array(halfNumTouched).fill(seedOwners[0]).concat(Array(halfNumTouched).fill(seedOwners[1]))
      const orderIds = Array(halfNumTouched).fill(orderId1).concat(Array(halfNumTouched).fill(orderId2))

      const volume = Array(halfNumTouched).fill(seedVolumes[0] / halfNumTouched).concat(Array(halfNumTouched).fill(seedVolumes[1] / halfNumTouched))
      await stablecoinConverter.submitSolution(batchIndex, owner, orderIds, volume, prices, tokenIdsForPrice, { from: solutionSubmitter })

      const seedVolumes2 = [100000, feeSubtracted(100000) * 2]
      const volume2 = Array(halfNumTouched).fill(seedVolumes2[0] / halfNumTouched).concat(Array(halfNumTouched).fill(seedVolumes2[1] / halfNumTouched))
      await stablecoinConverter.submitSolution(batchIndex, owner, orderIds, volume2, prices, tokenIdsForPrice, { from: solutionSubmitter })
    })
    it("submits 2 competing solutions with 20 touched", async () => {
      const halfNumTouched = 10
      const owner = Array(halfNumTouched).fill(seedOwners[0]).concat(Array(halfNumTouched).fill(seedOwners[1]))
      const orderIds = Array(halfNumTouched).fill(orderId1).concat(Array(halfNumTouched).fill(orderId2))

      const volume = Array(halfNumTouched).fill(seedVolumes[0] / halfNumTouched).concat(Array(halfNumTouched).fill(seedVolumes[1] / halfNumTouched))
      await stablecoinConverter.submitSolution(batchIndex, owner, orderIds, volume, prices, tokenIdsForPrice, { from: solutionSubmitter })

      const seedVolumes2 = [50000, feeSubtracted(50000) * 2]
      const volume2 = Array(halfNumTouched).fill(seedVolumes2[0] / halfNumTouched).concat(Array(halfNumTouched).fill(seedVolumes2[1] / halfNumTouched))
      await stablecoinConverter.submitSolution(batchIndex, owner, orderIds, volume2, prices, tokenIdsForPrice, { from: solutionSubmitter })

      const seedVolumes3 = [100000, feeSubtracted(100000) * 2]
      const volume3 = Array(halfNumTouched).fill(seedVolumes3[0] / halfNumTouched).concat(Array(halfNumTouched).fill(seedVolumes3[1] / halfNumTouched))
      await stablecoinConverter.submitSolution(batchIndex, owner, orderIds, volume3, prices, tokenIdsForPrice, { from: solutionSubmitter })
    })
    it("fails on competing solution with 40 touched", async () => {
      const halfNumTouched = 20
      const owner = Array(halfNumTouched).fill(seedOwners[0]).concat(Array(halfNumTouched).fill(seedOwners[1]))
      const orderIds = Array(halfNumTouched).fill(orderId1).concat(Array(halfNumTouched).fill(orderId2))

      const volume = Array(halfNumTouched).fill(seedVolumes[0] / halfNumTouched).concat(Array(halfNumTouched).fill(seedVolumes[1] / halfNumTouched))
      await stablecoinConverter.submitSolution(batchIndex, owner, orderIds, volume, prices, tokenIdsForPrice, { from: solutionSubmitter })

      const seedVolumes2 = [100000, feeSubtracted(100000) * 2]
      const volume2 = Array(halfNumTouched).fill(seedVolumes2[0] / halfNumTouched).concat(Array(halfNumTouched).fill(seedVolumes2[1] / halfNumTouched))
      await truffleAssert.fails(
        stablecoinConverter.submitSolution(batchIndex, owner, orderIds, volume2, prices, tokenIdsForPrice, { from: solutionSubmitter }),
        "out of gas"
      )
    })
  })
})

const closeAuction = async (instance) => {
  const time_remaining = (await instance.getSecondsRemainingInBatch()).toNumber()
  await waitForNSeconds(time_remaining + 1)
}
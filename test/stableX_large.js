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
    deposits: [{ amount: feeAdded(20000000), token: 0, user: user_1 }, { amount: feeAdded(10000000) * 2, token: 1, user: user_2 }],
    orders: [
      { sellToken: 0, buyToken: 1, sellAmount: feeAdded(20000), buyAmount: 10000, user: user_1 },
      { sellToken: 1, buyToken: 0, sellAmount: feeAdded(10000), buyAmount: feeSubtracted(10000) * 2, user: user_2 }
    ],
    solution: { prices: [1, 2], owners: [user_1, user_2], volume: [10000, feeSubtracted(10000) * 2], tokenIdsForPrice: [0, 1] }
  }

  let stablecoinConverter
  let batchIndex, prices, seedOwners, seedVolumes, tokenIdsForPrice

  async function makeOrdersAndCloseAuction(halfN, volumes) {
    const orders = Array(halfN).fill(basicTrade.orders[0]).concat(Array(halfN).fill(basicTrade.orders[1]))
    const orderIds = []
    for (const order of orders) {
      orderIds.push(
        await sendTxAndGetReturnValue(
          stablecoinConverter.placeOrder,
          order.buyToken,
          order.sellToken,
          batchIndex + 1,
          order.buyAmount,
          order.sellAmount,
          { from: order.user })
      )
    }
    await closeAuction(stablecoinConverter)
    return {
      owners: Array(halfN).fill(seedOwners[0]).concat(Array(halfN).fill(seedOwners[1])),
      volumes: Array(halfN).fill(volumes[0]).concat(Array(halfN).fill(volumes[1])),
      orderIds: orderIds
    }
  }

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

    prices = basicTrade.solution.prices
    seedOwners = basicTrade.solution.owners
    seedVolumes = [7000, feeSubtracted(7000) * 2]
    tokenIdsForPrice = basicTrade.solution.tokenIdsForPrice
  })

  describe("submit single solutions", () => {
    it("filling 10 orders", async () => {
      const solution = await makeOrdersAndCloseAuction(5, seedVolumes)
      await stablecoinConverter.submitSolution(batchIndex, solution.owners, solution.orderIds, solution.volumes, prices, tokenIdsForPrice, { from: solutionSubmitter })
    })
    it("filling 20 orders", async () => {
      const solution = await makeOrdersAndCloseAuction(10, seedVolumes)
      await stablecoinConverter.submitSolution(batchIndex, solution.owners, solution.orderIds, solution.volumes, prices, tokenIdsForPrice, { from: solutionSubmitter })
    })
    it("filling 40 orders", async () => {
      const solution = await makeOrdersAndCloseAuction(20, seedVolumes)
      await stablecoinConverter.submitSolution(batchIndex, solution.owners, solution.orderIds, solution.volumes, prices, tokenIdsForPrice, { from: solutionSubmitter })
    })
    it("fails with out of gas when trying to fill 80 orders", async () => {
      const solution = await makeOrdersAndCloseAuction(40, seedVolumes)
      await truffleAssert.fails(
        stablecoinConverter.submitSolution(batchIndex, solution.owners, solution.orderIds, solution.volumes, prices, tokenIdsForPrice, { from: solutionSubmitter }),
        "out of gas"
      )
    })
  })
  describe("submit competing solutions", () => {
    it("submits 1 competing with 10 touched", async () => {
      const solution = await makeOrdersAndCloseAuction(5, seedVolumes)
      await stablecoinConverter.submitSolution(batchIndex, solution.owners, solution.orderIds, solution.volumes, prices, tokenIdsForPrice, { from: solutionSubmitter })

      const seedVolumes2 = [10000, feeSubtracted(10000) * 2]
      const volumes2 = Array(5).fill(seedVolumes2[0]).concat(Array(5).fill(seedVolumes2[1]))
      await stablecoinConverter.submitSolution(batchIndex, solution.owners, solution.orderIds, volumes2, prices, tokenIdsForPrice, { from: solutionSubmitter })
    })
    it("submits 2 competing with 10 touched", async () => {
      const halfNumTouched = 5
      const solution = await makeOrdersAndCloseAuction(halfNumTouched, seedVolumes)
      await stablecoinConverter.submitSolution(batchIndex, solution.owners, solution.orderIds, solution.volumes, prices, tokenIdsForPrice, { from: solutionSubmitter })

      const seedVolumes2 = [8000, feeSubtracted(8000) * 2]
      const volumes2 = Array(halfNumTouched).fill(seedVolumes2[0]).concat(Array(halfNumTouched).fill(seedVolumes2[1]))
      await stablecoinConverter.submitSolution(batchIndex, solution.owners, solution.orderIds, volumes2, prices, tokenIdsForPrice, { from: solutionSubmitter })

      const seedVolumes3 = [10000, feeSubtracted(10000) * 2]
      const volumes3 = Array(halfNumTouched).fill(seedVolumes3[0]).concat(Array(halfNumTouched).fill(seedVolumes3[1]))
      await stablecoinConverter.submitSolution(batchIndex, solution.owners, solution.orderIds, volumes3, prices, tokenIdsForPrice, { from: solutionSubmitter })
    })
    it("submits 1 competing with 20 touched", async () => {
      const halfNumTouched = 10
      const solution = await makeOrdersAndCloseAuction(halfNumTouched, seedVolumes)
      await stablecoinConverter.submitSolution(batchIndex, solution.owners, solution.orderIds, solution.volumes, prices, tokenIdsForPrice, { from: solutionSubmitter })

      const seedVolumes2 = [8000, feeSubtracted(8000) * 2]
      const volumes2 = Array(halfNumTouched).fill(seedVolumes2[0]).concat(Array(halfNumTouched).fill(seedVolumes2[1]))
      await stablecoinConverter.submitSolution(batchIndex, solution.owners, solution.orderIds, volumes2, prices, tokenIdsForPrice, { from: solutionSubmitter })
    })
    it("submits 2 competing with 20 touched", async () => {
      const halfNumTouched = 10
      const solution = await makeOrdersAndCloseAuction(halfNumTouched, seedVolumes)
      await stablecoinConverter.submitSolution(batchIndex, solution.owners, solution.orderIds, solution.volumes, prices, tokenIdsForPrice, { from: solutionSubmitter })

      const seedVolumes2 = [8000, feeSubtracted(8000) * 2]
      const volumes2 = Array(halfNumTouched).fill(seedVolumes2[0]).concat(Array(halfNumTouched).fill(seedVolumes2[1]))
      await stablecoinConverter.submitSolution(batchIndex, solution.owners, solution.orderIds, volumes2, prices, tokenIdsForPrice, { from: solutionSubmitter })

      const seedVolumes3 = [10000, feeSubtracted(10000) * 2]
      const volumes3 = Array(halfNumTouched).fill(seedVolumes3[0]).concat(Array(halfNumTouched).fill(seedVolumes3[1]))
      await stablecoinConverter.submitSolution(batchIndex, solution.owners, solution.orderIds, volumes3, prices, tokenIdsForPrice, { from: solutionSubmitter })
    })
    it("submits 1 competing with 24 touched", async () => {
      const halfNumTouched = 12
      const solution = await makeOrdersAndCloseAuction(halfNumTouched, seedVolumes)
      await stablecoinConverter.submitSolution(batchIndex, solution.owners, solution.orderIds, solution.volumes, prices, tokenIdsForPrice, { from: solutionSubmitter })

      const seedVolumes2 = [8000, feeSubtracted(8000) * 2]
      const volumes2 = Array(halfNumTouched).fill(seedVolumes2[0]).concat(Array(halfNumTouched).fill(seedVolumes2[1]))
      await stablecoinConverter.submitSolution(batchIndex, solution.owners, solution.orderIds, volumes2, prices, tokenIdsForPrice, { from: solutionSubmitter })
    })
    it("submits 2 competing with 24 touched", async () => {
      const halfNumTouched = 12
      const solution = await makeOrdersAndCloseAuction(halfNumTouched, seedVolumes)
      await stablecoinConverter.submitSolution(batchIndex, solution.owners, solution.orderIds, solution.volumes, prices, tokenIdsForPrice, { from: solutionSubmitter })

      const seedVolumes2 = [8000, feeSubtracted(8000) * 2]
      const volumes2 = Array(halfNumTouched).fill(seedVolumes2[0]).concat(Array(halfNumTouched).fill(seedVolumes2[1]))
      await stablecoinConverter.submitSolution(batchIndex, solution.owners, solution.orderIds, volumes2, prices, tokenIdsForPrice, { from: solutionSubmitter })

      const seedVolumes3 = [10000, feeSubtracted(10000) * 2]
      const volumes3 = Array(halfNumTouched).fill(seedVolumes3[0]).concat(Array(halfNumTouched).fill(seedVolumes3[1]))
      await stablecoinConverter.submitSolution(batchIndex, solution.owners, solution.orderIds, volumes3, prices, tokenIdsForPrice, { from: solutionSubmitter })
    })
    it("submits 1 competing with 30 touched", async () => {
      const halfNumTouched = 15
      const solution = await makeOrdersAndCloseAuction(halfNumTouched, seedVolumes)
      await stablecoinConverter.submitSolution(batchIndex, solution.owners, solution.orderIds, solution.volumes, prices, tokenIdsForPrice, { from: solutionSubmitter })

      const seedVolumes2 = [8000, feeSubtracted(8000) * 2]
      const volumes2 = Array(halfNumTouched).fill(seedVolumes2[0]).concat(Array(halfNumTouched).fill(seedVolumes2[1]))
      await stablecoinConverter.submitSolution(batchIndex, solution.owners, solution.orderIds, volumes2, prices, tokenIdsForPrice, { from: solutionSubmitter })
    })
    it("submits 2 competing with 30 touched", async () => {
      const halfNumTouched = 15
      const solution = await makeOrdersAndCloseAuction(halfNumTouched, seedVolumes)
      await stablecoinConverter.submitSolution(batchIndex, solution.owners, solution.orderIds, solution.volumes, prices, tokenIdsForPrice, { from: solutionSubmitter })

      const seedVolumes2 = [8000, feeSubtracted(8000) * 2]
      const volumes2 = Array(halfNumTouched).fill(seedVolumes2[0]).concat(Array(halfNumTouched).fill(seedVolumes2[1]))
      await stablecoinConverter.submitSolution(batchIndex, solution.owners, solution.orderIds, volumes2, prices, tokenIdsForPrice, { from: solutionSubmitter })

      const seedVolumes3 = [10000, feeSubtracted(10000) * 2]
      const volumes3 = Array(halfNumTouched).fill(seedVolumes3[0]).concat(Array(halfNumTouched).fill(seedVolumes3[1]))
      await stablecoinConverter.submitSolution(batchIndex, solution.owners, solution.orderIds, volumes3, prices, tokenIdsForPrice, { from: solutionSubmitter })
    })
    it("fails with out of gas on competing solution with 40 touched", async () => {
      const halfNumTouched = 20
      const solution = await makeOrdersAndCloseAuction(halfNumTouched, seedVolumes)
      await stablecoinConverter.submitSolution(batchIndex, solution.owners, solution.orderIds, solution.volumes, prices, tokenIdsForPrice, { from: solutionSubmitter })

      const seedVolumes2 = [8000, feeSubtracted(8000) * 2]
      const volumes2 = Array(halfNumTouched).fill(seedVolumes2[0]).concat(Array(halfNumTouched).fill(seedVolumes2[1]))
      await truffleAssert.fails(
        stablecoinConverter.submitSolution(batchIndex, solution.owners, solution.orderIds, volumes2, prices, tokenIdsForPrice, { from: solutionSubmitter }),
        "out of gas"
      )
    })
  })
})

const closeAuction = async (instance) => {
  const time_remaining = (await instance.getSecondsRemainingInBatch()).toNumber()
  await waitForNSeconds(time_remaining + 1)
}
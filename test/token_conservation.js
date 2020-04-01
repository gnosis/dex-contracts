const TokenConservationWrapper = artifacts.require("TokenConservationWrapper")
const truffleAssert = require("truffle-assertions")

contract("TokenConservation", async () => {
  describe("checkTokenConservation()", () => {
    it("checks successfully the token conservation", async () => {
      const tokenConservation = await TokenConservationWrapper.new()

      const testArray = [1, 0, 0]
      await tokenConservation.checkTokenConservationTest(testArray)
    })
    it("throws, if token conservation does not hold", async () => {
      const tokenConservation = await TokenConservationWrapper.new()
      const testArray = [0, 1]
      await truffleAssert.reverts(
        tokenConservation.checkTokenConservationTest(testArray)
        // Error message would be: "Token conservation does not hold", but coverage tool will not recognize
      )
    })
    it("throws, if token conservation does not hold", async () => {
      const tokenConservation = await TokenConservationWrapper.new()
      const testArray = [-1]
      await truffleAssert.reverts(
        tokenConservation.checkTokenConservationTest(testArray),
        "Token conservation at 0 must be positive"
      )
    })
  })
  describe("checkPriceOrdering()", () => {
    it("returns false when unordered", async () => {
      const tokenConservation = await TokenConservationWrapper.new()
      assert.equal(await tokenConservation.checkPriceOrdering([1, 0]), false, "Failed on [1, 0]")
      assert.equal(await tokenConservation.checkPriceOrdering([1, 3, 2]), false, "Failed on [1, 3, 2]")
    })
    it("returns false when not unique", async () => {
      const tokenConservation = await TokenConservationWrapper.new()
      assert.equal(await tokenConservation.checkPriceOrdering([1, 1]), false, "Failed on [1, 1]")
    })
    it("returns true when ordered", async () => {
      const tokenConservation = await TokenConservationWrapper.new()
      assert.equal(await tokenConservation.checkPriceOrdering([0, 1]), true, "Failed on [0, 1]")
      assert.equal(await tokenConservation.checkPriceOrdering([1, 2, 3]), true, "Failed on [1, 2, 3]")
    })
  })
  describe("updateTokenConservation()", () => {
    it("calculates the updated tokenConservation array", async () => {
      const tokenConservation = await TokenConservationWrapper.new()

      const testArray = [0, 0, 0, 0]
      const tokenIdsForPrice = [1, 2, 3]
      const buyToken = 2
      const sellToken = 1
      const buyAmount = 10
      const sellAmount = 3

      const updatedArray = (
        await tokenConservation.updateTokenConservationTest.call(
          testArray,
          buyToken,
          sellToken,
          tokenIdsForPrice,
          buyAmount,
          sellAmount
        )
      ).map((a) => a.toNumber())
      const expectedArray = [0, 3, -10, 0]
      assert.deepEqual(updatedArray, expectedArray)

      const secondUpdatedArray = (
        await tokenConservation.updateTokenConservationTest.call(testArray, 2, 3, tokenIdsForPrice, 1, 2)
      ).map((a) => a.toNumber())
      assert.deepEqual([0, 0, -1, 2], secondUpdatedArray)
    })
    it("throws, if findPriceIndex does not find the token, as it is not supplied", async () => {
      const tokenConservation = await TokenConservationWrapper.new()

      const testArray = [0, 0, 0]

      const tokenIdsForPrice = [0, 1]
      const buyToken = 2
      const sellToken = 1
      const buyAmount = 10
      const sellAmount = 3

      await truffleAssert.reverts(
        tokenConservation.updateTokenConservationTest(testArray, buyToken, sellToken, tokenIdsForPrice, buyAmount, sellAmount)
        // Error message would be: "Price not provided for token", but coverage tool will not recognize
      )
    })
  })
})

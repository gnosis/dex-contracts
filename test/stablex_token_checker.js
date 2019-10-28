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
        //Error message would be: "Token conservation does not hold", but coverage tool will not recognize
      )
    })
  })

  describe("updateTokenConservation()", () => {
    it("calculates the updated tokenConservation array", async () => {
      const tokenConservation = await TokenConservationWrapper.new()

      const testArray = [0, 0, 0]
      const tokenIdsForPrice = [0, 1, 2]
      const buyToken = 2
      const sellToken = 1
      const buyAmount = 10
      const sellAmount = 3

      const updatedArray = (await tokenConservation
        .updateTokenConservationTest.
        call(testArray, buyToken, sellToken, tokenIdsForPrice, buyAmount, sellAmount))
        .map(a => a.toNumber())
      const expectedArray = [0, 3, -10]
      assert.deepEqual(updatedArray, expectedArray)
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
        //Error message would be: "Price not provided for token", but coverage tool will not recognize
      )
    })
  })
})
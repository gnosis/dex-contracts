const SnappAuction = artifacts.require("SnappAuction")
const MintableERC20 = artifacts.require("./ERC20Mintable.sol")

// const truffleAssert = require("truffle-assertions")

const { setupEnvironment } = require("./utilities.js")

contract("SnappBase", async (accounts) => {
  const [token_owner, user_1] = accounts

  describe("placeSellOrder()", () => {
    it.only("Generic sell order", async () => {
      const instance = await SnappAuction.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)
      await instance.placeSellOrder(1, 2, 1, 1, { from: user_1 })
    })
  })
})
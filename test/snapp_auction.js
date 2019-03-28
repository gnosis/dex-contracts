const SnappAuction = artifacts.require("SnappAuction")
const MintableERC20 = artifacts.require("./ERC20Mintable.sol")

const truffleAssert = require("truffle-assertions")

const {
  waitForNBlocks,
  setupEnvironment } = require("./utilities.js")

contract("SnappBase", async (accounts) => {
  const [owner, token_owner, user_1, user_2] = accounts

  describe("placeSellOrder()", () => {
    it("Reject: unregisterd account", async () => {
      const instance = await SnappAuction.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)

      await truffleAssert.reverts(
        instance.placeSellOrder(1, 2, 1, 1, { from: user_2 }),
        "Must have registered account"
      )
    })

    it("Reject: buyToken = sellToken", async () => {
      const instance = await SnappAuction.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)

      await truffleAssert.reverts(
        instance.placeSellOrder(1, 1, 1, 1, { from: user_1 }),
        "Buy and Sell tokens must differ!"
      )
    })

    it("Reject: unregistered buyToken", async () => {
      const instance = await SnappAuction.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)

      await truffleAssert.reverts(
        instance.placeSellOrder(3, 1, 1, 1, { from: user_1 }),
        "Buy token is not registered"
      )
    })

    it("Reject: unregistered sellToken", async () => {
      const instance = await SnappAuction.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)
      await truffleAssert.reverts(
        instance.placeSellOrder(1, 3, 1, 1, { from: user_1 }),
        "Sell token is not registered"
      )
    })

    it("Reject: Buy Amount >= 2^100", async () => {
      const instance = await SnappAuction.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)

      await truffleAssert.reverts(
        instance.placeSellOrder(1, 2, "0x10000000000000000000000000", 1, { from: user_1 }),
        "Buy amount too large!"
      )
    })

    it("Reject: Sell Amount >= 2^100", async () => {
      const instance = await SnappAuction.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)

      await truffleAssert.reverts(
        instance.placeSellOrder(1, 2, 1, "0x10000000000000000000000000", { from: user_1 }),
        "Sell amount too large!"
      )
    })

    it("Reject: Third batch with two unapplied", async () => {
      const instance = await SnappAuction.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)
      await instance.placeSellOrder(1, 2, 1, 1, { from: user_1 })

      await waitForNBlocks(21, owner)
      await instance.placeSellOrder(1, 2, 1, 1, { from: user_1 })

      await waitForNBlocks(21, owner)
      await instance.placeSellOrder(1, 2, 1, 1, { from: user_1 })

      await waitForNBlocks(21, owner)
      await truffleAssert.reverts(
        instance.placeSellOrder(1, 2, 1, 1, { from: user_1 }),
        "Too many pending auctions"
      )
    })

    it("Generic sell order", async () => {
      const instance = await SnappAuction.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)
      await instance.placeSellOrder(1, 2, 1, 1, { from: user_1 })

      const auctionIndex = (await instance.auctionIndex.call()).toNumber()
      const currentAuction = await instance.auctions(auctionIndex)

      assert.equal(currentAuction.size, 1)
      assert.notEqual(currentAuction.shaHash, 0)
    })

    it("Generic sell orders over two batches", async () => {
      const instance = await SnappAuction.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)
      await instance.placeSellOrder(1, 2, 1, 1, { from: user_1 })

      await waitForNBlocks(21, owner)
      await instance.placeSellOrder(1, 2, 1, 1, { from: user_1 })

      const auctionIndex = (await instance.auctionIndex.call()).toNumber()
      assert.equal(auctionIndex, 1)
    })
  })
})
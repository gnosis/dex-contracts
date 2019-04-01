const SnappAuction = artifacts.require("SnappAuction")
const MintableERC20 = artifacts.require("./ERC20Mintable.sol")

const truffleAssert = require("truffle-assertions")

const {
  waitForNBlocks,
  setupEnvironment } = require("./utilities.js")

const {
  isActive,
  stateHash }  = require("./snapp_utils.js")

contract("SnappAuction", async (accounts) => {
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

  describe("applyAuction()", () => {
    it("Only owner", async () => {
      const instance = await SnappAuction.new()

      const slot = (await instance.auctionIndex.call()).toNumber()
      const state_index = (await instance.stateIndex.call()).toNumber()
      const state_root = await instance.stateRoots.call(state_index)
      const auction_state = await instance.auctions.call(slot)

      const new_state = "0x1"

      const MAX_TOKENS = (await instance.MAX_TOKENS.call()).toNumber()
      const prices = Array(MAX_TOKENS).fill(0)

      const AUCTION_BATCH_SIZE = (await instance.AUCTION_BATCH_SIZE.call()).toNumber()
      const volumes = Array(2*AUCTION_BATCH_SIZE).fill(0)

      await truffleAssert.reverts(
        instance.applyAuction(slot, state_root, new_state, auction_state.shaHash, prices, volumes, { from: user_1 })
      )
    })

    it("Reject: active slot", async () => {
      const instance = await SnappAuction.new()

      const slot = (await instance.auctionIndex.call()).toNumber()
      const state_index = (await instance.stateIndex.call()).toNumber()
      const state_root = await instance.stateRoots.call(state_index)
      const auction_state = await instance.auctions.call(slot)

      const new_state = "0x1"

      const MAX_TOKENS = (await instance.MAX_TOKENS.call()).toNumber()
      const prices = Array(MAX_TOKENS).fill(0)

      const AUCTION_BATCH_SIZE = (await instance.AUCTION_BATCH_SIZE.call()).toNumber()
      const volumes = Array(2*AUCTION_BATCH_SIZE).fill(0)

      assert.equal(await isActive(auction_state), true)

      await truffleAssert.reverts(
        instance.applyAuction(slot, state_root, new_state, auction_state.shaHash, prices, volumes),
        "Requested order slot is still active"
      )
    })

    it("Reject: Incorrect state root", async () => {
      const instance = await SnappAuction.new()

      const slot = (await instance.auctionIndex.call()).toNumber()
      const auction_state = await instance.auctions.call(slot)

      const new_state = "0x1"

      const MAX_TOKENS = (await instance.MAX_TOKENS.call()).toNumber()
      const prices = Array(MAX_TOKENS).fill(0)

      const AUCTION_BATCH_SIZE = (await instance.AUCTION_BATCH_SIZE.call()).toNumber()
      const volumes = Array(2*AUCTION_BATCH_SIZE).fill(0)

      // Wait for current order slot to be inactive
      await waitForNBlocks(21, owner)

      // Ensure order slot is inactive
      assert.equal(await isActive(auction_state), false)

      const wrong_state_root = "0x1"
      assert.notEqual(wrong_state_root, await stateHash(instance))

      await truffleAssert.reverts(
        instance.applyAuction(slot, wrong_state_root, new_state, auction_state.shaHash, prices, volumes),
        "Incorrect state root"
      )
    })

    it("Reject: Incorrect order hash", async () => {
      const instance = await SnappAuction.new()

      const slot = (await instance.auctionIndex.call()).toNumber()
      const auction_state = await instance.auctions.call(slot)

      const new_state = "0x1"

      const MAX_TOKENS = (await instance.MAX_TOKENS.call()).toNumber()
      const prices = Array(MAX_TOKENS).fill(0)

      const AUCTION_BATCH_SIZE = (await instance.AUCTION_BATCH_SIZE.call()).toNumber()
      const volumes = Array(2*AUCTION_BATCH_SIZE).fill(0)

      // Wait for current order slot to be inactive
      await waitForNBlocks(21, owner)

      // Ensure order slot is inactive
      assert.equal(await isActive(auction_state), false)

      const state_root = await stateHash(instance)
      const wrong_order_hash = "0x1"

      assert.notEqual(wrong_order_hash, auction_state.shaHash)

      await truffleAssert.reverts(
        instance.applyAuction(slot, state_root, new_state, wrong_order_hash, prices, volumes),
        "Order hash doesn't agree"
      )
    })

    it("Reject: out-of-range slot", async () => {
      const instance = await SnappAuction.new()

      const slot = (await instance.auctionIndex.call()).toNumber()
      const auction_state = await instance.auctions.call(slot)

      const new_state = "0x1"

      const MAX_TOKENS = (await instance.MAX_TOKENS.call()).toNumber()
      const prices = Array(MAX_TOKENS).fill(0)

      const AUCTION_BATCH_SIZE = (await instance.AUCTION_BATCH_SIZE.call()).toNumber()
      const volumes = Array(2*AUCTION_BATCH_SIZE).fill(0)

      // Wait for current order slot to be inactive
      await waitForNBlocks(21, owner)

      // Ensure order slot is inactive
      assert.equal(await isActive(auction_state), false)


      const state_root = await stateHash(instance)

      const curr_slot = (await instance.auctionIndex.call()).toNumber()

      await truffleAssert.reverts(
        instance.applyAuction(curr_slot + 1, state_root, new_state, auction_state.shaHash, prices, volumes),
        "Requested order slot does not exist"
      )
    })


    it("Successfully apply auction", async () => {
      const instance = await SnappAuction.new()

      const slot = (await instance.auctionIndex.call()).toNumber()
      const auction_state = await instance.auctions.call(slot)

      const new_state = "0x1"

      const MAX_TOKENS = (await instance.MAX_TOKENS.call()).toNumber()
      const prices = Array(MAX_TOKENS).fill(0)

      const AUCTION_BATCH_SIZE = (await instance.AUCTION_BATCH_SIZE.call()).toNumber()
      const volumes = Array(2*AUCTION_BATCH_SIZE).fill(0)

      // Wait for current order slot to be inactive
      await waitForNBlocks(21, owner)

      // Ensure order slot is inactive
      assert.equal(await isActive(auction_state), false)

      const state_root = await stateHash(instance)
      
      await instance.applyAuction(slot, state_root, new_state, auction_state.shaHash, prices, volumes)

      const state_index = (await instance.stateIndex.call()).toNumber()
      const applied_index = ((await instance.auctions(slot)).appliedAccountStateIndex).toNumber()

      assert.equal(applied_index, state_index)
    })

    it("Reject: apply same slot twice", async () => {
      const instance = await SnappAuction.new()

      const slot = (await instance.auctionIndex.call()).toNumber()
      const auction_state = await instance.auctions.call(slot)

      const new_state = "0x1"

      const MAX_TOKENS = (await instance.MAX_TOKENS.call()).toNumber()
      const prices = Array(MAX_TOKENS).fill(0)

      const AUCTION_BATCH_SIZE = (await instance.AUCTION_BATCH_SIZE.call()).toNumber()
      const volumes = Array(2*AUCTION_BATCH_SIZE).fill(0)

      // Wait for current order slot to be inactive
      await waitForNBlocks(21, owner)

      // Ensure order slot is inactive
      assert.equal(await isActive(auction_state), false)

      const state_root = await stateHash(instance)

      // Apply auction once
      await instance.applyAuction(slot, state_root, new_state, auction_state.shaHash, prices, volumes)
      
      // Try to apply same slot again
      await truffleAssert.reverts(
        instance.applyAuction(slot, state_root, new_state, auction_state.shaHash, prices, volumes),
        "Auction already applied"
      )
    })

    it("Must apply slots sequentially", async () => {
      const instance = await SnappAuction.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)

      const first_slot = (await instance.auctionIndex.call()).toNumber()
      const first_auction_state = await instance.auctions.call(first_slot)

      const new_state = "0x1"

      const MAX_TOKENS = (await instance.MAX_TOKENS.call()).toNumber()
      const prices = Array(MAX_TOKENS).fill(0)

      const AUCTION_BATCH_SIZE = (await instance.AUCTION_BATCH_SIZE.call()).toNumber()
      const volumes = Array(2*AUCTION_BATCH_SIZE).fill(0)

      // Wait for current order slot to be inactive
      await waitForNBlocks(21, owner)

      // Place an order to ensure second order slot is created.
      const order_tx = await instance.placeSellOrder(1, 2, 1, 1, { from: user_1 })
      const second_slot = order_tx.logs[0].args.auctionId.toNumber()
      const second_auction_state = await instance.auctions(second_slot)

      // Wait for second order slot to be inactive
      await waitForNBlocks(21, owner)

      const state_root = await stateHash(instance)

      await truffleAssert.reverts(
        instance.applyAuction(second_slot, state_root, new_state, second_auction_state.shaHash, prices, volumes),
        "Must apply auction slots in order!"
      )

      await instance.applyAuction(first_slot, state_root, new_state, first_auction_state.shaHash, prices, volumes)
      await instance.applyAuction(second_slot, new_state, "0x2", second_auction_state.shaHash, prices, volumes)
    })

  })
})
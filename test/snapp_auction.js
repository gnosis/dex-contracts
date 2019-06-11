const SnappAuction = artifacts.require("SnappAuction")
const MintableERC20 = artifacts.require("./ERC20Mintable.sol")

const truffleAssert = require("truffle-assertions")

const {
  waitForNSeconds,
  setupEnvironment } = require("./utilities.js")

const {
  isActive,
  stateHash,
  encodeOrder }  = require("./snapp_utils.js")

contract("SnappAuction", async (accounts) => {
  const [token_owner, user_1, user_2] = accounts

  describe("public view functions", () => {
    it("hasAuctionBeenApplied(slot) == false", async () => {
      const instance = await SnappAuction.new()
      assert.equal(await instance.hasAuctionBeenApplied.call(0), false)
    })
  
    it("getAuctionCreationTimestamp(slot)", async () => {
      const instance = await SnappAuction.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)
      const order = encodeOrder(0, 1, 1, 1)
      const tx = await instance.placeSellOrders(order, { from: user_1 })
      
      const timestamp = (await web3.eth.getBlock(tx.receipt.blockNumber)).timestamp
      assert.equal((await instance.getAuctionCreationTimestamp.call(0)).toNumber(), timestamp)
    })
  
    it("getOrderHash(slot)", async () => {
      const instance = await SnappAuction.new()
      assert.equal(await instance.getOrderHash.call(0), 0x0)
    })

    it("maxUnreservedOrderCount", async () => {
      const instance = await SnappAuction.new()
      const AUCTION_BATCH_SIZE = await instance.AUCTION_BATCH_SIZE()
      const AUCTION_RESERVED_ACCOUNTS = await instance.AUCTION_RESERVED_ACCOUNTS()
      const AUCTION_RESERVED_ACCOUNT_BATCH_SIZE = await instance.AUCTION_RESERVED_ACCOUNT_BATCH_SIZE()

      assert.equal(
        await instance.maxUnreservedOrderCount.call(), 
        AUCTION_BATCH_SIZE - (AUCTION_RESERVED_ACCOUNTS * AUCTION_RESERVED_ACCOUNT_BATCH_SIZE)
      )
    })
    
  })

  describe("placeSellOrder()", () => {
    it("Reject: unregisterd account", async () => {
      const instance = await SnappAuction.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)

      await truffleAssert.reverts(
        instance.placeSellOrder(0, 1, 1, 1, { from: user_2 }),
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

    it("Reject: Third batch with two unapplied", async () => {
      const instance = await SnappAuction.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)
      await instance.placeSellOrder(0, 1, 1, 1, { from: user_1 })

      await waitForNSeconds(181)
      await instance.placeSellOrder(0, 1, 1, 1, { from: user_1 })

      await waitForNSeconds(181)
      await instance.placeSellOrder(0, 1, 1, 1, { from: user_1 })

      await waitForNSeconds(181)
      await truffleAssert.reverts(
        instance.placeSellOrder(0, 1, 1, 1, { from: user_1 }),
        "Too many pending auctions"
      )
    })

    it("Generic sell order", async () => {
      const instance = await SnappAuction.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)
      await instance.placeSellOrder(0, 1, 1, 1, { from: user_1 })

      const auctionIndex = (await instance.auctionIndex.call()).toNumber()
      const currentAuction = await instance.auctions(auctionIndex)

      assert.equal(currentAuction.size, 1)
      assert.notEqual(currentAuction.shaHash, 0)
    })

    it("Generic sell orders over two batches", async () => {
      const instance = await SnappAuction.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)
      await instance.placeSellOrder(0, 1, 1, 1, { from: user_1 })

      await waitForNSeconds(181)
      await instance.placeSellOrder(0, 1, 1, 1, { from: user_1 })

      const auctionIndex = (await instance.auctionIndex.call()).toNumber()
      assert.equal(auctionIndex, 1)
    })
  })

  describe("placeStandingSellOrder()", () => {
    it("Reject: unregisterd account", async () => {
      const instance = await SnappAuction.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)

      await truffleAssert.reverts(
        instance.placeStandingSellOrder([0], [1], [1], [1], { from: user_2 }),
        "Must have registered account"
      )
    })

    it("Reject: unregistered buyToken", async () => {
      const instance = await SnappAuction.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)

      await truffleAssert.reverts(
        instance.placeStandingSellOrder([3], [1], [1], [1], { from: user_1 }),
        "Buy token is not registered"
      )
    })

    it("Reject: unregistered sellToken", async () => {
      const instance = await SnappAuction.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)
      await truffleAssert.reverts(
        instance.placeStandingSellOrder([1], [3], [1], [1], { from: user_1 }),
        "Sell token is not registered"
      )
    })

    it("Reject: Buy Amount >= 2^100", async () => {
      const instance = await SnappAuction.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)

      await truffleAssert.reverts(
        instance.placeStandingSellOrder([0], [1], ["0x10000000000000000000000000"], [1], { from: user_1 }),
        "Buy amount too large!"
      )
    })

    it("Reject: Sell Amount >= 2^100", async () => {
      const instance = await SnappAuction.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)

      await truffleAssert.reverts(
        instance.placeStandingSellOrder([0], [1], [1], ["0x10000000000000000000000000"], { from: user_1 }),
        "Sell amount too large!"
      )
    })

    it("Reject: More than AUCTION_RESERVED_ACCOUNT_BATCH_SIZE=10 orders", async () => {
      const instance = await SnappAuction.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)
      const AUCTION_RESERVED_ACCOUNT_BATCH_SIZE = await instance.AUCTION_RESERVED_ACCOUNT_BATCH_SIZE()
      const buyToken_list = new Array(AUCTION_RESERVED_ACCOUNT_BATCH_SIZE.toNumber() +1)
      buyToken_list.fill(1)
      await truffleAssert.reverts(
        instance.placeStandingSellOrder(buyToken_list, [1], [1], ["0x10000000000000000000000000"], { from: user_1 }),
        "Too many orders for reserved batch"
      )
    })

    it("Generic standing sell order as replacement of current batch (1 TX)", async () => {
      const instance = await SnappAuction.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)

      await instance.placeStandingSellOrder([0,0], [0,1], [3,1], [3,1], { from: user_1 })

      const userId = await instance.publicKeyToAccountMap.call(user_1)
      const pointer = await instance.getStandingOrderCounter.call(userId)
      assert.equal(pointer, 0)
      const validFromIndex = await instance.getStandingOrderValidFrom(userId, pointer)
      assert.equal(validFromIndex, 0)
    })

    it("Generic standing sell order as replacement of current batch(2 TX)", async () => {
      const instance = await SnappAuction.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)

      await instance.placeStandingSellOrder([0,0], [0,1], [3,1], [3,1], { from: user_1 })
      
      await instance.placeStandingSellOrder([0,0], [0,1], [3,1], [3,0], { from: user_1 })

      const userId = await instance.publicKeyToAccountMap.call(user_1)
      const pointer = await instance.getStandingOrderCounter.call(userId)
      assert.equal(pointer, 0)

      const validFromIndex = await instance.getStandingOrderValidFrom(userId, pointer)
      assert.equal(validFromIndex, 0)

      const validToAuctionIndex = await instance.getStandingOrderValidFrom(userId, pointer - 1)
      assert.equal(validToAuctionIndex, 0)
    })
    
    it("Generic standing sell order as new submission ", async () => {
      const instance = await SnappAuction.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)

      await instance.placeStandingSellOrder([0,0], [0,1], [3,1], [3,1], { from: user_1 })
      
      // Wait for current order slot to be inactive
      await waitForNSeconds(181)

      await instance.placeStandingSellOrder([0,0], [0,1], [3,1], [3,0], { from: user_1 })

      const userId = await instance.publicKeyToAccountMap.call(user_1)
      const pointer = await instance.getStandingOrderCounter.call(userId)
      assert.equal(pointer, 1)

      const validFromIndex = await instance.getStandingOrderValidFrom(userId, pointer)
      assert.equal(validFromIndex, 1)

      const validToAuctionIndex = await instance.getStandingOrderValidTo(userId, pointer - 1)
      assert.equal(validToAuctionIndex, 0)
    })
  })

  describe("applyAuction()", () => {
    const new_state = "0x1"

    const prices = "0x" + "".padEnd(16*30 *2, "0") // represents 30 uint128 (token prices)
    const volumes = "0x" + "".padEnd(32*1000*2, "0") // represents 1000 * 2 uint128 (numerator, denominator)
    const auctionSolution = prices + volumes.slice(2)

    it("Cannot apply auction before first order", async () => {
      const instance = await SnappAuction.new()
      const curr_slot = await instance.auctionIndex.call()
  
      await truffleAssert.reverts(
        instance.applyAuction(curr_slot, "0x0", "0x0", "0x0", "0x0"),
        "Requested order slot does not exist"
      )
    })

    it("Only owner", async () => {
      const instance = await SnappAuction.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)
      const order = encodeOrder(0, 1, 1, 1)
      await instance.placeSellOrders(order, { from: user_1 })

      const slot = (await instance.auctionIndex.call()).toNumber()
      const state_index = (await instance.stateIndex.call()).toNumber()
      const state_root = await instance.stateRoots.call(state_index)
      const auction_state = await instance.auctions.call(slot)

      await truffleAssert.reverts(
        instance.applyAuction(slot, state_root, new_state, auction_state.shaHash, auctionSolution, { from: user_1 })
      )
    })

    it("Reject: active slot", async () => {
      const instance = await SnappAuction.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)
      const order = encodeOrder(0, 1, 1, 1)
      await instance.placeSellOrders(order, { from: user_1 })

      const slot = (await instance.auctionIndex.call()).toNumber()
      const state_index = (await instance.stateIndex.call()).toNumber()
      const state_root = await instance.stateRoots.call(state_index)
      const auction_state = await instance.auctions.call(slot)

      assert.equal(await isActive(auction_state), true)

      await truffleAssert.reverts(
        instance.applyAuction(slot, state_root, new_state, auction_state.shaHash, auctionSolution),
        "Requested order slot is still active"
      )
    })

    it("Reject: Incorrect state root", async () => {
      const instance = await SnappAuction.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)
      const order = encodeOrder(0, 1, 1, 1)
      await instance.placeSellOrders(order, { from: user_1 })

      const slot = (await instance.auctionIndex.call()).toNumber()
      const auction_state = await instance.auctions.call(slot)

      // Wait for current order slot to be inactive
      await waitForNSeconds(181)

      // Ensure order slot is inactive
      assert.equal(await isActive(auction_state), false)

      const wrong_state_root = "0x1"
      assert.notEqual(wrong_state_root, await stateHash(instance))

      await truffleAssert.reverts(
        instance.applyAuction(slot, wrong_state_root, new_state, auction_state.shaHash, auctionSolution),
        "Incorrect state root"
      )
    })

    it("Reject: Incorrect order hash", async () => {
      const instance = await SnappAuction.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)
      const order = encodeOrder(0, 1, 1, 1)
      await instance.placeSellOrders(order, { from: user_1 })

      const slot = (await instance.auctionIndex.call()).toNumber()
      const auction_state = await instance.auctions.call(slot)

      // Wait for current order slot to be inactive
      await waitForNSeconds(181)

      // Ensure order slot is inactive
      assert.equal(await isActive(auction_state), false)

      const state_root = await stateHash(instance)
      const wrong_order_hash = "0x1"

      assert.notEqual(wrong_order_hash, auction_state.shaHash)

      await truffleAssert.reverts(
        instance.applyAuction(slot, state_root, new_state, wrong_order_hash, auctionSolution),
        "Order hash doesn't agree"
      )
    })

    it("Reject: out-of-range slot", async () => {
      const instance = await SnappAuction.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)
      const order = encodeOrder(0, 1, 1, 1)
      await instance.placeSellOrders(order, { from: user_1 })

      const slot = (await instance.auctionIndex.call()).toNumber()
      const auction_state = await instance.auctions.call(slot)

      // Wait for current order slot to be inactive
      await waitForNSeconds(181)

      // Ensure order slot is inactive
      assert.equal(await isActive(auction_state), false)

      const state_root = await stateHash(instance)
      const curr_slot = (await instance.auctionIndex.call()).toNumber()

      await truffleAssert.reverts(
        instance.applyAuction(curr_slot + 1, state_root, new_state, auction_state.shaHash, auctionSolution),
        "Requested order slot does not exist"
      )
    })

    it("Successfully apply auction", async () => {
      const instance = await SnappAuction.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)
      const order = encodeOrder(0, 1, 1, 1)
      await instance.placeSellOrders(order, { from: user_1 })

      const slot = (await instance.auctionIndex.call()).toNumber()
      const auction_state = await instance.auctions.call(slot)

      // Wait for current order slot to be inactive
      await waitForNSeconds(181)

      // Ensure order slot is inactive
      assert.equal(await isActive(auction_state), false)

      const state_root = await stateHash(instance)
      
      await instance.applyAuction(slot, state_root, new_state, auction_state.shaHash, auctionSolution)

      const state_index = (await instance.stateIndex.call()).toNumber()
      const applied_index = ((await instance.auctions(slot)).appliedAccountStateIndex).toNumber()

      assert.equal(applied_index, state_index)
    })

    it("Reject: apply same slot twice", async () => {
      const instance = await SnappAuction.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)
      const order = encodeOrder(0, 1, 1, 1)
      await instance.placeSellOrders(order, { from: user_1 })

      const slot = (await instance.auctionIndex.call()).toNumber()
      const auction_state = await instance.auctions.call(slot)

      // Wait for current order slot to be inactive
      await waitForNSeconds(181)

      // Ensure order slot is inactive
      assert.equal(await isActive(auction_state), false)

      const state_root = await stateHash(instance)

      // Apply auction once
      await instance.applyAuction(slot, state_root, new_state, auction_state.shaHash, auctionSolution)
      
      // Try to apply same slot again
      await truffleAssert.reverts(
        instance.applyAuction(slot, state_root, new_state, auction_state.shaHash, auctionSolution),
        "Auction already applied"
      )
    })

    it("Must apply slots sequentially", async () => {
      const instance = await SnappAuction.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)
      const order = encodeOrder(0, 1, 1, 1)
      await instance.placeSellOrders(order, { from: user_1 })

      const first_slot = (await instance.auctionIndex.call()).toNumber()
      const first_auction_state = await instance.auctions.call(first_slot)

      // Wait for current order slot to be inactive
      await waitForNSeconds(181)

      // Place an order to ensure second order slot is created.
      const order_tx = await instance.placeSellOrders(order, { from: user_1 })
      const second_slot = order_tx.logs[0].args.auctionId.toNumber()
      const second_auction_state = await instance.auctions(second_slot)

      // Wait for second order slot to be inactive
      await waitForNSeconds(181)

      const state_root = await stateHash(instance)

      await truffleAssert.reverts(
        instance.applyAuction(second_slot, state_root, new_state, second_auction_state.shaHash, auctionSolution),
        "Must apply auction slots in order!"
      )

      await instance.applyAuction(first_slot, state_root, new_state, first_auction_state.shaHash, auctionSolution)
      await instance.applyAuction(second_slot, new_state, "0x2", second_auction_state.shaHash, auctionSolution)
    })
  })

  describe("placeSellOrders()", () => {
    it("Reject: unregisterd account", async () => {
      const instance = await SnappAuction.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)
      const order = encodeOrder(0, 1, 1, 1)
      await truffleAssert.reverts(
        instance.placeSellOrders(order, { from: user_2 }),
        "Must have registered account"
      )
    })

    it("Reject: unregistered buyToken", async () => {
      const instance = await SnappAuction.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)
      const order = encodeOrder(2, 1, 1, 1)
      await truffleAssert.reverts(
        instance.placeSellOrders(order, { from: user_1 }),
        "Buy token is not registered"
      )
    })

    it("Reject: unregistered sellToken", async () => {
      const instance = await SnappAuction.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)
      const order = encodeOrder(1, 2, 1, 1)
      await truffleAssert.reverts(
        instance.placeSellOrders(order, { from: user_1 }),
        "Sell token is not registered"
      )
    })

    it("Reject: Third batch with two unapplied", async () => {
      const instance = await SnappAuction.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)
      const order = encodeOrder(0, 1, 1, 1)
      await instance.placeSellOrders(order, { from: user_1 })

      await waitForNSeconds(181)
      await instance.placeSellOrders(order, { from: user_1 })

      await waitForNSeconds(181)
      await instance.placeSellOrders(order, { from: user_1 })

      await waitForNSeconds(181)
      await truffleAssert.reverts(
        instance.placeSellOrders(order, { from: user_1 }),
        "Too many pending auctions"
      )
    })

    it("Generic sell order", async () => {
      const instance = await SnappAuction.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)
      const order = encodeOrder(0, 1, 1, 1)
      await instance.placeSellOrders(order, { from: user_1 })

      const auctionIndex = (await instance.auctionIndex.call()).toNumber()
      const currentAuction = await instance.auctions(auctionIndex)

      assert.equal(currentAuction.size, 1)
      assert.notEqual(currentAuction.shaHash, 0)
    })

    it("Generic sell orders over two batches", async () => {
      const instance = await SnappAuction.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)
      const order = encodeOrder(0, 1, 1, 1)
      await instance.placeSellOrders(order, { from: user_1 })

      await waitForNSeconds(181)
      await instance.placeSellOrders(order, { from: user_1 })

      const auctionIndex = (await instance.auctionIndex.call()).toNumber()
      assert.equal(auctionIndex, 1)
    })

    it("Generic Multi order (2)", async () => {
      const instance = await SnappAuction.new()
      await setupEnvironment(MintableERC20, instance, token_owner, [user_1], 2)
      const order1 = encodeOrder(0, 1, 3, 4)
      const order2 = encodeOrder(1, 0, 1,   123456789)
      const twoOrders = Buffer.concat([order1, order2])
      await instance.placeSellOrders(twoOrders, { from: user_1 })

      const auctionIndex = (await instance.auctionIndex.call()).toNumber()
      const currentAuction = await instance.auctions(auctionIndex)

      assert.equal(currentAuction.size, 2)
    })
  })
})
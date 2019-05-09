const SnappAuctionChallenge = artifacts.require("SnappAuctionChallenge")

contract("SnappAuctionChallenge", () => {

  const MAX_FLOAT = new web3.utils.BN("1342177270000000000000000000000000000000")
  const MAX_PRICE_AND_VOLUME_DATA = "0x" + "aabbcc00".repeat(32) + "eeff112233445566".repeat(1000)
  const MAX_ORDER_DATA = "0x" + "00112233445566778899aabbccddeeff".repeat(1000)
  const MAX_MERKLE_PATHS = "0x" + "aa".repeat(32 * 5 * (24 + 6 + 6))
  const MAX_STATE_ROOTS = "0x" + "ff".repeat(32 * 200)

  const gas = (tx) => { return (tx.receipt.gasUsed / 1e6).toFixed(2) + "M" }
  const floatToInt = (float) => { return Math.floor(float / (2**5)) * 10 ** (float & ((2**5) - 1))}

  describe.only("Gas Usage", () => {
    it("challengePriceNonUniform", async () => {
      const instance = await SnappAuctionChallenge.new()
      const tx = await instance.challengePriceNonUniform(MAX_PRICE_AND_VOLUME_DATA, MAX_ORDER_DATA, 0)
      console.log(`challengePriceNonUniform used ${gas(tx)} gas`)  // eslint-disable-line no-console
    })

    it("challengeLimitPrice", async () => {
      const instance = await SnappAuctionChallenge.new()
      const tx = await instance.challengeLimitPrice(MAX_PRICE_AND_VOLUME_DATA, MAX_ORDER_DATA, 0)
      console.log(`challengeLimitPrice used ${gas(tx)} gas`)  // eslint-disable-line no-console
    })

    it("challengeSurplus", async () => {
      const instance = await SnappAuctionChallenge.new()
      const tx1 = await instance.challengeSurplus(MAX_PRICE_AND_VOLUME_DATA, MAX_ORDER_DATA)
      
      const tx2 = await instance.challengeSurplus(MAX_PRICE_AND_VOLUME_DATA, MAX_ORDER_DATA)
      console.log(`challengeSurplus used ${gas(tx1)} and ${gas(tx2)} gas`)  // eslint-disable-line no-console
    })

    it("challengeStateTransition", async () => {
      const instance = await SnappAuctionChallenge.new()
      const tx = await instance.challengeStateTransition(MAX_PRICE_AND_VOLUME_DATA, MAX_ORDER_DATA, MAX_STATE_ROOTS, MAX_MERKLE_PATHS, 0)
      console.log(`challengeStateTransition used ${gas(tx)} gas`)  // eslint-disable-line no-console
    })

    it("challengeOrderHash", async () => {
      const instance = await SnappAuctionChallenge.new()

      const MAX_OPEN_ORDER_DATA = "0x" + "00112233445566778899aabbccddeeff".repeat(500)
      const MAX_OPEN_CANCELLATION_DATA = "0x" + "1122334455".repeat(500)

      const tx = await instance.challengeOrderHash(MAX_OPEN_ORDER_DATA, MAX_OPEN_CANCELLATION_DATA)
      console.log(`challengeOrderHash used ${gas(tx)} gas`)  // eslint-disable-line no-console
    })
  })

  describe("floatToUint", () => {
    it("converts 32 bit floats into uints", async () => {
      const instance = await SnappAuctionChallenge.new()
      assert.equal(await instance.floatToUint(0), 0) // mantissa 0, exp 0
      assert.equal(await instance.floatToUint(1), 0) // mantissa 0, exp 1
      assert((await instance.floatToUint("0xffffffff")).eq(MAX_FLOAT)) // mantissa 2**27 - 1, exp 2**5 - 1
    })
  })

  describe("getPrice", () => {
    it("extracts correct price", async () =>  {
      const instance = await SnappAuctionChallenge.new()
      const first = await instance.getPrice(MAX_PRICE_AND_VOLUME_DATA, 0)
      assert.equal(first.toString(), floatToInt(parseInt("0xaabbcc00")))

      const last = await instance.getPrice(MAX_PRICE_AND_VOLUME_DATA, 31)
      assert.equal(last.toString(), floatToInt(parseInt("0xaabbcc00")))
    })
  })

  describe("getVolumes", () => {
    it("extracts correct volume", async () =>  {
      const instance = await SnappAuctionChallenge.new()

      const first = await instance.getVolumes(MAX_PRICE_AND_VOLUME_DATA, 0)
      assert.equal(first[0], floatToInt(parseInt("0xeeff1122")))
      assert.equal(first[1], floatToInt(parseInt("0x33445566")))

      const last = await instance.getVolumes(MAX_PRICE_AND_VOLUME_DATA, 999)
      assert.equal(last[0], floatToInt(parseInt("0xeeff1122")))
      assert.equal(last[1], floatToInt(parseInt("0x33445566")))
    })
  })

  describe("getOrder", () => {
    it("extracts correct order", async () =>  {
      const instance = await SnappAuctionChallenge.new()

      const first = await instance.getOrder(MAX_ORDER_DATA, 0)
      assert.equal(first.account, parseInt("0x001122"))
      assert.equal(first.buyToken, parseInt("0x33"))
      assert.equal(first.sellToken, parseInt("0x44"))
      assert.equal(first.buyAmount, parseInt("0x55667788"))
      assert.equal(first.sellAmount, parseInt("0x99aabbcc"))
      assert.equal(first.rolloverCount, parseInt("0xddeeff"))

      const last = await instance.getOrder(MAX_ORDER_DATA, 999)
      assert.equal(last.account, parseInt("0x001122"))
      assert.equal(last.buyToken, parseInt("0x33"))
      assert.equal(last.sellToken, parseInt("0x44"))
      assert.equal(last.buyAmount, parseInt("0x55667788"))
      assert.equal(last.sellAmount, parseInt("0x99aabbcc"))
      assert.equal(last.rolloverCount, parseInt("0xddeeff"))
    })
  })

  describe("getBuyBalanceAndProof", () => {
    it("extracts the correct buy balance and proof", async () =>  {
      const instance = await SnappAuctionChallenge.new()

      const result = await instance.getBuyBalanceAndProof(MAX_MERKLE_PATHS, 0)
      assert.equal(result.leaf.toJSON(), "aa".repeat(32))
      assert.equal(result.proof, "0x" + "aa".repeat(32 * 29))
    })
  })
})
const SnappAuctionChallenge = artifacts.require("SnappAuctionChallenge")

contract.only("SnappAuctionChallenge", () => {
  const gas = (tx) => { return (tx.receipt.gasUsed / 1e6).toFixed(2) + "M" }

  describe("Gas Usage", () => {
    it("proveSpecificPriceNonUniform", async () => {
      const instance = await SnappAuctionChallenge.new()
      const pricesAndVolumes = "0x" + "ff".repeat(4 * 2032)
      const orders = "0x" + "ff".repeat(32 * 1000)
      const tx = await instance.proveSpecificPriceNonUniform(pricesAndVolumes, orders, 0)
      console.log(`proveSpecificPriceNonUniform used ${gas(tx)} gas`)  // eslint-disable-line no-console
    })
  })
})
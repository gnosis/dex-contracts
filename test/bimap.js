const BiMapWrapper = artifacts.require("BiMapWrapper")

const truffleAssert = require("truffle-assertions")

contract("BiMap", async (accounts) => {

  describe("All BiMap Functions", () => {
    
    it("bijectivity properties", async () => {
      const map = await BiMapWrapper.new()

      // 0 and accounts[0] not assigned.
      assert.equal(false, await map.hasId(0))
      assert.equal(false, await map.hasAddress(accounts[0]))

      // register account[0] at slot 0
      await map.insert(0, accounts[0])

      // 0 and accounts[0] are both assigned.
      assert.equal(true, await map.hasId(0))
      assert.equal(true, await map.hasAddress(accounts[0]))

      // 0 <--> accounts[0] 
      assert.equal(accounts[0], await map.getAddressAt(0))
      assert.equal(0, (await map.getId(accounts[0])).toNumber())

      // ID-1 and account[1] not registered.
      await truffleAssert.reverts(map.getId(accounts[1]))
      await truffleAssert.reverts(map.getAddressAt(1))

      // Don't allow insert if either id or address is already part of the map.
      assert.equal(false, await map.insert.call(1, accounts[0]))
      assert.equal(false, await map.insert.call(0, accounts[1]))
    })
  })
})
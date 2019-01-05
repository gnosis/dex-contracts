const BatchAuction = artifacts.require("BatchAuction")

const { 
  assertRejects
 } = require("./utilities.js")

contract("BatchAuction", async (accounts) => {
  const [owner, user_1, user_2] = accounts

  it.only("Open Account at index 0", async () => {
    let instance = await BatchAuction.new()
    // Every account has a default value of 0
    account_index = (await instance.publicKeyToAccountMap.call(owner)).toNumber()
    assert.equal(account_index, 0)
    
    // Open Account
    await instance.openAccount(1)
    
    account_index = (await instance.publicKeyToAccountMap.call(owner)).toNumber()
    assert.equal(account_index, 1)
    
    account_owner = await instance.accountToPublicKeyMap.call(1)
    assert.equal(account_owner, owner)
    
    // Can't open a second account at same index
    // assertRejects(await instance.openAccount(1, { from: user_1}))
    // console.log(res)
  })

  it("Open Account at index 1", async () => {
    let instance = await BatchAuction.new()
    instance.openAccount(1)
    const account_index = (await instance.publicKeyToAccountMap.call(owner)).toNumber()
    assert.equal(account_index, 1)
    
  })


})
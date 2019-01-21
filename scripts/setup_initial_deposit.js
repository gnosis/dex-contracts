const SnappBase = artifacts.require("SnappBase")
const ERC20Mintable = artifacts.require("ERC20Mintable")


module.exports = async function() {
  const me = (await web3.eth.getAccounts())[0]
  const instance = await SnappBase.deployed()
  await instance.openAccount(1)
  const token = await ERC20Mintable.new()
  await instance.addToken(token.address)
  await token.mint(me, 10)
  await token.approve(instance.address, 10)
  await instance.deposit(1, 1)
  console.log("new depositHash is:", await instance.depositHashes(0))
}
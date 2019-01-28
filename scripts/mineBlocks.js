module.exports = async () => {
  const [times] = await process.argv.slice(4)

  const mineOneBlock = async (id) => web3.currentProvider.send({
    jsonrpc: "2.0",
    method: "evm_mine",
    params: [],
    id,
  }, (err, res) => !err ? console.log(res) : err )

  for (let i = 0; i < times; ++i) {
    await mineOneBlock(i)
  }
  console.log("mined", times, "blocks")
}

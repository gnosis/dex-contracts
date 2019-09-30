const fs = require("fs")
const path = require("path")
const _ = require("lodash")

const dir = path.join("build", "contracts")
const dirFiles = fs.readdirSync(dir)
// eslint-disable-next-line no-undef
const networkFile = process.env.NETWORKS_FILE || "networks.json"

Promise.all(dirFiles.filter(fname => fname.endsWith(".json")).map(fname => new Promise((resolve) => {
  fs.readFile(path.join(dir, fname), (err, data) => {
    if (err) throw err
    resolve([fname.slice(0, -5), JSON.parse(data)["networks"]])
  })
}))).then(nameNetworkPairs => {
  // eslint-disable-next-line no-unused-vars
  fs.writeFileSync(networkFile, JSON.stringify(_.fromPairs(nameNetworkPairs.filter(([_name, nets]) => !_.isEmpty(nets))), null, 2))
})
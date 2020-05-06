import { assert } from "chai"
import "mocha"
import Web3 from "web3"
import { StreamedOrderbook } from "../../../src/streamed"

describe("Streamed Orderbook", () => {
  describe("init", () => {
    it("should successfully apply all events and match on-chain orderbook", async function () {
      const { ETHEREUM_NODE_URL, INFURA_PROJECT_ID, ORDERBOOK_END_BLOCK, TEST_STREAMED_ORDERBOOK_E2E } = process.env
      if (!TEST_STREAMED_ORDERBOOK_E2E) {
        this.skip()
        return
      }

      assert.isDefined(
        ETHEREUM_NODE_URL || INFURA_PROJECT_ID,
        "ETHEREUM_NODE_URL or INFURA_PROJECT_ID environment variable is required"
      )
      const url = ETHEREUM_NODE_URL || `https://mainnet.infura.io/v3/${INFURA_PROJECT_ID}`
      const web3 = new Web3(url)

      await StreamedOrderbook.init(web3, {
        endBlock: ORDERBOOK_END_BLOCK ? parseInt(ORDERBOOK_END_BLOCK) : undefined,
        strict: true,
        logger: console,
      })
    }).timeout(0)
  })
})

const { BN, constants } = require("openzeppelin-test-helpers")
const { MAX_INT256, MIN_INT256 } = constants

const SignedSafeMathMock = artifacts.require("SignedSafeMathMock")
const truffleAssert = require("truffle-assertions")

contract("SignedSafeMath", function () {
  beforeEach(async function () {
    this.safeMath = await SignedSafeMathMock.new()
  })

  async function testCommutative(fn, lhs, rhs, expected) {
    assert.equal((await fn(lhs, rhs)).toString(), expected.toString())
    assert.equal((await fn(rhs, lhs)).toString(), expected.toString())
  }

  async function testFailsCommutative(fn, lhs, rhs, reason) {
    await truffleAssert.reverts(fn(lhs, rhs), reason)
    await truffleAssert.reverts(fn(rhs, lhs), reason)
  }

  describe("add", function () {
    it("adds correctly if it does not overflow and the result is positive", async function () {
      const a = new BN("1234")
      const b = new BN("5678")

      await testCommutative(this.safeMath.add, a, b, a.add(b))
    })

    it("adds correctly if it does not overflow and the result is negative", async function () {
      const a = MAX_INT256
      const b = MIN_INT256

      await testCommutative(this.safeMath.add, a, b, a.add(b))
    })

    it("reverts on positive addition overflow", async function () {
      const a = MAX_INT256
      const b = new BN("1")

      await testFailsCommutative(this.safeMath.add, a, b, "SignedSafeMath: addition overflow")
    })

    it("reverts on negative addition overflow", async function () {
      const a = MIN_INT256
      const b = new BN("-1")

      await testFailsCommutative(this.safeMath.add, a, b, "SignedSafeMath: addition overflow")
    })
  })

  describe("sub", function () {
    it("subtracts correctly if it does not overflow and the result is positive", async function () {
      const a = new BN("5678")
      const b = new BN("1234")

      const result = await this.safeMath.sub(a, b)
      assert.equal(result.toString(), a.sub(b).toString())
    })

    it("subtracts correctly if it does not overflow and the result is negative", async function () {
      const a = new BN("1234")
      const b = new BN("5678")

      const result = await this.safeMath.sub(a, b)
      assert.equal(result.toString(), a.sub(b).toString())
    })

    it("reverts on positive subtraction overflow", async function () {
      const a = MAX_INT256
      const b = new BN("-1")

      await truffleAssert.reverts(this.safeMath.sub(a, b), "SignedSafeMath: subtraction overflow")
    })

    it("reverts on negative subtraction overflow", async function () {
      const a = MIN_INT256
      const b = new BN("1")

      await truffleAssert.reverts(this.safeMath.sub(a, b), "SignedSafeMath: subtraction overflow")
    })
  })
})

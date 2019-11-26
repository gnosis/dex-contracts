pragma solidity ^0.5.0;

import "openzeppelin-solidity/contracts/drafts/SignedSafeMath.sol";


/** @title Token Conservation
 *  A library for updating and verifying the tokenConservation contraint for StablecoinConverter's batch auction
 *  @author @gnosis/dfusion-team <https://github.com/orgs/gnosis/teams/dfusion-team/members>
 */
library TokenConservation {
    using SignedSafeMath for int256;

    /** @dev updated token conservation array.
      * @param self list of token imbalances
      * @param buyToken id of token whose imbalance should be subtracted from
      * @param sellToken id of token whose imbalance should be added to
      * @param tokenIdsForPrice sorted list of tokenIds
      * @param buyAmount amount to be subtracted at `self[buyTokenIndex]`
      * @param sellAmount amount to be added at `self[sellTokenIndex]`
      */
    function updateTokenConservation(
        int[] memory self,
        uint16 buyToken,
        uint16 sellToken,
        uint16[] memory tokenIdsForPrice,
        uint128 buyAmount,
        uint128 sellAmount
    ) internal pure {
        uint256 buyTokenIndex = findPriceIndex(buyToken, tokenIdsForPrice);
        uint256 sellTokenIndex = findPriceIndex(sellToken, tokenIdsForPrice);
        self[buyTokenIndex] = self[buyTokenIndex].sub(int(buyAmount));
        self[sellTokenIndex] = self[sellTokenIndex].add(int(sellAmount));
    }

    /** @dev Ensures all array's elements are zero except the first.
      * @param self list of token imbalances
      * @return true if all, but first element of self are zero else false
      */
    function checkTokenConservation(int[] memory self) internal pure {
        require(self[0] > 0, "Token conservation at 0 must be positive.");
        for (uint256 i = 1; i < self.length; i++) {
            require(self[i] == 0, "Token conservation does not hold");
        }
    }

    /** @dev Token ordering is verified by submitSolution. Required because binary search is used to fetch token info.
      * @param tokenIdsForPrice list of tokenIds
      * @return true if tokenIdsForPrice is sorted else false
      */
    function checkPriceOrdering(uint16[] memory tokenIdsForPrice) internal pure returns (bool) {
        for (uint i = 1; i < tokenIdsForPrice.length; i++) {
            if (tokenIdsForPrice[i] <= tokenIdsForPrice[i - 1]) {
                return false;
            }
        }
        return true;
    }

    /** @dev implementation of binary search on sorted list returns token id
      * @param tokenId element whose index is to be found
      * @param tokenIdsForPrice list of (sorted) tokenIds for which binary search is applied.
      * @return `index` in `tokenIdsForPrice` where `tokenId` appears (reverts if not found).
      */
    function findPriceIndex(uint16 tokenId, uint16[] memory tokenIdsForPrice) private pure returns (uint256) {
        // binary search for the other tokens
        uint256 leftValue = 0;
        uint256 rightValue = tokenIdsForPrice.length - 1;
        while (rightValue >= leftValue) {
            uint256 middleValue = leftValue + (rightValue-leftValue) / 2;
            if (tokenIdsForPrice[middleValue] == tokenId) {
                return middleValue;
            } else if (tokenIdsForPrice[middleValue] < tokenId) {
                leftValue = middleValue + 1;
            } else {
                rightValue = middleValue - 1;
            }
        }
        revert("Price not provided for token");
    }
}

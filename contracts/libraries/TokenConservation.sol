pragma solidity ^0.5.0;

import "openzeppelin-solidity/contracts/drafts/SignedSafeMath.sol";


/** @title Token Conservation
 *  A library for updating and verifying the tokenConservation contraint for StablecoinConverter's batch auction
 *  @author @gnosis/dfusion-team <https://github.com/orgs/gnosis/teams/dfusion-team/members>
 */
library TokenConservation {
    using SignedSafeMath for int256;

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

    function checkTokenConservation(int[] memory self) internal pure {
        for (uint256 i = 1; i < self.length; i++) {
            require(self[i] == 0, "Token conservation does not hold");
        }
    }

    function findPriceIndex(uint16 index, uint16[] memory tokenIdForPrice) private pure returns (uint256) {
        // binary search for the other tokens
        uint256 leftValue = 0;
        uint256 rightValue = tokenIdForPrice.length - 1;
        while (rightValue >= leftValue) {
            uint256 middleValue = leftValue + (rightValue-leftValue) / 2;
            if (tokenIdForPrice[middleValue] == index) {
                return middleValue;
            } else if (tokenIdForPrice[middleValue] < index) {
                leftValue = middleValue + 1;
            } else {
                rightValue = middleValue - 1;
            }
        }
        revert("Price not provided for token");
    }
}

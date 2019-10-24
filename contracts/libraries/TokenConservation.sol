pragma solidity ^0.5.0;
import "openzeppelin-solidity/contracts/drafts/SignedSafeMath.sol";


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
        uint buyTokenIndex = findPriceIndex(buyToken, tokenIdsForPrice);
        uint sellTokenIndex = findPriceIndex(sellToken, tokenIdsForPrice);
        self[buyTokenIndex] = self[buyTokenIndex].sub(int(buyAmount));
        self[sellTokenIndex] = self[sellTokenIndex].add(int(sellAmount));
    }

    function checkTokenConservation(
        int[] memory self
    ) internal pure {
        for (uint i = 1; i < self.length; i++) {
            require(self[i] == 0, "Token conservation does not hold");
        }
    }

    function findPriceIndex(uint16 index, uint16[] memory tokenIdForPrice) private pure returns (uint) {
        // binary search for the other tokens
        uint leftValue = 0;
        uint rightValue = tokenIdForPrice.length - 1;
        while (rightValue >= leftValue) {
            uint middleValue = leftValue + (rightValue-leftValue) / 2;
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

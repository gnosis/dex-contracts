pragma solidity ^0.5.0;

import "../libraries/TokenConservation.sol";

contract TokenConservationWrapper {
    using TokenConservation for int256[];
    using TokenConservation for uint16[];

    function updateTokenConservationTest(
        int256[] memory testInstance,
        uint16 buyToken,
        uint16 sellToken,
        uint16[] memory tokenIdsForPrice,
        uint128 buyAmount,
        uint128 sellAmount
    ) public pure returns (int256[] memory) {
        testInstance.updateTokenConservation(
            buyToken,
            sellToken,
            tokenIdsForPrice,
            buyAmount,
            sellAmount
        );
        return testInstance;
    }

    function checkTokenConservationTest(int256[] memory testInstance)
        public
        pure
    {
        testInstance.checkTokenConservation();
    }

    function checkPriceOrdering(uint16[] memory tokenIdsForPrice)
        public
        pure
        returns (bool)
    {
        return tokenIdsForPrice.checkPriceOrdering();
    }
}

pragma solidity ^0.5.0;

import "../libraries/TokenConservation.sol";


contract TokenConservationWrapper {
    using TokenConservation for int[];

    function updateTokenConservationTest(
        int[] memory testInstance,
        uint16 buyToken,
        uint16 sellToken,
        uint16[] memory tokenIdsForPrice,
        uint128 buyAmount,
        uint128 sellAmount
    ) public pure returns(int[] memory) {
        testInstance.updateTokenConservation(
            buyToken,
            sellToken,
            tokenIdsForPrice,
            buyAmount,
            sellAmount
        );
        return testInstance;
    }

    function checkTokenConservationTest(
        int[] memory testInstance
    ) public pure {
        testInstance.checkTokenConservation();
    }
}
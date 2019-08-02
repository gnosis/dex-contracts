pragma solidity ^0.5.0;

import "./EpochTokenLocker.sol";
import "./libraries/IdToAddressBiMap.sol";
import "solidity-bytes-utils/contracts/BytesLib.sol";


contract StablecoinConverter is EpochTokenLocker {
    using SafeMath for uint;
    using BytesLib for bytes32;

    uint constant PRICE_NORM = 10000000000;

    event OrderPlacement(
        address owner,
        address buyToken,
        address sellToken,
        uint32 validFrom,
        uint32 validTill,
        uint256 buyAmount,
        uint256 sellAmount
    );

    event OrderCancelation(
        bytes32 id,
        bytes32 newId,
        uint32 newValidTill
    );

    // Bytes Id -> open order amount
    mapping(bytes32 => uint) public orders;
    uint public startTime;

    constructor() public {
        startTime = now;
    }

    function placeOrder(
        address buyToken,
        address sellToken,
        bool sellOrderFlag,
        uint32 validTill,
        uint256 buyAmount,
        uint256 sellAmount
    ) public returns (bytes32) {
        bytes32 id = getOrderId(
            msg.sender,
            buyToken,
            sellToken,
            currentStateIndex + 1, // equals validFrom
            validTill,
            buyAmount,
            sellAmount
        );
        orders[id] = sellAmount;

        emit OrderPlacement(
            msg.sender,
            buyToken,
            sellToken,
            currentStateIndex + 1,
            validTill,
            buyAmount,
            sellAmount
        );
        return id;
    }

    function cancelOrder(
        address buyToken,
        address sellToken,
        uint32 validFrom,
        uint32 validTill,
        uint256 buyAmount,
        uint256 sellAmount
    ) public returns (bytes32) {
        bytes32 id = getOrderId(
            msg.sender,
            buyToken,
            sellToken,
            validFrom,
            validTill,
            buyAmount,
            sellAmount
        );
        bytes32 newId = getOrderId(
            msg.sender,
            buyToken,
            sellToken,
            validFrom,
            currentStateIndex,
            buyAmount,
            sellAmount
        );
        orders[newId] = orders[id];
        orders[id] = 0;

        emit OrderCancelation(
            id,
            newId,
            currentStateIndex
        );
        return newId;
    }

    function deleteOrder(
        address buyToken,
        address sellToken,
        uint32 validFrom,
        uint32 validTill,
        uint256 buyAmount,
        uint256 sellAmount
    ) public {
        bytes32 id = getOrderId(
            msg.sender,
            buyToken,
            sellToken,
            validFrom,
            validTill,
            buyAmount,
            sellAmount
            );
        require(validTill < currentStateIndex, "Order is still valid");
        orders[id] = 0;
    }

    function getOrderId(
        address owner,
        address buyToken,
        address sellToken,
        uint32 validFrom,
        uint32 validTill,
        uint256 buyAmount,
        uint256 sellAmount
    ) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                owner,
                buyToken,
                sellToken,
                validFrom,
                validTill,
                buyAmount,
                sellAmount
            )
        );
    }

    function updateStateIndex() public {
        currentStateIndex = uint32((now - startTime)/300);
    }

    mapping (uint => uint) public bestTradersUtility;
    mapping( uint => SolutionDelta[]) public solutionDelta;
    struct SolutionDelta {
        bytes32 orderId;
        uint volume;
        address owner;
        address tokenBought;
        uint buyVolume;
        address tokenSold;
        uint sellVolume;
    }
    function submitSolution(
        uint16 batchIndex,
        uint[] memory prices,
        address[] memory tokenForPrice,
        address[] memory owner,
        uint8[] memory tokenIndex,
            //uint8[] memory buyTokenIndex,
            //uint8[] memory sellTokenIndex,
        uint32[] memory validFrom,
        uint32[] memory validTill,
        uint256[] memory amountData
            // uint256[] memory buyAmount,
            // uint256[] memory sellAmount,
            // uint256[] memory volume
    ) public {
        updateStateIndex();
        require(
            batchIndex == currentStateIndex - 1,
            "Solutions are no longer accepted for this batch"
        );
        int[] memory tokenConservation;
        uint tradersUtility;
        uint i = 0;
        uint len = owner.length;
        checkTradersUtility(
            batchIndex, prices, tokenForPrice, owner, tokenIndex, validFrom, validTill, amountData
        );
        checkPriceConformity(prices);
        checkNorm(prices);
        undoPreviousSolution(batchIndex);
        // Do rest of the solution conformity checks
        for(i = 0; i < len; i++){
            require(validFrom[i] <= currentStateIndex, "Order is not yet valid");
            require(validTill[i] > currentStateIndex, "Order is not yet valid");
            require(
                prices[tokenIndex[2*i]].mul(amountData[3*i+1]) <= prices[tokenIndex[2*i+1]].mul(amountData[3*i]),
                "limit price not met"
            );
            bytes32 orderId = getOrderId(
                owner[i],
                tokenForPrice[tokenIndex[2*i]],
                tokenForPrice[tokenIndex[2*i+1]],
                validFrom[i],
                validTill[i],
                amountData[3*i],
                amountData[3*i+1]
            );
            require(
                orders[orderId] >= amountData[3*i+2],
                "Ordervolume not sufficient"
            );
            orders[orderId] = orders[orderId].sub(amountData[3*i+2]);
            uint sellVolume = amountData[3*i+2];
            uint buyVolume = amountData[3*i+2].mul(prices[tokenIndex[2*i+1]]) / prices[tokenIndex[2*i]];
            tokenConservation[tokenIndex[2*i]] += int(buyVolume);
            tokenConservation[tokenIndex[2*i+1]] -= int(sellVolume);
            // checks that users have the sellVolume available is done indirectly in the next 2 lines
            addBalance(owner[i], tokenForPrice[tokenIndex[2*i]], buyVolume);
            substractBalance(owner[i], tokenForPrice[tokenIndex[2*i]], sellVolume);
        }
        for(i = 0; i < len; i++) {
            require(
                tokenConservation[tokenIndex[2*i]] == 0,
                "Token conservation does not hold for buyTokens"
            );
            require(
                tokenConservation[tokenIndex[2*i+1]] == 0,
                "Token conservation does not hold for sellTokens"
            );
        }
    }

    // solutionDelta[batchIndex].push( SolutionDelta({
            //     orderId: orderId,
            //     volume: amountData[3*i+2],
            //     owner: owner[i],
            //     tokenBought: tokenForPrice[tokenIndex[2*i]],
            //     buyVolume: buyVolume,
            //     tokenSold: tokenForPrice[tokenIndex[2*i]],
            //     sellVolume: sellVolume
            // }));

    function checkPriceConformity(uint[] prices) public {
        // check that all tokenForPrice are distinct, by checking that they are sorted
        for(i = 0; i < tokenForPrice.length - 1; i++) {
            require(
                tokenForPrice[i]<tokenForPrice[i+1],
                "token price references are not sorted"
            );
        }
    }

    function checkNorm(uint[] prices) public {
        // check that price vector is normed.
        uint priceNorm = 0;
        for(i = 0; i < prices.length; i++) {
            priceNorm += prices[i];
        }
        require(priceNorm == PRICE_NORM, "prices are not normed");
    }

    function calculateTradersUtility(
        uint16 batchIndex,
        uint[] memory prices,
        address[] memory tokenForPrice,
        address[] memory owner,
        uint8[] memory tokenIndex,
        uint32[] memory validFrom,
        uint32[] memory validTill,
        uint256[] memory amountData
    ) public {
        for(i = 0; i < lowner.length; i++) {
            uint tempTradersUtility = (prices[tokenIndex[2*i]].mul(amountData[3*i + 1])
            .sub(prices[tokenIndex[2*i+1]].mul(amountData[3*i])));
            tempTradersUtility += tempTradersUtility.mul(amountData[3*i + 2]) / amountData[3*i + 1] / prices[tokenIndex[2*i+1]];
            tradersUtility += tempTradersUtility;
        }
        require(
            tradersUtility > bestTradersUtility[currentStateIndex],
            "Traders' utility is not surpassing previous one"
        );
        bestTradersUtility[currentStateIndex] = tradersUtility;
    }
    function undoPreviousSolution(uint batchIndex) public {
        while(solutionDelta[batchIndex].length > 0){
            orders[solutionDelta[batchIndex][0].orderId] += solutionDelta[batchIndex][0].volume;
            substractBalance(
                solutionDelta[batchIndex][0].owner,
                solutionDelta[batchIndex][0].tokenBought,
                solutionDelta[batchIndex][0].buyVolume
            );
            addBalance(
                solutionDelta[batchIndex][0].owner,
                solutionDelta[batchIndex][0].tokenSold,
                solutionDelta[batchIndex][0].sellVolume
            );
            delete solutionDelta[batchIndex][0];
        }
    }
}
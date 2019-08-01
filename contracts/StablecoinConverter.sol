pragma solidity ^0.5.0;

import "./EpochTokenLocker.sol";
import "./libraries/IdToAddressBiMap.sol";
import "solidity-bytes-utils/contracts/BytesLib.sol";


contract StablecoinConverter is EpochTokenLocker {
    using SafeMath for uint;
    using BytesLib for bytes32;

    event OrderPlacement(
        address owner,
        address buyToken,
        address sellToken,
        bool sellOrderFlag,
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
    // test
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
            sellOrderFlag,
            currentStateIndex + 1, // equals validFrom
            validTill,
            buyAmount,
            sellAmount
        );
        if(sellOrderFlag) {
            orders[id] = sellAmount;
        } else {
            orders[id] = buyAmount;
        }
        emit OrderPlacement(
            msg.sender,
            buyToken,
            sellToken,
            sellOrderFlag,
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
        bool sellOrderFlag,
        uint32 validFrom,
        uint32 validTill,
        uint256 buyAmount,
        uint256 sellAmount
    ) public returns (bytes32) {
        bytes32 id = getOrderId(
            msg.sender,
            buyToken,
            sellToken,
            sellOrderFlag,
            validFrom,
            validTill,
            buyAmount,
            sellAmount
        );
        bytes32 newId = getOrderId(
            msg.sender,
            buyToken,
            sellToken,
            sellOrderFlag,
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
        bool sellOrderFlag,
        uint32 validFrom,
        uint32 validTill,
        uint256 buyAmount,
        uint256 sellAmount
    ) public {
        bytes32 id = getOrderId(
            msg.sender,
            buyToken,
            sellToken,
            sellOrderFlag,
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
        bool sellOrderFlag,
        uint32 validFrom,
        uint32 validTill,
        uint256 buyAmount,
        uint256 sellAmount
    ) public view returns (bytes32) {
        return keccak256(
            abi.encode(
                owner,
                buyToken,
                sellToken,
                sellOrderFlag,
                validFrom,
                validTill,
                buyAmount,
                sellAmount
            )
        );
    }
}
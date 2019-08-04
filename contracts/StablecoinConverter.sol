pragma solidity ^0.5.0;

import "./EpochTokenLocker.sol";
import "./libraries/IdToAddressBiMap.sol";
import "solidity-bytes-utils/contracts/BytesLib.sol";
import "./libraries/IdToAddressBiMap.sol";


contract StablecoinConverter is EpochTokenLocker {
    using SafeMath for uint;
    using BytesLib for bytes32;

    event OrderPlacement(
        address owner,
        uint16 buyToken,
        uint16 sellToken,
        bool sellOrderFlag,
        uint32 validFrom,
        uint32 validTill,
        uint256 buyAmount,
        uint256 sellAmount
    );

    event OrderCancelation(
        address owner,
        uint id
    );

    struct Order {
        uint16 buyToken;
        uint16 sellToken;
        uint32 validFrom;  // order is valid from validFrom inclusively
        uint32 validTill;  // order is valid till validTill inclusively
        bool sellOrderFlag;
        uint128 buyAmount;
        uint128 sellAmount;
                            // outstanding volume is encoded as buyAmount or sellAmount depending on sellOrderFlag
    }

    // User-> Order
    mapping(address => Order[]) public orders;

    IdToAddressBiMap.Data private registeredTokens;
    uint constant public MAX_TOKENS = 2**16 - 1; //65536;65535
    uint16 public numTokens = 0;

    function addToken(address _tokenAddress) public {
        require(numTokens < MAX_TOKENS, "Max tokens reached");
        require(
            IdToAddressBiMap.insert(registeredTokens, numTokens, _tokenAddress),
            "Token already registered"
        );
        numTokens++;
    }

    function placeOrder(
        uint16 buyToken,
        uint16 sellToken,
        bool sellOrderFlag,
        uint32 validTill,
        uint128 buyAmount,
        uint128 sellAmount
    ) public returns (uint) {
        orders[msg.sender].push(Order({
            buyToken: buyToken,
            sellToken: sellToken,
            validFrom: getCurrentStateIndex() + 1,
            validTill: validTill,
            sellOrderFlag: sellOrderFlag,
            buyAmount: buyAmount,
            sellAmount: sellAmount
        }));
        emit OrderPlacement(
            msg.sender,
            buyToken,
            sellToken,
            sellOrderFlag,
            getCurrentStateIndex() + 1,
            validTill,
            buyAmount,
            sellAmount
        );
        return orders[msg.sender].length - 1;
    }

    function cancelOrder(
        uint id
    ) public {
        orders[msg.sender][id].validTill = getCurrentStateIndex();
        emit OrderCancelation(msg.sender, id);
    }

    function deleteOrder(
        uint id
    ) public {
        require(orders[msg.sender][id].validTill < getCurrentStateIndex(), "Order is still valid");
        orders[msg.sender][id] = Order({
            buyToken: 0,
            sellToken: 0,
            sellOrderFlag: false,
            validFrom: 0,
            validTill: 0,
            buyAmount: 0,
            sellAmount: 0
        });
    }

    function tokenAddressToIdMap(address addr) public view returns (uint16) {
        return IdToAddressBiMap.getId(registeredTokens, addr);
    }

    function tokenIdToAddressMap(uint16 id) public view returns (address) {
        return IdToAddressBiMap.getAddressAt(registeredTokens, id);
    }
}
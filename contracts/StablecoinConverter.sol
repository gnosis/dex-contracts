pragma solidity ^0.5.0;

import "./IntervalTokenStore.sol";
import "./libraries/IdToAddressBiMap.sol";
import "solidity-bytes-utils/contracts/BytesLib.sol";


contract StablecoinConverter is IntervalTokenStore {
    using SafeMath for uint;
    using BytesLib for bytes32;


    mapping(address => bytes32[]) public orders;
    // an order has the fields
    // (buyToken (16 bit), sellToken (16 bit), buySellOrderFlag (8 bit, for easier encoding),
    // validTill (32 bit), validFrom (32 bit), buyAmount (64 bit) , sellAmount (64 bit))
    // Tokens 16 bits -> exchange can deal with 65536 tokens
    // validityIndicators 32 bit -> exchange can run for 41425.2246914 years
    // Amounts 64 bits, -> each number is represented as amount * 10^(9): We can represent all numbers up to 1.8446744e+28

    function placeOrder(bytes32 orderbytes) public {
        orders[msg.sender].push(orderbytes);
    }

    function cancelOrder(uint index) public {
        bytes32 currentOrder = orders[msg.sender][index];
        // set validTill in currrentOrder = 0
        bytes32 updatedOrder = bytes32(uint(currentOrder) + (uint(currentStateIndex) << 24));
        orders[msg.sender][index] = updatedOrder;
    }

    function modifyOrder(bytes32 orderbytes, uint index) public {
        require(orderIsExpired(msg.sender, index), "validTill not yet expired");
        orders[msg.sender][index] = orderbytes;
    }

    function deleteOrder(uint index) public {
        require(orderIsExpired(msg.sender, index), "validTill not yet expired");
        delete orders[msg.sender][index];
    }

    function orderIsExpired(address user, uint index) public view returns (bool){
        address a;
        address b;
        bool c;
        uint32 d;
        uint256 e;
        uint256 f;
        uint32 validTill;
        (a,b,c,validTill,d,e,f) = decodeOrder(abi.encodePacked(orders[user][index]));
        return validTill < currentStateIndex;
    }

    function decodeOrder(bytes memory orderData) internal view
        returns(
            address buyToken,
            address sellToken,
            bool buySellOrderFlag,
            uint32 validTill,
            uint32 validFrom,
            uint256 buyAmount,
            uint256 sellAmount
        )
    {
        buyAmount = BytesLib.toUint64(orderData, 0);
        buyAmount *= 1000000000; //orders do not consider last 9 digits
        sellAmount = BytesLib.toUint64(orderData, 5);
        sellAmount *= 1000000000; //orders do not consider last 9 digits
        validFrom = BytesLib.toUint16(orderData, 10);
        validTill = BytesLib.toUint16(orderData, 14);
        uint8 buySellOrderFlagUint8 = BytesLib.toUint8(orderData, 18);
        if( buySellOrderFlagUint8 > 0){
            buySellOrderFlag = true;
        }
        uint16 sellTokenId = BytesLib.toUint16(orderData, 19);
        sellToken = tokenIdToAddressMap(sellTokenId);
        uint16 buyTokenId = BytesLib.toUint16(orderData, 21);
        buyToken = tokenIdToAddressMap(buyTokenId);
    }

    uint16 public numTokens = 0;
    IdToAddressBiMap.Data registeredTokens;
    uint16 public constant MAX_TOKENS = 65535;

    function addToken( address _tokenAddress) public {
        require(numTokens + 1 <= MAX_TOKENS, "Max tokens reached");
        require(
            IdToAddressBiMap.insert(registeredTokens, numTokens, _tokenAddress),
            "Token already registered"
        );
        numTokens++;
    }

    function tokenIdToAddressMap( uint16 id) public view returns (address) {
        return IdToAddressBiMap.getAddressAt(registeredTokens, id);
    }
}
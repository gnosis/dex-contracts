pragma solidity ^0.5.0;

import "./IntervalTokenStore.sol";
import "./libraries/IdToAddressBiMap.sol";


contract StablecoinConverter is IntervalTokenStore {
    using SafeMath for uint;

    mapping(address => bytes256[]) public orders;
    // an order has the fields
    // (buyToken (16 bit), sellToken (16 bit), buySellOrderFlag (8 bit, for easier encoding),
    // validTill (32 bit), validFrom (32 bit), buyAmount (64 bit) , sellAmount (64 bit))
    // Tokens 16 bits -> exchange can deal with 65536 tokens
    // validityIndicators 32 bit -> exchange can run for 41425.2246914 years
    // Amounts 64 bits, -> each number is represented as amount * 10^(9): We can represent all numbers up to 1.8446744e+28

    function placeOrder(bytes256 orderbytes) public {
        orders[msg.sender].push(orderbytes);
    }

    function modifyOrder(bytes256 orderbytes, uint index) public {
        orders[msg.sender][index] = orderbytes;
    }

    function deleteOrder(uint index) public {
        delete orders[msg.sender][index];
    }

    function decodeOrder(bytes memory orderData) internal pure
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
        buySellOrderFlagUint8 = BytesLib.toUint8(orderData, 18);
        if( buySellOrderFlagUint > 0){
            buySellOrderFlag = true;
        }
        sellTokenId = BytesLib.toUint16(orderData, 19);
        sellToken = tokenIdToAddressMap(sellTokenId);
        buyTokenId = BytesLib.toUint16(orderData, 21);
        buyToken = tokenIdToAddressMap(buyTokenId);
    }

    uint256 public numTokens = 0;
    IdToAddressBiMap.Data registeredTokens;
    uint8 public constant MAX_TOKENS = 65535;

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
pragma solidity ^0.5.0;
pragma experimental ABIEncoderV2;


contract SnappAuctionChallenge {
    uint public constant EPSILON = 1;
    uint public constant NUM_ORDERS = 1;
    uint public constant NUM_TOKENS = 32;

    uint public constant EXP = 5;

    bytes32 public priceAndVolumeHash;
    bytes32 public committedOrderHash;

    struct Order {
        uint24 account;
        uint8 buyToken;
        uint8 sellToken;
        uint32 buyAmount;
        uint32 sellAmount;
        uint24 rolloverCount;
    }

    function proveSpecificPriceNonUniform(
        bytes memory pricesAndVolumes,
        bytes memory orders,
        uint16 badOrder
    ) public returns (bool) {
        require(!checkPriceAndVolumeData(pricesAndVolumes), "Wrong prices or volumes");
        require(!checkOrderData(orders), "Wrong order data");
        
        Order memory order = getOrder(orders, badOrder);
        (uint buyVolume, uint sellVolume) = getVolumes(pricesAndVolumes, badOrder);
        uint buyPrice = getPrice(pricesAndVolumes, order.buyToken);
        uint sellPrice = getPrice(pricesAndVolumes, order.sellToken);

        require(proveSpecificPriceNonUniform(buyPrice, sellPrice, buyVolume, sellVolume), "Prices are uniform");
        return true;
    }

    function getOrder(
        bytes memory orders,
        uint16 index
    ) public pure returns (Order memory) {
        Order memory o;
        uint order;
        uint256 offset = 32 + (index * 16);
        /* solhint-disable no-inline-assembly */
        assembly {
            order := mload(add(orders, offset))
        }
        o.account = uint24(order / (2 ** 232));
        o.buyToken = uint8(order / (2 ** 224));
        o.sellToken = uint8(order / (2 ** 216));
        o.buyAmount = uint32(order / (2 ** 184));
        o.sellAmount = uint32(order / (2 ** 152));
        o.rolloverCount = uint24(order / 2 ** 128);
        return o;
    }

    function getVolumes(
        bytes memory pricesAndVolumes,
        uint16 index
    ) public pure returns (uint, uint) {
        uint buyVolume;
        uint sellVolume;
        uint256 offset = 32 + (4 * 32) + (index * 8);
        /* solhint-disable no-inline-assembly */
        assembly {
            buyVolume := mload(add(pricesAndVolumes, offset))
            sellVolume := mload(add(pricesAndVolumes, add(offset, 4)))
        }
        return (floatToUint(buyVolume / 2 ** 224), floatToUint(sellVolume / 2 ** 224));
    }

    function getPrice(
        bytes memory pricesAndVolumes,
        uint16 index
    ) public pure returns (uint) {
        uint price;
        uint256 offset = 32 + (4 * index); /* first item is length of byte array */
        /* solhint-disable no-inline-assembly */
        assembly {
            price := mload(add(pricesAndVolumes, offset))
        }
        // Only take 32 most significant bits
        return floatToUint(price / 2 ** 224);
    }

    function floatToUint(uint float) public pure returns (uint) {
        uint mantissa = float / (2**EXP);
        uint exponent = float & ((2**EXP) - 1);
        return mantissa * 10 ** (exponent * 1);
    }

    function checkPriceAndVolumeData(
        bytes memory pricesAndVolumes
    ) internal view returns (bool) {
        return sha256(pricesAndVolumes) == priceAndVolumeHash;
    }

    function checkOrderData(
        bytes memory orders
    ) internal view returns (bool) {
        bytes32 orderHash = 0x0;
        bytes32 order = 0x0;
        for (uint256 i = 32; i <= NUM_ORDERS * 32; i += 32) {
            /* solhint-disable no-inline-assembly */
            assembly {
                order := mload(add(orders, i))
            }
            orderHash = sha256(abi.encodePacked(orderHash, order));
        }
        return orderHash == committedOrderHash;
    }

    function proveSpecificPriceNonUniform(
        uint buyPrice, 
        uint sellPrice, 
        uint buyVolume, 
        uint sellVolume
    ) internal pure returns (bool) {
        return ((buyPrice * sellVolume) - (sellPrice * buyVolume))**2 > EPSILON**2;
    }
}
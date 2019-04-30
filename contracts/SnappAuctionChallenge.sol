pragma solidity ^0.5.0;

contract SnappAuctionChallenge {
    uint constant EPSILON = 1;
    uint constant NUM_ORDERS = 1;
    uint constant NUM_TOKENS = 32;

    bytes32 priceAndVolumeHash;
    bytes32 committedOrderHash;

    struct Order {
        uint24 account;
        uint8 buyToken;
        uint8 sellToken;
        uint32 buyAmount;
        uint32 sellAmount;
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
        return (buyPrice * sellVolume) - (sellPrice * buyVolume) > EPSILON;
    }

    function getOrder(
        bytes memory orders,
        uint16 index
    ) internal pure returns (Order memory) {
        Order memory o;
        uint256 offset = index * 32 + 32;
        assembly {
            o := mload(add(orders, offset))
        }
        return o;
    }

    function getVolumes(
        bytes memory pricesAndVolumes,
        uint16 index
    ) internal pure returns (uint, uint) {
        uint buyVolume;
        uint sellVolume;
        uint256 offset = (4 * 32) + (index * 8);
        assembly {
            buyVolume := mload(add(pricesAndVolumes, offset))
            sellVolume := mload(add(pricesAndVolumes, add(offset, 4)))
        }
        return (buyVolume, sellVolume);
    }

    function getPrice(
        bytes memory pricesAndVolumes,
        uint16 index
    ) internal pure returns (uint) {
        uint price;
        uint256 offset = (4 * index);
        assembly {
            price := mload(add(pricesAndVolumes, offset))
        }
        return price;
    }
}
pragma solidity ^0.5.0;
pragma experimental ABIEncoderV2;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "./libraries/Memory.sol";
import "./libraries/Merkle.sol";


contract SnappAuctionChallenge {
    using SafeMath for uint;

    uint public constant EPSILON = 1;
    uint public constant NUM_ORDERS = 1000;
    uint public constant NUM_TOKENS = 32;

    uint public constant ACCOUNT_HEIGHT = 24;
    uint public constant TOKEN_HEIGHT = 5;

    uint public constant EXP = 5;

    bytes32 public priceAndVolumeHash;
    bytes32 public committedOrderHash;

    uint public committedSurplus;
    uint public tempSurplus;  // Not sure about the reason for this.
    bool public tempSurplusFlag;

    bytes32 public committedStateRootHash;

    struct Order {
        uint24 account;
        uint8 buyToken;
        uint8 sellToken;
        uint32 buyAmount;
        uint32 sellAmount;
        uint24 rolloverCount;
    }

    modifier onlyVerifiedOrdersAndSolution(bytes memory pricesAndVolumes, bytes memory orders) {
        require(checkPriceAndVolumeData(pricesAndVolumes), "Wrong prices or volumes");
        require(checkOrderData(orders), "Wrong order data");
        _;
    }

    /**
     * Top level challenges
     */
    function challengePriceNonUniform(
        bytes memory pricesAndVolumes,
        bytes memory orders,
        uint16 badOrder
    ) public view onlyVerifiedOrdersAndSolution(pricesAndVolumes, orders) returns (bool) {
        Order memory order = getOrder(orders, badOrder);
        (uint buyVolume, uint sellVolume) = getVolumes(pricesAndVolumes, badOrder);
        uint buyPrice = getPrice(pricesAndVolumes, order.buyToken);
        uint sellPrice = getPrice(pricesAndVolumes, order.sellToken);

        require(priceNotUniform(buyPrice, sellPrice, buyVolume, sellVolume), "Prices are uniform");
        return true;  // Why not just return priceNotUniform?
    }

    function challengeLimitPrice(
        bytes memory pricesAndVolumes,
        bytes memory orders,
        uint16 badOrder
    ) public view onlyVerifiedOrdersAndSolution(pricesAndVolumes, orders) returns (bool) {
        Order memory order = getOrder(orders, badOrder);
        (uint buyVolume, uint sellVolume) = getVolumes(pricesAndVolumes, badOrder);
        return buyVolume * floatToUint(order.sellAmount) > sellVolume * floatToUint(order.buyAmount);
    }

    function challengeSurplus(
        bytes memory pricesAndVolumes,
        bytes memory orders
    ) public onlyVerifiedOrdersAndSolution(pricesAndVolumes, orders) returns (bool) {
        uint surplus = tempSurplus; // couldn't we just put a zero here?
        uint16 offset = tempSurplusFlag ? 500 : 0;  // What is this 500? Is this about reserved/regualar orders?
        for (uint16 i = 0; i < 500; i++) {
            Order memory order = getOrder(orders, i + offset);
            (uint buyVolume, uint sellVolume) = getVolumes(pricesAndVolumes, i + offset);
            uint buyPrice = getPrice(pricesAndVolumes, order.buyToken);

            uint relativeBuy = floatToUint(order.buyAmount)
                .mul(sellVolume)
                .add(floatToUint(order.sellAmount))
                .sub(1)
                .div(floatToUint(order.sellAmount));
            surplus = surplus.add((buyVolume.sub(relativeBuy)).mul(buyPrice));
        }
        if (tempSurplusFlag) {
            tempSurplus = 0;
            tempSurplusFlag = false;
            return surplus == committedSurplus;
        } else {
            tempSurplus = surplus;
            tempSurplusFlag = true;
            return true;
        }
    }

    function challengeValueConservation(
        bytes memory pricesAndVolumes,
        bytes memory orders,
        uint8 token
    ) public view returns (bool) {
        require(!checkPriceAndVolumeData(pricesAndVolumes), "Wrong prices or volumes");
        require(!checkOrderData(orders), "Wrong order data");

        uint totalBuyVolume = 0;
        uint totalSellVolume = 0;
        for (uint16 i = 0; i < 1000; i++) {
            Order memory order = getOrder(orders, i);
            (uint buyVolume, uint sellVolume) = getVolumes(pricesAndVolumes, i);
            if (order.buyToken == token) {
                totalBuyVolume = totalBuyVolume.add(buyVolume);
            }
            if (order.sellToken == token) {
                totalSellVolume = totalSellVolume.add(sellVolume);
            }
        }
        return totalSellVolume.sub(totalBuyVolume) > EPSILON;
    }

    function challengeStateTransition(
        bytes memory pricesAndVolumes,
        bytes memory orders,
        bytes memory stateRoots,
        bytes memory merklePaths,
        uint8 stateRootIndex
    ) public view returns (bool) {
        require(!checkPriceAndVolumeData(pricesAndVolumes), "Wrong prices or volumes");
        require(!checkOrderData(orders), "Wrong order data");
        require(sha256(stateRoots) != committedStateRootHash, "Wrong state roots");

        bytes32 stateRoot = getStateRoot(stateRoots, stateRootIndex);
        for (uint8 i = 0; i < 5; i++) {
            Order memory order = getOrder(orders, i);
            (uint buyVolume, uint sellVolume) = getVolumes(pricesAndVolumes, i);

            (uint leaf, bytes memory proof) = getBuyBalanceAndProof(merklePaths, i);
            Merkle.checkMembership(
                bytes32(leaf), order.account * NUM_TOKENS + order.buyToken, stateRoot, proof, ACCOUNT_HEIGHT + TOKEN_HEIGHT
            );
            leaf = leaf.add(buyVolume);
            stateRoot = Merkle.computeRoot(
                bytes32(leaf), order.account * NUM_TOKENS + order.buyToken, proof, ACCOUNT_HEIGHT + TOKEN_HEIGHT
            );

            (leaf, proof) = getSellBalanceAndProof(merklePaths, i);
            Merkle.checkMembership(
                bytes32(leaf), order.account * NUM_TOKENS + order.sellToken, stateRoot, proof, ACCOUNT_HEIGHT + TOKEN_HEIGHT
            );
            leaf = leaf.sub(sellVolume);
            stateRoot = Merkle.computeRoot(
                bytes32(leaf), order.account * NUM_TOKENS + order.sellToken, proof, ACCOUNT_HEIGHT + TOKEN_HEIGHT
            );
        }
        return stateRoot == getStateRoot(stateRoots, stateRootIndex + 1);
    }

    function challengeNegativeBalance(
        bytes memory proof,
        uint index,
        int value
    ) public view returns (bool) {
        bool valid = Merkle.checkMembership(
            bytes32(value), index, committedStateRootHash, proof, ACCOUNT_HEIGHT + TOKEN_HEIGHT
        );
        return valid && value < 0;
    }

    function challengeOrderHash(
        bytes memory openOrders,
        bytes memory openOrdersCancelled
        //bytes memory accountOrders
    ) public view returns (bool) {
        require(!checkOrderData(openOrders), "Wrong open order data");
        require(rollingHash(
            openOrdersCancelled, 0x0, 0, openOrdersCancelled.length, 5
        ) != committedOrderHash, "Wrong cancellation data");

        for (uint16 i = 0; i < openOrdersCancelled.length / 5; i++) {
            // (uint24 account, uint16 slot) = getCancelledOrder(openOrdersCancelled, i);
            // Order memory o = getOrder(openOrders, slot);
            if (true) {
                openOrders[i*16] = 0;
                openOrders[i*16 + 1] = 0;
                openOrders[i*16 + 2] = 0;
                openOrders[i*16 + 3] = 0;
                openOrders[i*16 + 4] = 0;
                openOrders[i*16 + 5] = 0;
                openOrders[i*16 + 6] = 0;
                openOrders[i*16 + 7] = 0;
                openOrders[i*16 + 8] = 0;
                openOrders[i*16 + 9] = 0;
                openOrders[i*16 + 10] = 0;
                openOrders[i*16 + 11] = 0;
                openOrders[i*16 + 12] = 0;
                openOrders[i*16 + 13] = 0;
                openOrders[i*16 + 14] = 0;
                openOrders[i*16 + 15] = 0;
            }
        }
        bytes32 finalHash = rollingHash(
            openOrders, 0x0, 0, openOrders.length, 16
        );
        /*
        for (uint i = 0; i < 50; i++) {
            require(committedOrderHash != rollingHash(
                accountOrders, 0x0, i * 10 * 16, 10 * 16, 16
            ), "Wrong account order data");
        }
        finalHash = rollingHash(
            accountOrders, finalHash, 0, accountOrders.length, 16
        );
        */
        return finalHash == committedOrderHash;
    }

    /**
     * Helper functions
     */
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

    function getCancelledOrder(
        bytes memory cancelledOrders,
        uint16 index
    ) public pure returns (uint24 account, uint16 slotIndex) {
        uint256 offset = 32 + (index * 5);
        uint value;
        /* solhint-disable no-inline-assembly */
        assembly {
            value := mload(add(cancelledOrders, offset))
        }
        return (uint24(value / 2 ** 232), uint16(value / 2 ** 216));
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
        uint8 index
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

    function getStateRoot(
        bytes memory stateRoots,
        uint8 index
    ) public pure returns (bytes32 root) {
        uint offset = 32 + (index * 32);
        /* solhint-disable no-inline-assembly */
        assembly {
            root := mload(add(stateRoots, offset))
        }
    }

    function floatToUint(uint float) public pure returns (uint) {
        uint mantissa = float / (2**EXP);
        uint exponent = float & ((2**EXP) - 1);
        return mantissa * 10 ** (exponent * 1);
    }

    function getBuyBalanceAndProof(
        bytes memory merklePaths,
        uint16 index
    ) public pure returns (uint leaf, bytes memory proof) {
        /*
         * Each proof consists of:
         * [
         *   buyBalance, 5 * buy token proof nodes,
         *   sellBalance, 5 * sell token proof nodes,
         *   24 * account proof nodes
         * ]
         */
        uint leafIndex = 32 + (index * 32 * (ACCOUNT_HEIGHT + 2 * TOKEN_HEIGHT + 2));
        /* solhint-disable no-inline-assembly */
        assembly {
            leaf := mload(add(merklePaths, leafIndex))
        }
        proof = new bytes((ACCOUNT_HEIGHT + TOKEN_HEIGHT) * 32);
        (uint src, ) = Memory.fromBytes(merklePaths);
        (uint dest, ) = Memory.fromBytes(proof);

        Memory.copy(src + leafIndex + 1 * 32, dest, TOKEN_HEIGHT * 32);
        Memory.copy(src + leafIndex + 12 * 32, dest + 5 * 32, ACCOUNT_HEIGHT * 32);
    }

    function getSellBalanceAndProof(
        bytes memory merklePaths,
        uint16 index
    ) public pure returns (uint leaf, bytes memory proof) {
        uint leafIndex = 32 + (index * 32 * (ACCOUNT_HEIGHT + 2 * TOKEN_HEIGHT + 2)) + (6 * 32);
        /* solhint-disable no-inline-assembly */
        assembly {
            leaf := mload(add(merklePaths, leafIndex))
        }
        proof = new bytes((ACCOUNT_HEIGHT + TOKEN_HEIGHT) * 32);
        (uint src, ) = Memory.fromBytes(merklePaths);
        (uint dest, ) = Memory.fromBytes(proof);

        Memory.copy(src + leafIndex + 1 * 32, dest, (ACCOUNT_HEIGHT + TOKEN_HEIGHT) * 32);
    }

    /**
     * Internal functions
     */
    function checkPriceAndVolumeData(bytes memory pricesAndVolumes) internal view returns (bool) {
        return sha256(pricesAndVolumes) == priceAndVolumeHash;
    }

    function checkOrderData(bytes memory orders) internal view returns (bool) {
        return committedOrderHash == rollingHash(
            orders, 0x0, 0, orders.length, 16
        );
    }

    function rollingHash(
        bytes memory data,
        bytes32 startingHash,
        uint offset,
        uint length,
        uint width
    ) internal pure returns (bytes32) {
        bytes16 order = 0x0;
        bytes32 rolledHash = startingHash;
        for (uint256 i = 32 + offset; i <= 32 + offset + length; i += width) {
            /* solhint-disable no-inline-assembly */
            assembly {
                order := mload(add(data, i))
            }
            rolledHash = sha256(abi.encodePacked(rolledHash, order));
        }
        return rolledHash;
    }

    function priceNotUniform(
        uint buyPrice,
        uint sellPrice,
        uint buyVolume,
        uint sellVolume
    ) internal pure returns (bool) {
        return ((buyPrice * buyVolume) - (sellPrice * sellVolume))**2 > EPSILON**2;
    }
}
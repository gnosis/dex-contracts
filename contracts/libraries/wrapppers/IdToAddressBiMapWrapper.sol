pragma solidity ^0.5.0;

import "../IdToAddressBiMap.sol";


contract IdToAddressBiMapWrapper {
    IdToAddressBiMap.Data private map;

    function hasId(uint16 id) public view returns (bool) {
        return IdToAddressBiMap.hasId(map, id);
    }

    function hasAddress(address addr) public view returns (bool) {
        return IdToAddressBiMap.hasAddress(map, addr);
    }

    function getAddressAt(uint16 id) public view returns (address) {
        return IdToAddressBiMap.getAddressAt(map, id);
    }

    function getId(address addr) public view returns (uint16) {
        return IdToAddressBiMap.getId(map, addr);
    }

    function insert(uint16 id, address addr) public returns (bool) {
        return IdToAddressBiMap.insert(map, id, addr);
    }
}
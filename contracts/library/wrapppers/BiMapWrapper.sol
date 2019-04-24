pragma solidity ^0.5.0;

import "../BiMap.sol";


contract BiMapWrapper {
    BiMap.Data private map;

    function hasId(uint16 id) public view returns (bool) {
        return BiMap.hasId(map, id);
    }

    function hasAddress(address addr) public view returns (bool) {
        return BiMap.hasAddress(map, addr);
    }

    function getAddressAt(uint16 id) public view returns (address) {
        return BiMap.getAddressAt(map, id);
    }

    function getId(address addr) public view returns (uint16) {
        return BiMap.getId(map, addr);
    }

    function insert(uint16 id, address addr) public returns (bool) {
        return BiMap.insert(map, id, addr);
    }
    
}
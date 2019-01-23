pragma solidity ^0.5.0;

import "../Merkle.sol";


contract MerkleWrapper {
    
    function checkMembership(
        bytes32 leaf, 
        uint256 index, 
        bytes32 rootHash, 
        bytes memory proof, 
        uint height
    )
        public
        pure
        returns (bool)
    {
        return Merkle.checkMembership(leaf, index, rootHash, proof, height);
    }
}
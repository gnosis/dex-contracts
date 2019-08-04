// TokenStore stores Tokens for applications, which have discrete States increasing with time
pragma solidity ^0.5.0;

import "@gnosis.pm/mock-contract/contracts/MockContract.sol";
import "../StablecoinConverter.sol";


contract StablecoinConverterTestInterface is StablecoinConverter {

    function setNumberTokenToMaxValue() public {
        numTokens = uint16(MAX_TOKENS);
    }
}
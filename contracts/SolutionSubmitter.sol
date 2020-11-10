pragma solidity ^0.5.0;

import "./BatchExchange.sol";
import "@openzeppelin/contracts/ownership/Ownable.sol";

interface GasToken {
    function freeUpTo(uint256 value) external returns (uint256 freed);
}

/** @title SolutionSubmitter - A simple wrapper contract allowing to submit settlements
 * to the BatchExchange contract while saving gas via the GST2 or CHI GasToken
 */
contract SolutionSubmitter is Ownable {
    BatchExchange public exchange;
    GasToken public gasToken;
    uint256 public gasPriceThreshold;

    constructor(
        BatchExchange _exchange,
        GasToken _gasToken,
        uint256 _gasPriceThreshold
    ) public {
        exchange = _exchange;
        setGasToken(_gasToken);
        setGasPriceThreshold(_gasPriceThreshold);
    }

    function setGasToken(GasToken _gasToken) public {
        gasToken = _gasToken;
    }

    function setGasPriceThreshold(uint256 _gasPriceThreshold) public {
        gasPriceThreshold = _gasPriceThreshold;
    }

    /**
     * Allow the owner to execute arbitrary code (e.g. transfer out solution fee rewards from BatchExchange)
     */
    function execute(address target, bytes calldata data) external onlyOwner returns (bool, bytes memory) {
        return target.call(data);
    }

    /**
     * Wrapper around actual solution submission that uses gas tokens for discounts
     */
    function submitSolution(
        uint32 batchId,
        uint256 claimedObjectiveValue,
        address[] memory owners,
        uint16[] memory orderIds,
        uint128[] memory buyVolumes,
        uint128[] memory prices,
        uint16[] memory tokenIdsForPrice
    ) public gasDiscounted returns (uint256) {
        return exchange.submitSolution(batchId, claimedObjectiveValue, owners, orderIds, buyVolumes, prices, tokenIdsForPrice);
    }

    /**
     * Modifier to invoke original method and freeing up to half the maximum gas refund in gas tokens.
     * Logic adjusted from https://1inch-exchange.medium.com/1inch-introduces-chi-gastoken-d0bd5bb0f92b
     */
    modifier gasDiscounted {
        if (tx.gasprice >= gasPriceThreshold) {
            uint256 gasStart = gasleft();
            _;
            uint256 gasSpent = 21000 + gasStart - gasleft() + (16 * msg.data.length);
            gasToken.freeUpTo((gasSpent + 14154) / 41947);
        } else {
            _;
        }
    }
}

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
        BatchExchange exchange_,
        GasToken gasToken_,
        uint256 gasPriceThreshold_
    ) public {
        exchange = exchange_;
        setGasToken(gasToken_);
        setGasPriceThreshold(gasPriceThreshold_);
    }

    function setGasToken(GasToken gasToken_) public onlyOwner {
        gasToken = gasToken_;
    }

    function setGasPriceThreshold(uint256 gasPriceThreshold_) public onlyOwner {
        gasPriceThreshold = gasPriceThreshold_;
    }

    /**
     * @dev Allow the owner to execute arbitrary code (e.g. transfer out solution fee rewards from BatchExchange)
     */
    function execute(address target, bytes calldata data) external onlyOwner returns (bool, bytes memory) {
        // solium-disable-next-line security/no-low-level-calls
        return target.call(data);
    }

    /**
     * @dev Wrapper around actual solution submission that uses gas tokens for discounts
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
     * @dev Modifier to invoke original method and freeing up to half the maximum gas refund in gas tokens.
     * Logic adjusted from https://1inch-exchange.medium.com/1inch-introduces-chi-gastoken-d0bd5bb0f92b
     */
    modifier gasDiscounted {
        if (tx.gasprice >= gasPriceThreshold) {
            uint256 gasStart = gasleft();
            _;
            uint256 gasSpent = 21000 + gasStart - gasleft() + (16 * msg.data.length);
            // The refund is 24k per token and since we can refund up to half of the total gas spent,
            // we should free one gas token for every 48k gas spent. This doesn't account for the cost
            // of freeUpTo itself and this slightly underestimating the amout of tokens to burn. This is
            // fine as we cannot account for other refunds coming from the solution submission intself.
            gasToken.freeUpTo((gasSpent) / 48000);
        } else {
            _;
        }
    }
}

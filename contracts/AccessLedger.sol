// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AccessLedger {
    event AccessPaid(
        address payer,
        string resourceId,
        uint256 amount,
        uint256 timestamp
    );

    function recordAccess(string calldata resourceId, uint256 amount) external {
        emit AccessPaid(msg.sender, resourceId, amount, block.timestamp);
    }
}

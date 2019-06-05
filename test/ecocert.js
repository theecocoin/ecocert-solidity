const truffleAssert = require('truffle-assertions');
const utils = require('./utils.js');

const { BN, constants, expectEvent, shouldFail } = require('openzeppelin-test-helpers');
const { ZERO_ADDRESS } = constants;

const EcoCert = artifacts.require('EcoCert');
const EcoCoin = artifacts.require('mocks/EcoCoin');
const Finance = artifacts.require('mocks/Finance');

var chai = require('chai');
chai.should();
chai.use(require('chai-as-promised'));

const SECONDS_IN_DAY = 86400;

contract('EcoCert', (accounts) => {

    before('deploy EcoCert contract', async () => {
        accountOne = accounts[0];
        accountTwo = accounts[1];
        accountThree = accounts[2];
        ecoCoin = await EcoCoin.new();
        finance = await Finance.new();
        ecoCert = await EcoCert.new();
        await ecoCert.setEcoCoinContract(ecoCoin.address);
        await ecoCert.setFinanceContract(finance.address);
    });
    beforeEach(async () => {
        snapShot = await utils.takeSnapshot();
        snapshotId = snapShot['result'];
    });
    afterEach(async () => {
        await utils.revertToSnapShot(snapshotId);
    });

    describe('grant', function () {
        describe('when granting certificate', function () {
            it('balance of holder is increased', async () => {
                await ecoCert.grant(1, 'https://example.org/1', accountTwo, accountThree);
                (await ecoCert.balanceOf(accountTwo)).should.be.bignumber.equal(new BN(1));
            });
            it('tokenURI is set correctly', async () => {
                await ecoCert.grant(101, 'https://example.org/1', accountTwo, accountThree);
                (await ecoCert.tokenURI(1)).should.be.equal('https://example.org/1');
            });
            it('emits a GrantCertificate event', async () => {
                let tx = await ecoCert.grant(101, 'https://example.org/1', accountTwo, accountThree);
                truffleAssert.eventEmitted(tx, 'GrantCertificate', (ev) => {
                    return ev.id.toNumber() === 1 && ev.uri.toString() === 'https://example.org/1' && ev.value.toNumber() === 101;
                });
            });
            it('reverts when called by account not in granters', async () => {
                await truffleAssert.reverts(ecoCert.grant(101, 'https://example.org/1', accountTwo, accountThree, {from: accountTwo}));
            })
        })
    });

    describe('tokenValue', function () {
        describe('when calling tokenValue on valid certificate id', function () {
            it('the correct value is returned', async () => {
                await ecoCert.grant(101, 'https://example.org/1', accountTwo, accountThree);
                (await ecoCert.tokenValue(1)).should.be.bignumber.equal(new BN(101));
            })
        });
        describe('when calling on invalid certificate id', function () {
            it('call is reverted', async () => {
                await truffleAssert.reverts(ecoCert.tokenValue(1))
            })
        })
    });

    describe('tokenBeneficiary', function () {
        describe('when calling beneficiary on valid certificate id', function () {
            it('the correct address is returned', async () => {
                await ecoCert.grant(101, 'https://example.org/1', accountTwo, accountThree);
                (await ecoCert.tokenBeneficiary(1)).should.be.equal(accountThree);
            })
        });
        describe('when calling on invalid certificate id', function () {
            it('call is reverted', async () => {
                await truffleAssert.reverts(ecoCert.tokenBeneficiary(1));
            })
        })
    });

    describe('tokenHarvestTime', function () {
        describe('when calling on invalid certificate id', function () {
            it('call is reverted', async () => {
                await truffleAssert.reverts(ecoCert.tokenHarvestTime(1));
            })
        })
    });

    describe('harvest', function () {
        describe('when harvesting valid certificate after 1 year', function () {
            it('correct amount is minted for beneficiary', async () => {
                await ecoCert.grant(100, 'https://example.org/1', accountTwo, accountThree);
                utils.advanceTimeAndBlock(12 * 30 * SECONDS_IN_DAY);
                await ecoCert.harvest(1);
                (await ecoCoin.balanceOf.call(accountThree)).should.be.bignumber.equal(new BN(10));
            });
            it('correct amount is minted for dao', async () => {
                await ecoCert.grant(100, 'https://example.org/1', accountTwo, accountThree);
                utils.advanceTimeAndBlock(12 * 30 * SECONDS_IN_DAY);
                await ecoCert.harvest(1);
                (await finance.balance.call()).should.be.bignumber.equal(new BN(90));
            });
            it('emits a CertificateHarvest event', async () => {
                await ecoCert.grant(100, 'https://example.org/1', accountTwo, accountThree);
                utils.advanceTimeAndBlock(12 * 30 * SECONDS_IN_DAY);
                let tx = await ecoCert.harvest(1);
                truffleAssert.eventEmitted(tx, 'CertificateHarvest', (ev) => {
                   return ev.id.toNumber() === 1 && ev.amount.toNumber() === 100
                })
            });
            it('harvest time is updated correctly', async () => {
                await ecoCert.grant(100, 'https://example.org/1', accountTwo, accountThree);
                let startTime = (await ecoCert.tokenHarvestTime.call(1)).valueOf();
                utils.advanceTimeAndBlock(12 * 30 * SECONDS_IN_DAY);
                await ecoCert.harvest(1);
                (await ecoCert.tokenHarvestTime.call(1)).should.be.bignumber.equal(startTime.add(new BN(12 * 30 * SECONDS_IN_DAY)));
            })
        });
        describe('when harvesting invalid certificate id', function () {
            it('call is reverted', async () => {
                await truffleAssert.reverts(ecoCert.harvest(3))
            })
        });
        describe('when harvesting after 6 months', function () {
            it('correct amount is minted for beneficiary', async () => {
                await ecoCert.grant(100, 'https://example.org/1', accountTwo, accountThree);
                utils.advanceTimeAndBlock(6 * 30 * SECONDS_IN_DAY);
                await ecoCert.harvest(1);
                (await ecoCoin.balanceOf.call(accountThree)).should.be.bignumber.equal(new BN(5));
            })
        });
        describe('when harvesting twice after 6 months at the same time', function () {
            it('nothing is minted at second time', async () => {
                await ecoCert.grant(100, 'https://example.org/1', accountTwo, accountThree);
                utils.advanceTimeAndBlock(6 * 30 * SECONDS_IN_DAY);
                await ecoCert.harvest(1);
                await ecoCert.harvest(1);
                (await ecoCoin.balanceOf.call(accountThree)).should.be.bignumber.equal(new BN(5));
            })
        });
        describe('when harvesting twice in a year', function () {
            it('correct amount is minted for beneficiary', async () => {
                await ecoCert.grant(100, 'https://example.org/1', accountTwo, accountThree);
                utils.advanceTimeAndBlock(6 * 30 * SECONDS_IN_DAY);
                await ecoCert.harvest(1);
                utils.advanceTimeAndBlock(6 * 30 * SECONDS_IN_DAY);
                await ecoCert.harvest(1);
                (await ecoCoin.balanceOf.call(accountThree)).should.be.bignumber.equal(new BN(10));
            })
        })
    });

    describe('setEcoCoinContract', function () {
        describe('when operator calls setEcoCoinContract', function () {
            it('call passes', async () => {
                await truffleAssert.passes(ecoCert.setEcoCoinContract(ecoCoin.address));
            })
        });
        describe('when unauthorized calls setEcoCoinContract', async () => {
            it('call reverts', async () => {
                await truffleAssert.reverts(ecoCert.setEcoCoinContract(ecoCoin.address, {from: accountTwo}));
            })
        })
    });

    describe('setFinanceContract', function () {
        describe('when operator calls setFinanceContract', function () {
            it('call passes', async () => {
                await truffleAssert.passes(ecoCert.setFinanceContract(finance.address));
            })
        });
        describe('when unauthorized calls setFinanceContract', async () => {
            it('call reverts', async () => {
                await truffleAssert.reverts(ecoCert.setFinanceContract(finance.address, {from: accountTwo}));
            })
        })
    });

    describe('setTokenValue', function () {
        describe('when calling', function () {
            it('new value is set', async () => {
                await ecoCert.grant(100, 'https://example.org/1', accountOne, accountThree);
                await ecoCert.setTokenValue(1, 20);
                (await ecoCert.tokenValue(1)).should.be.bignumber.equal(new BN(20));
            })
        });
        describe('when calling on invalid token id', function () {
            it('call reverts', async () => {
                await truffleAssert.reverts(ecoCert.setTokenValue(1, 20));
            })
        });
        describe('when calling without GranterRole permission', function () {
            it('call reverts', async () => {
                await ecoCert.grant(100, 'https://example.org/1', accountOne, accountThree);
                await truffleAssert.reverts(ecoCert.setTokenValue(1, 20, {from: accountTwo}));
            })
        })
    });

    describe('setTokenBeneficiary', function () {
        describe('when calling', function () {
            it('new value is set', async () => {
                await ecoCert.grant(100, 'https://example.org/1', accountOne, accountThree);
                await ecoCert.setTokenBeneficiary(1, accountTwo);
                (await ecoCert.tokenBeneficiary(1)).should.be.equal(accountTwo);
            })
        });
        describe('when calling on invalid token id', function () {
            it('call reverts', async () => {
                await truffleAssert.reverts(ecoCert.setTokenBeneficiary(1, accountTwo));
            })
        });
        describe('when calling from other account than owner', function () {
            it('call reverts', async () => {
                await ecoCert.grant(100, 'https://example.org/1', accountOne, accountThree);
                await truffleAssert.reverts(ecoCert.setTokenBeneficiary(1, accountTwo, {from: accountTwo}));
            })
        })
    });

    describe('burn', function () {
        describe('when calling on valid token', function () {
            it('burns the token', async () => {
                await ecoCert.grant(100, 'https://example.org/1', accountOne, accountThree);
                await ecoCert.burn(1, {from: accountOne});
                await truffleAssert.reverts(ecoCert.tokenValue(1));
            })
        });
        describe('when calling without GranterRole', function () {
            it('call reverts', async () => {
                await ecoCert.grant(100, 'https://example.org/1', accountOne, accountThree);
                await truffleAssert.reverts(ecoCert.burn(1, {from: accountTwo}));
            })
        });
        describe('when calling on invalid token id', function () {
            it('call reverts', async () => {
                await truffleAssert.reverts(ecoCert.burn(1));
            })
        })
    });

    describe('setPayoutRate', function () {
        describe('when calling', function () {
            it('changes the payout rate', async () => {
                await ecoCert.setPayoutRate(30);
                (await ecoCert.payoutRate.call()).should.be.bignumber.equal(new BN(30));
            });
            it('gives the changed payout to owner', async () => {
                await ecoCert.setPayoutRate(30);
                await ecoCert.grant(100, 'https://example.org/1', accountTwo, accountThree);
                utils.advanceTimeAndBlock(12 * 30 * SECONDS_IN_DAY);
                await ecoCert.harvest(1);
                (await ecoCoin.balanceOf.call(accountThree)).should.be.bignumber.equal(new BN(30));
            });
            it('gives the changed payout to DAO', async () => {
                await ecoCert.setPayoutRate(30);
                await ecoCert.grant(100, 'https://example.org/1', accountTwo, accountThree);
                utils.advanceTimeAndBlock(12 * 30 * SECONDS_IN_DAY);
                await ecoCert.harvest(1);
                (await finance.balance.call()).should.be.bignumber.equal(new BN(70));
            })
        });
        describe('when calling without GranterRole', function () {
            it('call reverts', async () => {
                await truffleAssert.reverts(ecoCert.setPayoutRate(10, {from: accountTwo}));
            })
        });
        describe('when payout rate is > 100', function () {
            it('call reverts', async () => {
                await truffleAssert.reverts(ecoCert.setPayoutRate(101));
            })
        });
    })

});
const StringUtils = artifacts.require("StringUtils");
const EcoCert = artifacts.require("EcoCert");

module.exports = function(deployer) {
  deployer.deploy(StringUtils);
  deployer.link(StringUtils, EcoCert);
  deployer.deploy(EcoCert);
};

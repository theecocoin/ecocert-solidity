pragma solidity ^0.5.0;

import "openzeppelin-solidity/contracts/token/ERC721/ERC721Full.sol";
import "./GrantRole.sol";
import "./OperatorRole.sol";
import "./StringUtils.sol";
import "./mocks/EcoCoin.sol";
import "./mocks/Finance.sol";

/**
 * @title EcoCert token contract
 *
 * @dev The EcoCert is a ERC721 non-fungible token. It represents tree ownership and
 * interacts with the EcoCoin contract to mint coins according to the implemented harvesting scheme.
 * It is designed to interact with aragon's finance app, too.
 */
contract EcoCert is ERC721Full, GrantRole, OperatorRole {

    event GrantCertificate(uint256 id, address indexed receiver, address indexed beneficiary, string uri, uint256 value);
    event CertificateHarvest(uint256 id, uint256 amount);

    using Counters for Counters.Counter;
    Counters.Counter private _tokenId;

    uint256 private _payoutRate; /// The percentage rate (0-100) of harvested coins that is paid to the EcoCert holder. The other part goes to the DAO's finance app.

    /// Essential data about each granted EcoCert token
    struct EcoCertData {
        uint256 value; /// Amount of coins to be harvested during one year
        address beneficiary; /// Address to send the harvested coins for the owner
        uint256 harvestTime; /// Last harvesting time
    }
    mapping(uint256 => EcoCertData) private _data;

    EcoCoin public _ecoCoin; /// Link to EcoCoin contract
    Finance public _finance; /// Link to DAO's finance app, e.g. from aragon

    constructor()
    ERC721Full(
        "ECO tree certificate",
        "ETC"
    )
    public
    {
        _payoutRate = 10; /// Standard payout rate is 10% for cert owner, 90% for DAO
    }

    /**
     * @dev Set the address of the EcoCoin contract. In case we have to update the EcoCoin contract,
     * this method can be used to keep all certificates valid and work with another contract.
     * @param ecoCoin The address of the EcoCoin contract
     */
    function setEcoCoinContract(EcoCoin ecoCoin) external onlyOperator {
        _ecoCoin = ecoCoin;
    }

    /**
     * @dev Set the address of the finance contract. This should be set to the finance app of the
     * DAO so that harvested coins can be sent to the DAO. The interface of the finance app is
     * interoperable with aragon's finance app, but it should be easy to adapt it to other interfaces.
     * @param finance The address of the finance app.
     */
    function setFinanceContract(Finance finance) external onlyOperator {
        _finance = finance;
    }

    /**
     * @dev Set the payout rate, that determines how much of the harvested coins are paid to
     * the certificate owner. The other part of harvested coins is sent to the DAO (finance).
     * @param payoutRate Percentage to be paid to certificate owners, range 0-100
     */
    function setPayoutRate(uint256 payoutRate) external onlyGranter {
        require(payoutRate <= 100, "EcoCert: set payout rate with invalid parameter");
        _payoutRate = payoutRate;
    }

    /**
     * @dev Get the current payout rate. Range 0-100.
     * @return payout rate.
     */
    function payoutRate() external view returns (uint256) {
        return _payoutRate;
    }

    /**
     * @dev Grant a new eco certificate to receiver address.
     * @param value The amount of coins that can be harvested per year.
     * @param tokenURI URI with additional data about the certificate.
     * @param receiver Address to be the owner of the granted certificate.
     * @param beneficiary Target address for harvested coins of the owner.
     */
    function grant(uint256 value, string calldata tokenURI, address receiver, address beneficiary) external onlyGranter {

        _tokenId.increment();
        uint256 grantedTokenId = _tokenId.current();

        _mint(receiver, grantedTokenId);
        _data[grantedTokenId] = EcoCertData(value, beneficiary, now);
        _setTokenURI(grantedTokenId, tokenURI);

        emit GrantCertificate(grantedTokenId, receiver, beneficiary, tokenURI, value);
    }

    /**
     * @dev Burn an eco certificate.
     * @param tokenId ID of the token to be burnt.
     */
    function burn(uint256 tokenId) external onlyGranter {
        _burn(tokenId);
    }

    /**
     * @dev Set the value of an eco certificate.
     * @param tokenId ID of the token to be changed.
     * @param value The amount of coins that can be harvested per year.
     */
    function setTokenValue(uint256 tokenId, uint256 value) onlyGranter external {
        _setTokenValue(tokenId, value);
    }

    /**
     * @dev Set the beneficiary address of an eco certificate.
     * @param tokenId ID of the token to be changed.
     * @param beneficiary Target address for harvested coins of the owner.
     */
    function setTokenBeneficiary(uint256 tokenId, address beneficiary) external {
        require(ownerOf(tokenId) == msg.sender, "EcoCert: set token beneficiary called from non-owner");
        _setTokenBeneficiary(tokenId, beneficiary);
    }

    /**
     * @dev Returns the value for a given eco certificate ID.
     * @param tokenId ID of the token to query.
     * @return The amount of coins that can be harvested per year.
     */
    function tokenValue(uint256 tokenId) external view returns (uint256) {
        require(_exists(tokenId), "EcoCert: value query for nonexistent token");
        return _data[tokenId].value;
    }

    /**
     * @dev Returns the beneficiary address for a given eco certificate ID.
     * @param tokenId Id of the token to query.
     * @return Target address for harvested coins of the owner.
     */
    function tokenBeneficiary(uint256 tokenId) external view returns (address) {
        require(_exists(tokenId), "EcoCert: beneficiary query for nonexistent token");
        return _data[tokenId].beneficiary;
    }

    /**
     * @dev Returns the last time, coins were harvested for a given eco certificate ID.
     * @param tokenId Id of the token to query.
     * @return Last time (in secs since the epoch) that harvest was called.
     */
    function tokenHarvestTime(uint256 tokenId) external view returns (uint256) {
        require(_exists(tokenId), "EcoCert: harvest time query for nonexistent token");
        return _data[tokenId].harvestTime;
    }

    /**
     * @dev Harvest ECO coins from certificate.
     * First, it calculates the amount of coins that are ready for harvesting. This value depends on
     * the value of the certificate and the time since the last harvest.
     * Then, new coins are minted and distributed to the beneficiary address and the DAO.
     * @param tokenId Id of the token to query.
     */
    function harvest(uint256 tokenId) external {
        require(_exists(tokenId), "EcoCert: harvest for nonexistent token");

        // Determine value since last harvest
        uint256 value = _data[tokenId].value * (now-_data[tokenId].harvestTime) / (60*60*24*30*12);
        // Update harvest time
        _data[tokenId].harvestTime = now;

        // Send coins to certificate beneficiary
        _ecoCoin.mint(_data[tokenId].beneficiary, value * _payoutRate / 100);

        // Send coins to DAC finance app
        uint256 valueForDao = value * (100 - _payoutRate) / 100;
        _ecoCoin.mint(address(this), valueForDao);
        _ecoCoin.approve(address(_finance), valueForDao);
        _finance.deposit(address(_ecoCoin), valueForDao, StringUtils.strConcat("Harvest certificate #", StringUtils.uint2str(tokenId)));

        emit CertificateHarvest(tokenId, value);
    }

    /**
     * @dev Internal function to set the value for a given certificate token.
     * Reverts if the token ID does not exist.
     * @param tokenId uint256 ID of the token to set its value.
     * @param value Value to assign.
     */
    function _setTokenValue(uint256 tokenId, uint256 value) internal {
        require(_exists(tokenId), "EcoCert: value set of nonexistent token");
        _data[tokenId].value = value;
    }

    /**
     * @dev Internal function to set the beneficiary for a given certificate token.
     * Reverts if the token ID does not exist.
     * @param tokenId uint256 ID of the token to set its beneficiary.
     * @param beneficiary Beneficiary address to assign.
     */
    function _setTokenBeneficiary(uint256 tokenId, address beneficiary) internal {
        require(_exists(tokenId), "EcoCert: beneficiary set of nonexistent token");
        _data[tokenId].beneficiary = beneficiary;
    }

}

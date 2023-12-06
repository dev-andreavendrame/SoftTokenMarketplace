// SPDX-License-Identifier: MIT
/* Created by 3Tech Studio
 * @author dev.andreavendrame@gmail.com
 *
 *  _____ _____         _       _____ _             _ _
 * |____ |_   _|       | |     /  ___| |           | (_)
 *     / / | | ___  ___| |__   \ `--.| |_ _   _  __| |_  ___
 *     \ \ | |/ _ \/ __| '_ \   `--. \ __| | | |/ _` | |/ _ \
 * .___/ / | |  __/ (__| | | | /\__/ / |_| |_| | (_| | | (_) |
 * \____/  \_/\___|\___|_| |_| \____/ \__|\__,_|\__,_|_|\___/
 *
 */
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @dev This contract allows an address to claim NFTs stored in the contract itself.
 *
 * The claim is divided into 2 types, called claim events:
 * SimpleClaimEvent and RandomClaimEvent.
 *
 * A claim event is associated to a specific ERC1155 contract and users can claim
 * only NFTs that belong to the same contract in the same claim event.
 * In order to claim (one or more NFTs) in a specific claim event the address
 * must be whitelisted and a number of NFTs needs to be assigned to be claimed in
 * the specified event.
 *
 * ----- Access control -----
 *
 * A contract manager (granted MANAGER_ROLE) can:
 * - whitelist an address to claim N (with N > 0) in a specific claim event;
 * - un-whitelist an address from being able to claim N (with N > 0) in a specific event;
 * - disable permanently a claim event, so nobody will be able to claim through it anymore.
 *
 * The default contract admin (granted DEFAULT_ADMIN_ROLE) can:
 * - Grant the NFTs operator role (NFTS_OPERATOR_ROLE) to allow/revoke the permission
 * of being able to send NFTs to this contract in order to them in claim events.
 *
 * The contract pauser (granted PAUSER_ROLE) can:
 * - Stop and resume in one time all the claim events currently active.
 *
 * ---- Claim events details ----
 *
 * Simple Claim
 *
 * A wallet address that is able to claim in this event type can claim at least
 * 1 ERC1155 (NFT) copy stored in this contract of a specific ERC1155 contract address
 *
 * Random Claim
 *
 * A wallet address that is able to claim in this event type can claim randomly at
 * least 1 ERC1155 (NFT) copy from a specified set of ERC1155 token IDs. These tokens
 * are stored in the contract and come all from the same ERC1155 contract.
 *
 * ---- WARNINGS ----
 *
 * - There are no limitations related to the presence of ERC1155 tokens into the smart
 * contract when creating a new Claim event (if not NFTs are contained in the contract on
 * the claim time the transaction will be simply reverted).
 *
 * - A RandomClaimEvent or a SimpleClaimEvent can be created without having deposited the
 * necessary ERC1155 token(s) into this contract (complementary to the warning above).
 *
 * - If a wallet address tries to claim more ERC1155 tokens than the amount available
 * the result of the claiming will be the claim of all the available tokens.
 *
 * - A wallet address that is whitelisted to claim in a specific event can't claim
 * 0 ERC1155 tokens. In this case the transaction reverts.
 *
 * - A wallet address with the MANAGER_ROLE role can add/remove the permission for
 * a specific wallet address to partecipate in a claim event anytime (this includes the
 * case when a claim event is still running).
 *
 * - Claim events don't have an expiration block (a claim event can run forever).
 */
contract Erc1155Claimer is
    Pausable,
    AccessControl,
    IERC1155Receiver,
    ReentrancyGuard
{
    //------------------------------------------------------------------//
    //---------------------- Contract constants ------------------------//
    //------------------------------------------------------------------//

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    bytes32 public constant NFTS_OPERATOR_ROLE =
        keccak256("NFTS_OPERATOR_ROLE");

    //------------------------------------------------------------------//
    //---------------------- Contract events ---------------------------//
    //------------------------------------------------------------------//

    event UPDATED_SIMPLE_CLAIM_ENTRY(
        uint256 indexed _eventId,
        uint256 indexed _claimableAmount
    );

    event UPDATED_RANDOM_CLAIM_ENTRY(
        uint256 indexed _eventId,
        uint256 indexed _claimableAmount
    );

    event SIMPLE_NFTS_CLAIM(
        address indexed _wallet,
        uint256 indexed _eventId,
        uint256 indexed _claimableAmount
    );

    event RANDOM_NFTS_CLAIM(
        address indexed _wallet,
        uint256 indexed _eventId,
        uint256 indexed _claimableAmount
    );

    event CLAIM_EVENT_CREATED(
        uint256 indexed _eventId,
        ClaimType indexed _eventType,
        address _creator
    );

    //------------------------------------------------------------------//
    //---------------------- Contract storage --------------------------//
    //------------------------------------------------------------------//

    // Counters for different claim event types
    uint256 private _simpleClaimCounter;
    uint256 private _randomClaimCounter;

    // Tracking of active claim events
    uint256[] private _simpleClaimEventsActive;
    uint256[] private _randomClaimEventsActive;

    // Claim events information
    mapping(uint256 => SimpleClaimEvent) public simpleClaimEventDetails;
    mapping(uint256 => RandomClaimEvent) public randomClaimEventDetails;

    // Claim Events entries permissions
    // SimpleClaimEvent.id => wallet address => claimable NFTs amount
    mapping(uint256 => mapping(address => uint256)) public simpleClaimableNfts;
    // RandomClaimEvent.id => wallet address => claimable NFTs amount
    mapping(uint256 => mapping(address => uint256)) public randomClaimableNfts;

    //------------------------------------------------------------------//
    //---------------------- Enumerators and structs -------------------//
    //------------------------------------------------------------------//

    enum ClaimType {
        SIMPLE,
        RANDOM
    }

    struct SimpleClaimEvent {
        uint256 id;
        bool isActive;
        address contractAddress;
        uint256 tokenId;
    }

    struct RandomClaimEvent {
        uint256 id;
        bool isActive;
        address contractAddress;
        uint256[] tokenIds;
    }

    //------------------------------------------------------------------//
    //---------------------- Simple constructor ------------------------//
    //------------------------------------------------------------------//
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _grantRole(PAUSER_ROLE, _msgSender());
        _grantRole(MANAGER_ROLE, _msgSender());
    }

    //------------------------------------------------------------------//
    //---------------------- Claim pause management --------------------//
    //------------------------------------------------------------------//

    /**
     * @dev default OpenZeppelin implementation
     */
    function pause() public onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @dev default OpenZeppelin implementation
     */
    function unpause() public onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    //------------------------------------------------------------------//
    //---------------------- Claim entries management ------------------//
    //------------------------------------------------------------------//

    /**
     * @dev Let a {claimer} address claim a {claimableAmount} number
     * of copies of the NFT included in the {simpleClaimEventId} event.
     *
     * @param simpleClaimEventId ID of the claim event
     * @param claimer address to which set the claimable NFTs amount
     * @param claimableAmount NFT copies to let the user claim
     *
     * Note: the transaction sender can set the {claimableAmount}
     * to 0 in order to revoke the permission of the {claimer}
     * to claim in the specified {simpleClaimEventId} event.
     */
    function setSimpleClaimEntry(
        uint256 simpleClaimEventId,
        address claimer,
        uint256 claimableAmount
    ) external onlyRole(MANAGER_ROLE) {
        // Check if specified ID is still active
        SimpleClaimEvent memory eventDetails = simpleClaimEventDetails[
            simpleClaimEventId
        ];

        require(eventDetails.isActive, "This claim event is not active");
        // Check parameter validity
        require(claimableAmount > 0, "Can't let claim 0 NFT copies");

        simpleClaimableNfts[simpleClaimEventId][claimer] = claimableAmount;

        emit UPDATED_SIMPLE_CLAIM_ENTRY(simpleClaimEventId, claimableAmount);
    }

    /**
     * @dev Add in batch the permission for a specified array of
     * {claimers} addresses to claim a specified {claimableAmounts}
     * number of copies in the {simpleClaimEventId} claim event
     *
     * @param simpleClaimEventId ID of the claim event
     * @param claimers addresses to which set the claimable NFTs amount
     * @param claimableAmounts NFT copies to let the users claim
     *
     * Note: the transaction sender can set the {claimableAmounts}
     * to an array of 0s in order to revoke the permission of the
     * {claimers} to claim in the specified {simpleClaimEventId} event.
     */
    function setBatchSimpleClaimEntries(
        uint256 simpleClaimEventId,
        address[] memory claimers,
        uint256[] memory claimableAmounts
    ) external onlyRole(MANAGER_ROLE) {
        // Check if specified ID is still active
        SimpleClaimEvent memory eventDetails = simpleClaimEventDetails[
            simpleClaimEventId
        ];
        require(eventDetails.isActive, "This claim event is not active");

        require(claimers.length > 0, "Can't have an empty claimers list");
        require(
            claimableAmounts.length == claimers.length,
            "Claimers and amounts don't have the same length"
        );

        uint256 totalClaimableAmount = 0;

        for (uint256 i = 0; i < claimableAmounts.length; i++) {
            // Check parameter validity
            require(claimableAmounts[i] > 0, "Can't let claim 0 NFT copies");

            simpleClaimableNfts[simpleClaimEventId][
                claimers[i]
            ] = claimableAmounts[i];
            totalClaimableAmount = totalClaimableAmount + claimableAmounts[i];
        }

        emit UPDATED_SIMPLE_CLAIM_ENTRY(
            simpleClaimEventId,
            totalClaimableAmount
        );
    }

    /**
     * @dev Let a {claimer} address claim a {claimableAmount} number
     * of copies of the NFTs included in the {randomClaimEventId} event.
     *
     * @param randomClaimEventId ID of the claim event
     * @param claimer address to which set the claimable NFTs amount
     * @param claimableAmount NFT copies to let the user claim
     *
     * Note: the transaction sender can set the {claimableAmount}
     * to 0 in order to revoke the permission of the {claimer} to
     * claim in the specified {randomClaimEventId} event.
     */
    function setRandomClaimEntry(
        uint256 randomClaimEventId,
        address claimer,
        uint256 claimableAmount
    ) external onlyRole(MANAGER_ROLE) {
        // Check if specified ID is still active
        RandomClaimEvent memory eventDetails = randomClaimEventDetails[
            randomClaimEventId
        ];
        require(eventDetails.isActive, "This claim event is not active");
        // Check parameter validity
        require(claimableAmount > 0, "Can't let claim 0 NFT copies");

        // SimpleClaimEvent.id => wallet address => claimable NFTs amount
        randomClaimableNfts[randomClaimEventId][claimer] = claimableAmount;

        emit UPDATED_RANDOM_CLAIM_ENTRY(randomClaimEventId, claimableAmount);
    }

    /**
     * @dev Add in batch the permission for a specified array of
     * {claimers} addresses to claim a specified {claimableAmounts}
     * number of copies in the {randomClaimEventId} claim event
     *
     * @param randomClaimEventId ID of the claim event
     * @param claimers addresses to let be able to claim in this event
     * @param claimableAmounts NFT copies to let the users claim
     *
     * Note: the transaction sender can set the {claimableAmount}
     * to 0 in order to revoke the permission of the {claimer} to
     * claim in the specified {randomClaimEventId} event.
     */
    function setBatchRandomClaimEntries(
        uint256 randomClaimEventId,
        address[] memory claimers,
        uint256[] memory claimableAmounts
    ) external onlyRole(MANAGER_ROLE) {
        // Check if specified ID is still active
        RandomClaimEvent memory eventDetails = randomClaimEventDetails[
            randomClaimEventId
        ];
        require(eventDetails.isActive, "This claim event is not active");

        require(claimers.length > 0, "Can't have an empty claimers list");
        require(
            claimableAmounts.length == claimers.length,
            "Claimers and amounts don't have the same length"
        );

        uint256 totalClaimableAmount = 0;

        for (uint256 i = 0; i < claimableAmounts.length; i++) {
            // Check parameter validity
            require(claimableAmounts[i] > 0, "Can't let claim 0 NFT copies");

            randomClaimableNfts[randomClaimEventId][
                claimers[i]
            ] = claimableAmounts[i];
            totalClaimableAmount = totalClaimableAmount + claimableAmounts[i];
        }

        emit UPDATED_RANDOM_CLAIM_ENTRY(
            randomClaimEventId,
            totalClaimableAmount
        );
    }

    /**
     * @dev Disable a claim event so the users will be able no
     * longer able to claim other NFTs through it (PERMANENT OPERATION).
     *
     * @param claimType one value in the ClaimType enum set
     * @param claimEventId ID of the event to disable
     *
     * Note: reverts if a wrong {claimType} is provided or if the
     * {claimEventId} doesn't exist.
     */
    function disableClaimEvent(ClaimType claimType, uint256 claimEventId)
        external
        onlyRole(MANAGER_ROLE)
    {
        if (claimType == ClaimType.SIMPLE) {
            simpleClaimEventDetails[claimEventId].isActive = false;
            _removeSimpleClaimActiveEvent(claimEventId);
        } else if (claimType == ClaimType.RANDOM) {
            randomClaimEventDetails[claimEventId].isActive = false;
            _removeRandomClaimActiveEvent(claimEventId);
        } else {
            revert("No valid 'Claim type provided");
        }
    }

    /**
     * @dev Create a new Simple Claim event.
     * Through this event allowed addresses will be able to claim
     * one or more copies of a specific ERC1155 NFT.
     *
     * @param contractAddress address of the ERC1155 contract from
     * which the NFT comes from.
     * @param tokenId ID of the NFT that will be claimable.
     */
    function createSimpleClaimEvent(address contractAddress, uint256 tokenId)
        external
        onlyRole(MANAGER_ROLE)
    {
        uint256 currentEventId = _simpleClaimCounter++;

        SimpleClaimEvent memory newClaimEvent = SimpleClaimEvent(
            currentEventId,
            true,
            contractAddress,
            tokenId
        );
        // Add event details
        simpleClaimEventDetails[currentEventId] = newClaimEvent;
        // Add event to active list
        _simpleClaimEventsActive.push(currentEventId);

        emit CLAIM_EVENT_CREATED(
            currentEventId,
            ClaimType.SIMPLE,
            _msgSender()
        );
    }

    /**
     * @dev Create a new Random Claim event.
     * Through this event allowed addresses will be able to claim
     * one or more copies from a specific ERC1155 NFTs set.
     * The NFTs set is made up of different token IDs that come
     * from the same ERC1155 contract.
     *
     * @param contractAddress address of the ERC1155 contract
     * @param tokenIds IDs of the token that will be claimed
     */
    function createRandomClaimEvent(
        address contractAddress,
        uint256[] memory tokenIds
    ) external onlyRole(MANAGER_ROLE) {
        uint256 currentEventId = _randomClaimCounter++;

        require(tokenIds.length > 0, "Can't create an empty claimable set");

        RandomClaimEvent memory newClaimEvent = RandomClaimEvent(
            currentEventId,
            true,
            contractAddress,
            tokenIds
        );
        // Add event details
        randomClaimEventDetails[currentEventId] = newClaimEvent;
        // Add event to active list
        _randomClaimEventsActive.push(currentEventId);

        emit CLAIM_EVENT_CREATED(
            currentEventId,
            ClaimType.RANDOM,
            _msgSender()
        );
    }

    //------------------------------------------------------------------//
    //---------------------- Claim functions logic ---------------------//
    //------------------------------------------------------------------//

    /**
     * @dev Let the transaction sender to claim the NFTs that he is allowed
     * to do in a specified claim event.
     *
     * @param claimType type of claim event. A value of type {ClaimType}
     * @param claimId ID of the claim event
     *
     * @return the number of NFTs claimed
     *
     * Note: depending on the current NFTs available in the contract,
     * the number of claimed tokens can be between 0 and the number
     * of copies that the transaction sender is entitled to claim.
     * Reverts if the {claimType} is invalid.
     */
    function claim(ClaimType claimType, uint256 claimId)
        public
        whenNotPaused
        nonReentrant
        returns (uint256)
    {
        if (claimType == ClaimType.SIMPLE) {
            uint256 claimed = _simpleClaim(claimId, _msgSender());
            emit SIMPLE_NFTS_CLAIM(_msgSender(), claimId, claimed);
            return claimed;
        } else if (claimType == ClaimType.RANDOM) {
            uint256 claimed = _randomClaim(claimId, _msgSender());
            emit RANDOM_NFTS_CLAIM(_msgSender(), claimId, claimed);
            return claimed;
        } else {
            revert("No valid Claim type speficied");
        }
    }

    /**
     * @dev claim NFTs through a simple claim event
     *
     * @param claimId ID of the Simple Claim event
     * @param claimer address of the claimer
     *
     * @return the amount of claimed NFTs
     */
    function _simpleClaim(uint256 claimId, address claimer)
        private
        returns (uint256)
    {
        SimpleClaimEvent memory eventDetails = simpleClaimEventDetails[claimId];

        require(eventDetails.isActive, "The claim event is ended");

        // Check if address is entitled to claim something
        uint256 nftsToClaim = simpleClaimableNfts[claimId][claimer];
        require(nftsToClaim > 0, "You don't have any NFT to claim");

        ERC1155 erc1155instance = ERC1155(eventDetails.contractAddress);
        uint256 contractNftsBalance = erc1155instance.balanceOf(
            address(this),
            eventDetails.tokenId
        );

        if (contractNftsBalance == 0) {
            revert("No NFTs in the smart contract to claim");
        }

        uint256 claimableNfts = 0;

        if (nftsToClaim > contractNftsBalance) {
            // Can't claim all the assigned NFTs
            claimableNfts = contractNftsBalance;
            simpleClaimableNfts[claimId][claimer] =
                nftsToClaim -
                contractNftsBalance;
        } else {
            claimableNfts = nftsToClaim;
            simpleClaimableNfts[claimId][claimer] = 0;
        }

        erc1155instance.safeTransferFrom(
            address(this),
            claimer,
            eventDetails.tokenId,
            claimableNfts,
            "0x00"
        );

        return claimableNfts;
    }

    /**
     * @dev claim NFTs through a random claim event
     *
     * @param claimId ID of the Simple Claim event
     * @param claimer address of the claimer
     *
     * @return the amount of claimed NFTs
     */
    function _randomClaim(uint256 claimId, address claimer)
        private
        returns (uint256)
    {
        RandomClaimEvent memory eventDetails = randomClaimEventDetails[claimId];
        uint256 uniqueIdsLength = eventDetails.tokenIds.length;

        require(eventDetails.isActive, "The claim event is ended");

        // Check if address is entitled to claim something
        uint256 nftsToClaim = randomClaimableNfts[claimId][claimer];
        require(nftsToClaim > 0, "You don't have any NFT to claim");

        ERC1155 erc1155instance = ERC1155(eventDetails.contractAddress);

        uint256[] memory availableAmounts = new uint256[](uniqueIdsLength);

        // Check balances of the NFTs by ID
        for (uint256 i = 0; i < uniqueIdsLength; i++) {
            availableAmounts[i] = erc1155instance.balanceOf(
                address(this),
                eventDetails.tokenIds[i]
            );
        }

        // Calculate the distribution of the claimable NFTs
        uint256[] memory claimableDistribution = _getDistributionValues(
            availableAmounts,
            nftsToClaim
        );

        require(
            claimableDistribution.length == uniqueIdsLength,
            "Error getting NFTs distribution"
        );

        // Calculate how many NFTs will be distributed
        uint256 claimedNfts = 0;
        for (uint256 i = 0; i < claimableDistribution.length; i++) {
            claimedNfts = claimedNfts + claimableDistribution[i];
        }

        require(
            claimedNfts <= nftsToClaim,
            "Error defining the distribution of the NFTs to claim"
        );

        // Update claimable NFTs to prevent reentrancy attack
        randomClaimableNfts[claimId][claimer] = nftsToClaim - claimedNfts;

        // Claim the Nfts
        erc1155instance.safeBatchTransferFrom(
            address(this),
            claimer,
            eventDetails.tokenIds,
            claimableDistribution,
            "0x00"
        );

        return claimedNfts;
    }

    //------------------------------------------------------------------//
    //---------------------- Pseudo-random generator functions ---------//
    //------------------------------------------------------------------//

    /**
     * @dev This function calculate the amounts of NFTs to claim given a specific
     * distribution set.
     *
     * @param availableAmounts amounts of copies of each NFT in claimable set.
     * The length of the array is a assumed to be greater of equal to 1.
     * @param amountToClaim total NFTs copies to select in the 'availableAmounts' set.
     * It is assumed to be greater of equal to 1.
     *
     * @return An array representing the distributed NFT amounts.
     * The length of the result is the same of the 'availableAmounts' parameter and
     * where the result array values, result[i] are values between in the range [0, availableAmounts[i]]
     * If 'amountToClaim' is > than the sum of the 'availableAmounts' array values the result will
     * be the 'availableAmounts' paraters itself.
     *
     * Note the sum of the available amounts can be lower than the parameter 'amountToClaim'.
     * We can have values in the 'availableAmounts' array equal to 0.
     * We know that the result distrubution is not a fair distribution,
     * but it's fine as it is calculated here for our aims.
     */
    function _getDistributionValues(
        uint256[] memory availableAmounts,
        uint256 amountToClaim
    ) private view returns (uint256[] memory) {
        uint256[] memory nftsToClaim;
        uint256[] memory currentAvailableAmounts = availableAmounts;
        uint256 nftsLeft = amountToClaim; // Nfts left to distribute

        (nftsToClaim, nftsLeft, currentAvailableAmounts) = _getRandomValues(
            availableAmounts,
            amountToClaim
        );

        (nftsToClaim, nftsLeft, currentAvailableAmounts) = _averageDistribution(
            nftsToClaim,
            nftsLeft,
            currentAvailableAmounts
        );

        (nftsToClaim, nftsLeft, currentAvailableAmounts) = _finalDistribution(
            nftsToClaim,
            nftsLeft,
            currentAvailableAmounts
        );

        return nftsToClaim;
    }

    /**
     * @dev starting from an 'availableAmounts' array where every value is
     * a number greater or equal to 0, it returns a new array of the same length
     * where each entry is generated "randomly" and its value is in the
     * range [0, availableAmounts[i]] (i is the i-th element of the array).
     *
     * @param availableAmounts array that represents the available values that
     * need to be distributed randomly in the result array
     * @param amountToClaim the maximum possible number obtainable, that
     * corresponds to the sum of the values added to the 'availableAmounts'
     * array at the end of the function
     *
     * @return an array of the same length of the 'availableAmounts' parameter
     * where the sum of all its values is less than or equal to the paramter
     * 'amountToClaim' and each i-th value of result array is less than or equal to
     * the i-th value of the 'availableAmounts' array
     *
     * Note: if the 'availableAmounts' array has only 0 values the result of the
     * function will corresponds to the an array with the same values.
     */
    function _getRandomValues(
        uint256[] memory availableAmounts,
        uint256 amountToClaim
    )
        private
        view
        returns (
            uint256[] memory,
            uint256,
            uint256[] memory
        )
    {
        uint256[] memory nftsToClaim = new uint256[](availableAmounts.length);
        uint256[] memory currentAvailableAmounts = availableAmounts;
        uint256 nftsLeft = amountToClaim;

        // Calculate the initial seed
        uint256 seed = uint256(
            keccak256(abi.encodePacked(block.timestamp, msg.sender, gasleft()))
        );

        // Initialization
        for (uint256 i = 0; i < availableAmounts.length; i++) {
            nftsToClaim[i] = 0;
        }

        // Calculate starting point to choose the first NFT in the available amounts
        uint256 index = seed % availableAmounts.length;
        // Initial value to get a random amount
        uint256 maxRandom = 0;
        if (amountToClaim < availableAmounts.length) {
            maxRandom = 1;
        } else {
            maxRandom = amountToClaim / availableAmounts.length + 1;
        }

        for (uint256 i = 0; i < availableAmounts.length; i++) {
            // Reset index if max length reached
            index = index % availableAmounts.length;

            require(index < 5 && index >= 0, "Problemi con l'indice");

            // Operations
            uint256 randomNumber = (seed % maxRandom) + 1;
            uint256 nftsToAssign = 0;
            if (nftsLeft >= randomNumber) {
                nftsToAssign = randomNumber;
                if (nftsToAssign <= availableAmounts[index]) {
                    // Enough NFTs to distribute of this type
                    nftsToClaim[index] = nftsToAssign;
                    availableAmounts[index] =
                        availableAmounts[index] -
                        nftsToAssign;
                    nftsLeft = nftsLeft - nftsToAssign;
                } else {
                    nftsToClaim[index] = availableAmounts[index];
                    nftsLeft = nftsLeft - availableAmounts[index];
                    availableAmounts[index] = 0;
                }
            } else {
                if (nftsLeft <= availableAmounts[index]) {
                    nftsToClaim[index] = nftsLeft;
                    availableAmounts[index] =
                        availableAmounts[index] -
                        nftsLeft;
                    return (nftsToClaim, 0, availableAmounts);
                } else {
                    nftsToClaim[i] = availableAmounts[index];
                    nftsLeft = nftsLeft - availableAmounts[index];
                    availableAmounts[index] = 0;
                }
            }

            // Recalculate seed & index
            seed = uint256(keccak256(abi.encodePacked(seed, gasleft())));
            index = index + 1;
        }

        uint256 totalClaimable = 0;
        uint256 totalClaimed = 0;
        for (uint256 i = 0; i < availableAmounts.length; i++) {
            totalClaimable = totalClaimable + availableAmounts[i];
            totalClaimed = totalClaimed + nftsToClaim[i];
        }

        require(
            nftsLeft + totalClaimed == amountToClaim,
            "Error with distributing random NFTs, try again"
        );

        return (nftsToClaim, nftsLeft, currentAvailableAmounts);
    }

    /**
     * @dev starting from an 'availableAmounts' array where every value is
     * a number greater or equal to 0, it returns a new array of the same length
     * where each entry is generated "randomly" and its value is in the
     * range [0, availableAmounts[i]] (i is the i-th element of the array).
     *
     * @param currentDistribution array that represent an initial number distribution
     * @param availableAmounts array that represents the available values that
     * need to be distributed
     * @param amountToClaim the maximum possible number obtainable, that corresponds
     * to the sum of the  values added to the 'currentDistribution' array
     * at the end of the function
     *
     * @return an array of the same length of the 'availableAmounts', where each value i-th
     * of it is less than or equal to the sum of currentDistribution[i] + availableAmounts[i]
     * and the total sum of the values in the returned array is less that or equal to
     * the sum of the values in the 'currentDistribution' parameter + 'amountToClaim'.
     *
     * Note: if the 'availableAmounts' array has only 0 values the result of the
     * function will corresponds to the an array with the same values.
     */
    function _averageDistribution(
        uint256[] memory currentDistribution,
        uint256 amountToClaim,
        uint256[] memory availableAmounts
    )
        private
        pure
        returns (
            uint256[] memory,
            uint256,
            uint256[] memory
        )
    {
        // Calculate an average-like value to use in the next distribution steps
        uint256 fakeAverage = 0;
        uint256[] memory nftsToClaim = currentDistribution;
        uint256[] memory currentAvailableAmounts = availableAmounts;
        uint256 nftsLeft = amountToClaim;

        uint256 initialAvailableAmount = 0;
        uint256 initialDistributedAmount = 0;

        for (uint256 i = 0; i < currentAvailableAmounts.length; i++) {
            initialAvailableAmount =
                initialAvailableAmount +
                availableAmounts[i];
            initialDistributedAmount =
                initialDistributedAmount +
                currentDistribution[i];
        }

        for (uint256 i = 0; i < currentAvailableAmounts.length; i++) {
            fakeAverage = fakeAverage + currentAvailableAmounts[i];
        }

        fakeAverage = fakeAverage / currentAvailableAmounts.length + 1;

        for (uint256 i = 0; i < currentAvailableAmounts.length; i++) {
            if (nftsLeft >= fakeAverage) {
                if (fakeAverage >= currentAvailableAmounts[i]) {
                    nftsToClaim[i] =
                        nftsToClaim[i] +
                        currentAvailableAmounts[i];
                    nftsLeft = nftsLeft - currentAvailableAmounts[i];
                    currentAvailableAmounts[i] = 0;
                } else {
                    nftsToClaim[i] = nftsToClaim[i] + fakeAverage;
                    currentAvailableAmounts[i] =
                        currentAvailableAmounts[i] -
                        fakeAverage;
                    nftsLeft = nftsLeft - fakeAverage;
                }
            } else {
                if (nftsLeft >= currentAvailableAmounts[i]) {
                    nftsToClaim[i] =
                        nftsToClaim[i] +
                        currentAvailableAmounts[i];
                    nftsLeft = nftsLeft - currentAvailableAmounts[i];
                    currentAvailableAmounts[i] = 0;
                } else {
                    nftsToClaim[i] = nftsToClaim[i] + nftsLeft;
                    nftsLeft = 0;
                    return (nftsToClaim, nftsLeft, currentAvailableAmounts);
                }
            }
        }

        // Debug
        uint256 finalAvailableAmount = 0;
        uint256 finalDistributedAmount = 0;
        for (uint256 i = 0; i < currentAvailableAmounts.length; i++) {
            finalDistributedAmount = finalDistributedAmount + nftsToClaim[i];
            finalAvailableAmount =
                finalAvailableAmount +
                currentAvailableAmounts[i];
        }

        require(
            initialDistributedAmount + amountToClaim ==
                nftsLeft + finalDistributedAmount,
            "Wrong distribution"
        );

        return (nftsToClaim, nftsLeft, currentAvailableAmounts);
    }

    /**
     * @dev starting from an 'currentAvailableAmounts' array where every value is
     * a number greater or equal to 0, it returns a new array of the same length
     * where each entry is generated "randomly" and its value is in the
     * range [0, currentAvailableAmounts[i]] (i is the i-th element of the array).
     *
     * @param currentDistribution array that represent an initial number distribution
     * @param currentAvailableAmounts array that represents the available values that
     * need to be distributed
     * @param amountToClaim the maximum possible number obtainable, that corresponds
     * to the sum of the  values added to the 'currentDistribution' array
     * at the end of the function
     *
     * @return an array of the same length of the 'currentAvailableAmounts', where each value i-th
     * of it is less than or equal to the sum of currentDistribution[i] + currentAvailableAmounts[i]
     * and the total sum of the values in the returned array is less that or equal to
     * the sum of the values in the 'currentDistribution' parameter + 'amountToClaim'.
     *
     * Note: if the 'currentAvailableAmounts' array has only 0 values the result of the
     * function will corresponds to the an array with the same values.
     */
    function _finalDistribution(
        uint256[] memory currentDistribution,
        uint256 amountToClaim,
        uint256[] memory currentAvailableAmounts
    )
        private
        pure
        returns (
            uint256[] memory,
            uint256,
            uint256[] memory
        )
    {
        uint256[] memory nftsToClaim = currentDistribution;
        uint256[] memory remainingAvailableNfts = currentAvailableAmounts;
        uint256 nftsLeft = amountToClaim;
        // Final step (distribution of the remaining NFTs)
        if (nftsLeft > 0) {
            for (uint256 i = 0; i < remainingAvailableNfts.length; i++) {
                if (remainingAvailableNfts[i] >= nftsLeft) {
                    nftsToClaim[i] = nftsToClaim[i] + nftsLeft;
                    remainingAvailableNfts[i] =
                        remainingAvailableNfts[i] -
                        nftsLeft;
                    return (nftsToClaim, 0, remainingAvailableNfts);
                } else {
                    nftsToClaim[i] = nftsToClaim[i] + remainingAvailableNfts[i];
                    nftsLeft = nftsLeft - remainingAvailableNfts[i];
                    remainingAvailableNfts[i] = 0;
                }
            }
            return (nftsToClaim, nftsLeft, remainingAvailableNfts);
        } else {
            return (nftsToClaim, nftsLeft, remainingAvailableNfts);
        }
    }

    //------------------------------------------------------------------//
    //---------------------- Utilities ---------------------------------//
    //------------------------------------------------------------------//

    /**
     * @dev Get the current active Simple Claim events
     *
     * @return an array of IDs that represents the current Simple Claim
     * active events. The result can be an empty array.
     */
    function getSimpleClaimEventsActive()
        external
        view
        returns (uint256[] memory)
    {
        return _simpleClaimEventsActive;
    }

    /**
     * @dev Get the current active Random Claim events
     *
     * @return an array of IDs that represents the current Random Claim
     * active events. The result can be an empty array.
     */
    function getRandomClaimEventsActive()
        external
        view
        returns (uint256[] memory)
    {
        return _randomClaimEventsActive;
    }

    /**
     * @dev Remove a Simple Claim event from the active list
     *
     * @param orderId ID of the event active Simple Claim event
     *
     * Note: reverts if the specified ID does not correspond to
     * an active event.
     */
    function _removeSimpleClaimActiveEvent(uint256 orderId) private {
        // Delete the order from the active Ids list
        uint256 activeOrdersNumber = _simpleClaimEventsActive.length;
        uint256 orderIndex = 0;
        bool idFound = false;

        for (uint256 i = 0; i < activeOrdersNumber; i++) {
            if (_simpleClaimEventsActive[i] == orderId) {
                orderIndex = i;
                idFound = true;
            }
        }

        require(idFound, "Simple Claim event not in the active list");

        if (orderIndex != activeOrdersNumber - 1) {
            // Need to swap the order to delete with the last one and procede as above
            _simpleClaimEventsActive[orderIndex] = _simpleClaimEventsActive[
                activeOrdersNumber - 1
            ];
        }

        _simpleClaimEventsActive.pop();
    }

    /**
     * @dev Removes a Random Claim event from the active list
     *
     * @param orderId ID of the event active Random Claim event
     *
     * Note: reverts if the specified ID does not correspond to
     * an active event.
     */
    function _removeRandomClaimActiveEvent(uint256 orderId) private {
        // Delete the order from the active Ids list
        uint256 activeOrdersNumber = _randomClaimEventsActive.length;
        uint256 orderIndex = 0;
        bool idFound = false;

        for (uint256 i = 0; i < activeOrdersNumber; i++) {
            if (_randomClaimEventsActive[i] == orderId) {
                orderIndex = i;
                idFound = true;
            }
        }

        require(idFound, "Random Claim event not in the active list");

        if (orderIndex != activeOrdersNumber - 1) {
            // Need to swap the order to delete with the last one and procede as above
            _randomClaimEventsActive[orderIndex] = _randomClaimEventsActive[
                activeOrdersNumber - 1
            ];
        }

        _randomClaimEventsActive.pop();
    }

    //------------------------------------------------------------------//
    //---------------------- ERC1155 Receiver implementation -----------//
    //------------------------------------------------------------------//

    /**
     * @dev default implementation plus a check to verify
     * that the 'operator' is allowed to send NFTs to this contract
     */
    function onERC1155Received(
        address operator,
        address from,
        uint256 id,
        uint256 value,
        bytes calldata data
    ) public view returns (bytes4) {
        require(
            hasRole(NFTS_OPERATOR_ROLE, operator),
            "The contract can't receive NFTs from this operator"
        );

        return
            bytes4(
                keccak256(
                    "onERC1155Received(address,address,uint256,uint256,bytes)"
                )
            );
    }

    /**
     * @dev default implementation plus a check to verify
     * that the 'operator' is allowed to send NFTs to this contract
     */
    function onERC1155BatchReceived(
        address operator,
        address from,
        uint256[] calldata ids,
        uint256[] calldata values,
        bytes calldata data
    ) public view returns (bytes4) {
        require(
            hasRole(NFTS_OPERATOR_ROLE, operator),
            "The contract can't receive NFTs from this operator"
        );

        return
            bytes4(
                keccak256(
                    "onERC1155BatchReceived(address,address,uint256[],uint256[],bytes)"
                )
            );
    }
}

const { expect, assert } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, mine, time } = require("@nomicfoundation/hardhat-network-helpers");

const anyValue = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("Claim ERC1155 - Test", function () {
	const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";
	const MANAGER_ROLE = "0x241ecf16d79d0f8dbfb92cbc07fe17840425976cf0667f022fe9877caa831b08";
	const NFTS_OPERATOR_ROLE = "0x4c632552d0d56a86626e1e6c02a1d2ee49630de09eb2aee0e6a3daead58a6b2f";

	// Tokens to mint and amounts
	const BACKPACK_ID = 0;
	const BACKPACKS_AMOUNT = 100;
	const AVATAR_ID = 1;
	const AVATARS_AMOUNT = 30;
	const MAX_CONCURRENT_EVENTS_PER_TYPE = 50;

	async function deployContractsFixture() {
		// Define process actors
		const [deployer, userOne, userTwo] = await ethers.getSigners();

		// Deploy the Claimer contract
		const Erc1155Claimer = await ethers.getContractFactory("Erc1155Claimer");
		const erc1155ClaimerInstance = await Erc1155Claimer.deploy(MAX_CONCURRENT_EVENTS_PER_TYPE);
		await erc1155ClaimerInstance.deployed();

		// Deploy the Erc1155 contract
		const SimpleErc1155 = await ethers.getContractFactory("SimpleErc1155");
		const simpleErc1155Instante = await SimpleErc1155.deploy(deployer.address);
		await simpleErc1155Instante.deployed();

		return {
			deployer,
			userOne,
			userTwo,
			erc1155ClaimerInstance,
			simpleErc1155Instante,
		};
	}

	async function mintErc1155ToDeployerFixture() {
		const { deployer, simpleErc1155Instante } = await loadFixture(deployContractsFixture);

		const tokenIds = [BACKPACK_ID, AVATAR_ID];
		const tokenAmounts = [BACKPACKS_AMOUNT, AVATARS_AMOUNT];

		await simpleErc1155Instante.mintBatch(deployer.address, tokenIds, tokenAmounts, "0x00");
	}

	async function mintErc1155ToUserFixture() {
		const { userOne, simpleErc1155Instante } = await loadFixture(deployContractsFixture);

		const tokenIds = [BACKPACK_ID, AVATAR_ID];
		const tokenAmounts = [BACKPACKS_AMOUNT, AVATARS_AMOUNT];

		await simpleErc1155Instante.mintBatch(userOne.address, tokenIds, tokenAmounts, "0x00");
	}

	it("Should allow to create the contract", async function () {
		const { erc1155ClaimerInstance } = await loadFixture(deployContractsFixture);
		expect(erc1155ClaimerInstance.address).to.not.equal(ethers.constants.AddressZero);
	});

	/**
	 * --------------------------------------------------------------------
	 * -------------------- CONTRACT MANAGEMENT FUNCTIONS -----------------
	 * --------------------------------------------------------------------
	 */

	it("Should let the deployer to pause the contract", async function () {
		const { deployer, erc1155ClaimerInstance } = await loadFixture(deployContractsFixture);
		await expect(erc1155ClaimerInstance.connect(deployer).pause()).to.not.be.reverted;
	});

	it("Should NOT let a general wallet to pause the contract", async function () {
		const { userOne, erc1155ClaimerInstance } = await loadFixture(deployContractsFixture);
		await expect(erc1155ClaimerInstance.connect(userOne).pause()).to.be.reverted;
	});

	it("Should let the deployer to unpause the contract", async function () {
		const { deployer, erc1155ClaimerInstance } = await loadFixture(deployContractsFixture);
		await erc1155ClaimerInstance.connect(deployer).pause();
		await expect(erc1155ClaimerInstance.connect(deployer).unpause()).to.not.be.reverted;
	});

	it("Should NOT let a general address to unpause the contract", async function () {
		const { deployer, userOne, erc1155ClaimerInstance } = await loadFixture(deployContractsFixture);
		await erc1155ClaimerInstance.connect(deployer).pause();
		await expect(erc1155ClaimerInstance.connect(userOne).unpause()).to.be.reverted;
	});

	/**
	 * --------------------------------------------------------------------
	 * -------------------- MANAGE WHITELISTED NFTS SENDERS ---------------
	 * --------------------------------------------------------------------
	 */

	it("Should NOT let a general wallet to grant the NFTS_OPERATOR_ROLE role to another wallet", async function () {
		const { userOne, erc1155ClaimerInstance } = await loadFixture(deployContractsFixture);

		await expect(erc1155ClaimerInstance.connect(userOne).grantRole(NFTS_OPERATOR_ROLE, userOne.address)).to.be.reverted;
	});

	it("Should let a wallet WITH the MANAGER_ROLE role to revoke a NFTS_OPERATOR_ROLE role from a wallet", async function () {
		const { userOne, erc1155ClaimerInstance } = await loadFixture(deployContractsFixture);

		await expect(erc1155ClaimerInstance.revokeRole(NFTS_OPERATOR_ROLE, userOne.address)).to.not.be.reverted;
	});

	it("Should let the deployer to add a whitelisted wallet", async function () {
		const { deployer, userOne, erc1155ClaimerInstance } = await loadFixture(deployContractsFixture);

		await expect(erc1155ClaimerInstance.connect(deployer).grantRole(NFTS_OPERATOR_ROLE, userOne.address)).to.not.be
			.reverted;
	});

	it("Should not let a whitelisted wallet to send NFTs to the claimer contract", async function () {
		const { userOne, erc1155ClaimerInstance, simpleErc1155Instante } = await loadFixture(deployContractsFixture);
		await loadFixture(mintErc1155ToUserFixture);

		await expect(
			simpleErc1155Instante
				.connect(userOne)
				.safeTransferFrom(userOne.address, erc1155ClaimerInstance.address, BACKPACK_ID, BACKPACKS_AMOUNT, "0x00")
		).to.be.revertedWith("The contract can't receive NFTs from this operator");
	});

	it("Should not let a wallet WITHOUT the MANAGER_ROLE role to create a new Simple Claim event", async function () {
		const { userOne, erc1155ClaimerInstance, simpleErc1155Instante } = await loadFixture(deployContractsFixture);

		await expect(
			erc1155ClaimerInstance.connect(userOne).createSimpleClaimEvent(simpleErc1155Instante.address, BACKPACK_ID)
		).to.be.reverted;
	});

	it("Should let a wallet WITH the MANAGER_ROLE role to create a new Simple Claim event", async function () {
		const { userOne, erc1155ClaimerInstance, simpleErc1155Instante } = await loadFixture(deployContractsFixture);

		await erc1155ClaimerInstance.grantRole(MANAGER_ROLE, userOne.address);

		await expect(
			erc1155ClaimerInstance.connect(userOne).createSimpleClaimEvent(simpleErc1155Instante.address, BACKPACK_ID)
		).to.not.be.reverted;

		for (let i = 0; i < 49; i++) {
			await erc1155ClaimerInstance.connect(userOne).createSimpleClaimEvent(simpleErc1155Instante.address, BACKPACK_ID);
		}

		await expect(
			erc1155ClaimerInstance.connect(userOne).createSimpleClaimEvent(simpleErc1155Instante.address, BACKPACK_ID)
		).to.be.reverted;
	});

	it("Should not let a wallet WITHOUT the MANAGER_ROLE role to create a new Random Claim event", async function () {
		const { userOne, erc1155ClaimerInstance, simpleErc1155Instante } = await loadFixture(deployContractsFixture);

		const randomTokenIds = [1, 2, 0, 5, 32, 51];

		await expect(
			erc1155ClaimerInstance.connect(userOne).createRandomClaimEvent(simpleErc1155Instante.address, randomTokenIds)
		).to.be.reverted;
	});

	it("Should let a wallet WITH the MANAGER_ROLE role to create a new Random Claim event", async function () {
		const { userOne, erc1155ClaimerInstance, simpleErc1155Instante } = await loadFixture(deployContractsFixture);

		const randomTokenIds = [1, 2, 0, 5, 32, 51];

		await erc1155ClaimerInstance.grantRole(MANAGER_ROLE, userOne.address);

		await expect(
			erc1155ClaimerInstance.connect(userOne).createRandomClaimEvent(simpleErc1155Instante.address, randomTokenIds)
		).to.not.be.reverted;

		for (let i = 0; i < 49; i++) {
			await erc1155ClaimerInstance
				.connect(userOne)
				.createRandomClaimEvent(simpleErc1155Instante.address, randomTokenIds);
		}

		await expect(
			erc1155ClaimerInstance.connect(userOne).createRandomClaimEvent(simpleErc1155Instante.address, randomTokenIds)
		).to.be.reverted;
	});

	/**
	 * --------------------------------------------------------------------
	 * -------------------- MANAGE CLAIMING ENTRIES -----------------------
	 * --------------------------------------------------------------------
	 */

	it("Should NOT allow a wallet WITH the MANAGER_ROLE role to add a new claim entry for an NOT existing Simple Claim event", async function () {
		const { userOne, erc1155ClaimerInstance, simpleErc1155Instante } = await loadFixture(deployContractsFixture);

		await expect(erc1155ClaimerInstance.setSimpleClaimEntry(0, userOne.address, 10)).to.be.revertedWith(
			"This claim event is not active"
		);
	});

	it("Should allow a wallet WITH the MANAGER_ROLE role to add a new claim entry for an existing Simple Claim event", async function () {
		const { userOne, erc1155ClaimerInstance, simpleErc1155Instante } = await loadFixture(deployContractsFixture);

		const NFT_ID = [0];
		await erc1155ClaimerInstance.createSimpleClaimEvent(simpleErc1155Instante.address, NFT_ID);

		await expect(erc1155ClaimerInstance.setSimpleClaimEntry(0, userOne.address, 10)).to.not.be.reverted;
		await expect(erc1155ClaimerInstance.setSimpleClaimEntry(0, userOne.address, 0)).to.be.revertedWith(
			"Can't let claim 0 NFT copies"
		);
	});

	it("Should NOT allow a wallet WITH the MANAGER_ROLE role to add a new batch claim entries for an existing Simple Claim event if the length of the parameters is not the same", async function () {
		const { userOne, userTwo, erc1155ClaimerInstance, simpleErc1155Instante } = await loadFixture(
			deployContractsFixture
		);

		const users = [userOne.address, userTwo.address];
		const amountsClaimable = [10];

		const NFT_ID = [0];
		await erc1155ClaimerInstance.createSimpleClaimEvent(simpleErc1155Instante.address, NFT_ID);

		// Reverts because the arrays don't have the same lenght
		await expect(erc1155ClaimerInstance.setBatchSimpleClaimEntries(0, users, amountsClaimable)).to.be.revertedWith(
			"Claimers and amounts don't have the same length"
		);

		// Reverts because user One doesn't have the MANAGER_ROLE role granted
		await expect(erc1155ClaimerInstance.connect(userOne).setBatchSimpleClaimEntries(0, users, [10, 20])).to.be.reverted;

		// Reverts because can't add the whitelist to claim to 0 users as parameter
		await expect(erc1155ClaimerInstance.setBatchSimpleClaimEntries(0, [], [10, 20])).to.be.revertedWith(
			"Can't have an empty claimers list"
		);

		// Reverts because the event is not active (and not existing)
		await expect(erc1155ClaimerInstance.setBatchSimpleClaimEntries(1, users, amountsClaimable)).to.be.revertedWith(
			"This claim event is not active"
		);
	});

	it("Should NOT allow a wallet WITH the MANAGER_ROLE role to add a new batch claim entries for an existing Simple Claim event if there is a 0 entry", async function () {
		const { userOne, userTwo, erc1155ClaimerInstance, simpleErc1155Instante } = await loadFixture(
			deployContractsFixture
		);

		const users = [userOne.address, userTwo.address];
		const amountsClaimable = [10, 0];

		const NFT_ID = 0;
		await erc1155ClaimerInstance.createSimpleClaimEvent(simpleErc1155Instante.address, NFT_ID);

		await expect(erc1155ClaimerInstance.setBatchSimpleClaimEntries(0, users, amountsClaimable)).to.be.revertedWith(
			"Can't let claim 0 NFT copies"
		);
	});

	it("Should allow a wallet WITH the MANAGER_ROLE role to add a new batch claim entries for an existing Simple Claim event", async function () {
		const { userOne, userTwo, erc1155ClaimerInstance, simpleErc1155Instante } = await loadFixture(
			deployContractsFixture
		);

		const users = [userOne.address, userTwo.address];
		const amountsClaimable = [10, 20];

		const NFT_ID = [0];
		await erc1155ClaimerInstance.createSimpleClaimEvent(simpleErc1155Instante.address, NFT_ID);

		await expect(erc1155ClaimerInstance.setBatchSimpleClaimEntries(0, users, amountsClaimable)).to.not.be.reverted;
	});

	it("Should NOT allow a wallet WITHOUT the MANAGER_ROLE role to add a new claim entry for an existing Simple Claim event", async function () {
		const { userOne, erc1155ClaimerInstance, simpleErc1155Instante } = await loadFixture(deployContractsFixture);

		const NFT_ID = [0];
		await erc1155ClaimerInstance.createSimpleClaimEvent(simpleErc1155Instante.address, NFT_ID);
		await expect(erc1155ClaimerInstance.connect(userOne).setSimpleClaimEntry(0, userOne.address, 10)).to.be.reverted;
	});

	it("Should NOT allow a wallet WITH the MANAGER_ROLE role to add a new claim entry for an NOT existing Random Claim event", async function () {
		const { userOne, erc1155ClaimerInstance } = await loadFixture(deployContractsFixture);

		await expect(erc1155ClaimerInstance.setRandomClaimEntry(0, userOne.address, 10)).to.be.revertedWith(
			"This claim event is not active"
		);
	});

	it("Should allow a wallet WITH the MANAGER_ROLE role to add a new claim entry for an existing Random Claim event", async function () {
		const { userOne, erc1155ClaimerInstance, simpleErc1155Instante } = await loadFixture(deployContractsFixture);

		const NFT_ID = [0];
		await erc1155ClaimerInstance.createRandomClaimEvent(simpleErc1155Instante.address, NFT_ID);

		// Reverts because can't allow to claim 0 NFT copies
		await expect(erc1155ClaimerInstance.setRandomClaimEntry(0, userOne.address, 0)).to.be.revertedWith(
			"Can't let claim 0 NFT copies"
		);

		await expect(erc1155ClaimerInstance.setRandomClaimEntry(0, userOne.address, 10)).to.not.be.reverted;
	});

	it("Should NOT allow a wallet WITH the MANAGER_ROLE role to add a batch of new claim entries for an existing Random Claim event if there is a 0 entry", async function () {
		const { userOne, userTwo, erc1155ClaimerInstance, simpleErc1155Instante } = await loadFixture(
			deployContractsFixture
		);

		const NFT_ID = [0];
		await erc1155ClaimerInstance.createRandomClaimEvent(simpleErc1155Instante.address, NFT_ID);

		const users = [userOne.address, userTwo.address];
		const amountsClaimable = [10, 0];

		// Reverts because the user One has not the MANAGER_ROLE role granted
		await expect(erc1155ClaimerInstance.connect(userOne).setBatchRandomClaimEntries(0, users, amountsClaimable)).to.be
			.reverted;

		// Reverts because can't add the whitelist to claim to 0 users as parameter
		await expect(erc1155ClaimerInstance.setBatchRandomClaimEntries(0, [], [10, 20])).to.be.revertedWith(
			"Can't have an empty claimers list"
		);

		// Reverts because the event is not active (and not existing)
		await expect(erc1155ClaimerInstance.setBatchRandomClaimEntries(1, users, amountsClaimable)).to.be.revertedWith(
			"This claim event is not active"
		);

		await expect(erc1155ClaimerInstance.setBatchRandomClaimEntries(0, users, amountsClaimable)).to.be.revertedWith(
			"Can't let claim 0 NFT copies"
		);
	});

	it("Should NOT allow a wallet WITH the MANAGER_ROLE role to add a batch of new claim entries for an existing Random Claim event if the users and amount length are non the same", async function () {
		const { userOne, userTwo, erc1155ClaimerInstance, simpleErc1155Instante } = await loadFixture(
			deployContractsFixture
		);

		const NFT_ID = [0];
		await erc1155ClaimerInstance.createRandomClaimEvent(simpleErc1155Instante.address, NFT_ID);

		const users = [userOne.address, userTwo.address];
		const amountsClaimable = [10];

		await expect(erc1155ClaimerInstance.setBatchRandomClaimEntries(0, users, amountsClaimable)).to.be.revertedWith(
			"Claimers and amounts don't have the same length"
		);
	});

	it("Should allow a wallet WITH the MANAGER_ROLE role to add a batch of new claim entries for an existing Random Claim event", async function () {
		const { userOne, userTwo, erc1155ClaimerInstance, simpleErc1155Instante } = await loadFixture(
			deployContractsFixture
		);

		const NFT_ID = [0];
		await erc1155ClaimerInstance.createRandomClaimEvent(simpleErc1155Instante.address, NFT_ID);

		const users = [userOne.address, userTwo.address];
		const amountsClaimable = [10, 20];

		await expect(erc1155ClaimerInstance.setBatchRandomClaimEntries(0, users, amountsClaimable)).to.not.be.reverted;
	});

	it("Should NOT allow a wallet WITHOUT the MANAGER_ROLE role to add a new claim entry for an existing Random Claim event", async function () {
		const { userOne, erc1155ClaimerInstance, simpleErc1155Instante } = await loadFixture(deployContractsFixture);

		const NFT_ID = [0, 1, 2];
		await erc1155ClaimerInstance.createRandomClaimEvent(simpleErc1155Instante.address, NFT_ID);
		await expect(erc1155ClaimerInstance.connect(userOne).setRandomClaimEntry(0, userOne.address, 10)).to.be.reverted;
	});

	it("Should allow to check the amount of NFTs claimable related to a Simple Claim event", async function () {
		const { userOne, erc1155ClaimerInstance, simpleErc1155Instante } = await loadFixture(deployContractsFixture);

		const NFT_ID = [0];
		const EVENT_ID = 0;
		await erc1155ClaimerInstance.createSimpleClaimEvent(simpleErc1155Instante.address, NFT_ID);

		const NFTS_TO_ASSIGN = 10;
		await erc1155ClaimerInstance.setSimpleClaimEntry(EVENT_ID, userOne.address, NFTS_TO_ASSIGN);
		const nftsAssigned = await erc1155ClaimerInstance.simpleClaimableNfts(EVENT_ID, userOne.address);
		expect(nftsAssigned).to.equal(NFTS_TO_ASSIGN);
	});

	it("Should allow to check the amount of NFTs claimable related to a Random Claim event", async function () {
		const { userOne, erc1155ClaimerInstance, simpleErc1155Instante } = await loadFixture(deployContractsFixture);

		const NFT_ID = [0];
		const EVENT_ID = 0;
		await erc1155ClaimerInstance.createRandomClaimEvent(simpleErc1155Instante.address, NFT_ID);

		const NFTS_TO_ASSIGN = 10;
		await erc1155ClaimerInstance.setRandomClaimEntry(EVENT_ID, userOne.address, NFTS_TO_ASSIGN);
		const nftsAssigned = await erc1155ClaimerInstance.randomClaimableNfts(EVENT_ID, userOne.address);
		expect(nftsAssigned).to.equal(NFTS_TO_ASSIGN);
	});

	/**
	 * --------------------------------------------------------------------
	 * -------------------- MANAGE CLAIMING STATUS ------------------------
	 * --------------------------------------------------------------------
	 */

	it("Should allow a wallet WITH the MANAGER_ROLE role to disable an existing claim event", async function () {
		const { erc1155ClaimerInstance, simpleErc1155Instante } = await loadFixture(deployContractsFixture);

		const SIMPLE_CLAIM_EVENT_TYPE = 0; // enum in the smart contract
		const RANDOM_CLAIM_EVENT_TYPE = 1; // enum in the smart contract
		const EVENT_ID = 0;

		// Create and disable Simple claim event
		await erc1155ClaimerInstance.createSimpleClaimEvent(simpleErc1155Instante.address, 0);
		await expect(erc1155ClaimerInstance.disableClaimEvent(SIMPLE_CLAIM_EVENT_TYPE, EVENT_ID)).to.not.be.reverted;

		// Create and disable Random claim event
		await erc1155ClaimerInstance.createRandomClaimEvent(simpleErc1155Instante.address, [0, 1, 2]);
	});

	it("Should remove a Simple Claim event from the active list once is it disabled", async function () {
		const { erc1155ClaimerInstance, simpleErc1155Instante } = await loadFixture(deployContractsFixture);

		const SIMPLE_CLAIM_EVENT_TYPE = 0; // enum in the smart contract
		const EVENT_ID = 0;
		await erc1155ClaimerInstance.createSimpleClaimEvent(simpleErc1155Instante.address, 0);
		const activeEvents = await erc1155ClaimerInstance.getSimpleClaimEventsActive();
		await erc1155ClaimerInstance.disableClaimEvent(SIMPLE_CLAIM_EVENT_TYPE, EVENT_ID);
		const currentActiveEvents = await erc1155ClaimerInstance.getSimpleClaimEventsActive();
		expect(activeEvents.length).to.equal(currentActiveEvents.length + 1);
	});

	it("Should remove a Random Claim event from the active list once is it disabled", async function () {
		const { erc1155ClaimerInstance, simpleErc1155Instante } = await loadFixture(deployContractsFixture);

		const RANDOM_CLAIM_EVENT_TYPE = 1; // enum in the smart contract
		const EVENT_ID = 0;
		await erc1155ClaimerInstance.createRandomClaimEvent(simpleErc1155Instante.address, [0, 1, 2]);

		await expect(erc1155ClaimerInstance.createRandomClaimEvent(simpleErc1155Instante.address, [])).to.be.revertedWith(
			"Can't create an empty claimable set"
		);

		const activeEvents = await erc1155ClaimerInstance.getRandomClaimEventsActive();
		await erc1155ClaimerInstance.disableClaimEvent(RANDOM_CLAIM_EVENT_TYPE, EVENT_ID);
		const currentActiveEvents = await erc1155ClaimerInstance.getRandomClaimEventsActive();

		expect(activeEvents.length).to.equal(currentActiveEvents.length + 1);
	});

	it("Should NOT allow a wallet WITHOUT the MANAGER_ROLE role to disable an exisiting Simple Claim event", async function () {
		const { userOne, erc1155ClaimerInstance, simpleErc1155Instante } = await loadFixture(deployContractsFixture);

		const SIMPLE_CLAIM_EVENT_TYPE = 0; // enum in the smart contract
		const EVENT_ID = 0;
		await erc1155ClaimerInstance.createSimpleClaimEvent(simpleErc1155Instante.address, 0);
		await expect(erc1155ClaimerInstance.connect(userOne).disableClaimEvent(SIMPLE_CLAIM_EVENT_TYPE, EVENT_ID)).to.be
			.reverted;
	});

	it("Should allow a wallet WITH the MANAGER_ROLE role to disable an exisiting Random Claim event", async function () {
		const { erc1155ClaimerInstance, simpleErc1155Instante } = await loadFixture(deployContractsFixture);

		const RANDOM_CLAIM_EVENT_TYPE = 1; // enum in the smart contract
		const NFT_IDS = [0, 1, 3, 2];
		const EVENT_ID = 0;
		await erc1155ClaimerInstance.createRandomClaimEvent(simpleErc1155Instante.address, NFT_IDS);
		await expect(erc1155ClaimerInstance.disableClaimEvent(RANDOM_CLAIM_EVENT_TYPE, EVENT_ID)).to.not.be.reverted;
	});

	it("Should NOT allow a wallet WITHOUT the MANAGER_ROLE role to disable an exisiting Random Claim event", async function () {
		const { userOne, erc1155ClaimerInstance, simpleErc1155Instante } = await loadFixture(deployContractsFixture);

		const RANDOM_CLAIM_EVENT_TYPE = 1; // enum in the smart contract
		const NFT_IDS = [0, 1, 3, 2];
		const EVENT_ID = 0;
		await erc1155ClaimerInstance.createSimpleClaimEvent(simpleErc1155Instante.address, NFT_IDS);
		await expect(erc1155ClaimerInstance.connect(userOne).disableClaimEvent(RANDOM_CLAIM_EVENT_TYPE, EVENT_ID)).to.be
			.reverted;
	});

	/**
	 * --------------------------------------------------------------------
	 * -------------------- TEST CLAIM FUNCTION ---------------------------
	 * --------------------------------------------------------------------
	 */

	it("Should NOT let a user to claim 0 NFTs in a Simple Claim event", async function () {
		const { userOne, erc1155ClaimerInstance, simpleErc1155Instante } = await loadFixture(deployContractsFixture);
		const SIMPLE_CLAIM_EVENT_TYPE = 0; // enum in the smart contract
		const NFT_ID = 1;
		const EVENT_ID = 0;

		await erc1155ClaimerInstance.createSimpleClaimEvent(simpleErc1155Instante.address, NFT_ID);
		await expect(erc1155ClaimerInstance.connect(userOne).claim(SIMPLE_CLAIM_EVENT_TYPE, EVENT_ID)).to.be.revertedWith(
			"You don't have any NFT to claim"
		);
	});

	it("Should NOT let a user to claim 0 NFTs in a Random Claim event", async function () {
		const { userOne, erc1155ClaimerInstance, simpleErc1155Instante } = await loadFixture(deployContractsFixture);
		const RANDOM_CLAIM_EVENT_TYPE = 1; // enum in the smart contract
		const NFT_IDS = [0, 1, 3, 2];
		const EVENT_ID = 0;

		await erc1155ClaimerInstance.createRandomClaimEvent(simpleErc1155Instante.address, NFT_IDS);
		await expect(erc1155ClaimerInstance.connect(userOne).claim(RANDOM_CLAIM_EVENT_TYPE, EVENT_ID)).to.be.revertedWith(
			"You don't have any NFT to claim"
		);
	});

	it("Should NOT allow a user to claim in a Simple Claim event if there are 0 NFTs to claim in the contract", async function () {
		const { userOne, erc1155ClaimerInstance, simpleErc1155Instante } = await loadFixture(deployContractsFixture);
		const SIMPLE_CLAIM_EVENT_TYPE = 0; // enum in the smart contract
		const claimableAmount = 5;
		const NFT_ID = 1;
		const EVENT_ID = 0;

		await erc1155ClaimerInstance.createSimpleClaimEvent(simpleErc1155Instante.address, NFT_ID);
		await erc1155ClaimerInstance.setSimpleClaimEntry(EVENT_ID, userOne.address, claimableAmount);
		await expect(erc1155ClaimerInstance.connect(userOne).claim(SIMPLE_CLAIM_EVENT_TYPE, EVENT_ID)).to.be.revertedWith(
			"No NFTs in the smart contract to claim"
		);
	});

	it("Should allow a user to claim ALL the NFT copies in the contract if the assigned claimable amount exceed the available amount", async function () {
		const { deployer, userOne, erc1155ClaimerInstance, simpleErc1155Instante } = await loadFixture(
			deployContractsFixture
		);
		const SIMPLE_CLAIM_EVENT_TYPE = 0; // enum in the smart contract
		const claimableAmount = 5;
		const NFT_ID = 1;
		const EVENT_ID = 0;

		// Mint NFTs to contract
		await erc1155ClaimerInstance.grantRole(NFTS_OPERATOR_ROLE, deployer.address);
		await simpleErc1155Instante.mint(erc1155ClaimerInstance.address, NFT_ID, 1, "0x00");
		await erc1155ClaimerInstance.createSimpleClaimEvent(simpleErc1155Instante.address, NFT_ID);
		await erc1155ClaimerInstance.setSimpleClaimEntry(EVENT_ID, userOne.address, claimableAmount);
		await expect(erc1155ClaimerInstance.connect(userOne).claim(SIMPLE_CLAIM_EVENT_TYPE, EVENT_ID)).to.not.be.reverted;
	});

	it("Should allow a user to claim ALL the assigned NFT copies in a Simple Claim event if present in the contract", async function () {
		const { deployer, userOne, erc1155ClaimerInstance, simpleErc1155Instante } = await loadFixture(
			deployContractsFixture
		);
		const SIMPLE_CLAIM_EVENT_TYPE = 0; // enum in the smart contract
		const claimableAmount = 1;
		const NFT_ID = 1;
		const EVENT_ID = 0;

		// Mint NFTs to contract
		await erc1155ClaimerInstance.grantRole(NFTS_OPERATOR_ROLE, deployer.address);
		await simpleErc1155Instante.mint(erc1155ClaimerInstance.address, NFT_ID, 1, "0x00");
		await erc1155ClaimerInstance.createSimpleClaimEvent(simpleErc1155Instante.address, NFT_ID);
		await erc1155ClaimerInstance.setSimpleClaimEntry(EVENT_ID, userOne.address, claimableAmount);
		await expect(erc1155ClaimerInstance.connect(userOne).claim(SIMPLE_CLAIM_EVENT_TYPE, EVENT_ID)).to.not.be.reverted;
	});

	it("Should allow a user to claim in a Random Claim event even if there are 0 NFTs available in the contract (no NFTs will be moved)", async function () {
		const { userOne, erc1155ClaimerInstance, simpleErc1155Instante } = await loadFixture(deployContractsFixture);
		const RANDOM_CLAIM_EVENT_TYPE = 1; // enum in the smart contract
		const claimableAmount = 5;
		const NFT_IDS = [0, 1, 3, 2];
		const EVENT_ID = 0;

		await erc1155ClaimerInstance.createRandomClaimEvent(simpleErc1155Instante.address, NFT_IDS);
		await erc1155ClaimerInstance.setRandomClaimEntry(EVENT_ID, userOne.address, claimableAmount);
		const claimedNfts = await erc1155ClaimerInstance.connect(userOne).claim(RANDOM_CLAIM_EVENT_TYPE, EVENT_ID);
		expect(claimedNfts["value"].toNumber()).to.equal(0);
	});

	it("Should allow a user to claim his assigned NFTs amount in a Random Claim event if enough NFTs are present in the contract", async function () {
		const { deployer, userOne, erc1155ClaimerInstance, simpleErc1155Instante } = await loadFixture(
			deployContractsFixture
		);
		const RANDOM_CLAIM_EVENT_TYPE = 1; // enum in the smart contract
		const claimableAmount = 5;
		const NFT_IDS = [0, 1, 3, 2];
		const EVENT_ID = 0;
		const initialBalances = [21, 4, 5, 13];

		// Mint NFTs to contract
		await simpleErc1155Instante.mintBatch(deployer.address, NFT_IDS, initialBalances, "0x00");

		var userBalances = [];
		var contractBalances = [];

		contractBalances = await simpleErc1155Instante.balanceOfBatch(
			[
				erc1155ClaimerInstance.address,
				erc1155ClaimerInstance.address,
				erc1155ClaimerInstance.address,
				erc1155ClaimerInstance.address,
			],
			NFT_IDS
		);
		userBalances = await simpleErc1155Instante.balanceOfBatch(
			[userOne.address, userOne.address, userOne.address, userOne.address],
			NFT_IDS
		);
		//console.log("contractBalances", contractBalances);

		await erc1155ClaimerInstance.grantRole(NFTS_OPERATOR_ROLE, deployer.address);
		await erc1155ClaimerInstance.createRandomClaimEvent(simpleErc1155Instante.address, NFT_IDS);
		await erc1155ClaimerInstance.setRandomClaimEntry(EVENT_ID, userOne.address, claimableAmount);
		await expect(erc1155ClaimerInstance.connect(userOne).claim(RANDOM_CLAIM_EVENT_TYPE, EVENT_ID)).to.not.be.reverted;
	});

	it("Should allow a user to claim ALL the related Random Claim event NFT copies if NOT enough NFTs are present in the contract", async function () {
		const { deployer, userOne, erc1155ClaimerInstance, simpleErc1155Instante } = await loadFixture(
			deployContractsFixture
		);
		const RANDOM_CLAIM_EVENT_TYPE = 1; // enum in the smart contract
		const claimableAmount = 200;
		const NFT_IDS = [0, 1, 3, 2];
		const EVENT_ID = 0;
		const initialBalances = [21, 4, 5, 13];

		var maxClaimableAmount = 0;
		for (let i = 0; i < initialBalances.length; i++) {
			maxClaimableAmount += initialBalances[i];
		}

		// Mint NFTs to contract
		await erc1155ClaimerInstance.grantRole(NFTS_OPERATOR_ROLE, deployer.address);
		await erc1155ClaimerInstance.grantRole(NFTS_OPERATOR_ROLE, simpleErc1155Instante.address);
		await simpleErc1155Instante.mintBatch(erc1155ClaimerInstance.address, NFT_IDS, initialBalances, "0x00");

		var userBalances = [];
		var contractBalances = [];

		contractBalances = await simpleErc1155Instante.balanceOfBatch(
			[
				erc1155ClaimerInstance.address,
				erc1155ClaimerInstance.address,
				erc1155ClaimerInstance.address,
				erc1155ClaimerInstance.address,
			],
			NFT_IDS
		);
		userBalances = await simpleErc1155Instante.balanceOfBatch(
			[userOne.address, userOne.address, userOne.address, userOne.address],
			NFT_IDS
		);

		await erc1155ClaimerInstance.createRandomClaimEvent(simpleErc1155Instante.address, NFT_IDS);
		await erc1155ClaimerInstance.setRandomClaimEntry(EVENT_ID, userOne.address, claimableAmount);
		await erc1155ClaimerInstance.connect(userOne).claim(RANDOM_CLAIM_EVENT_TYPE, EVENT_ID);

		const currentContractBalances = await simpleErc1155Instante.balanceOfBatch(
			[
				erc1155ClaimerInstance.address,
				erc1155ClaimerInstance.address,
				erc1155ClaimerInstance.address,
				erc1155ClaimerInstance.address,
			],
			NFT_IDS
		);
		const currentUserBalances = await simpleErc1155Instante.balanceOfBatch(
			[userOne.address, userOne.address, userOne.address, userOne.address],
			NFT_IDS
		);
		var claimedNfts = 0;
		for (let i = 0; i < currentUserBalances.length; i++) {
			claimedNfts += currentUserBalances[i].toNumber();
		}
		expect(claimedNfts).to.equal(maxClaimableAmount);
	});

	it("Should NOT allow a user WITHOUT the NFTS_OPERATOR_ROLE role to send an NFT to the claimer contract", async function () {
		const { userOne, erc1155ClaimerInstance, simpleErc1155Instante } = await loadFixture(deployContractsFixture);

		await simpleErc1155Instante.mint(userOne.address, 0, 10, "0x00");
		await expect(
			simpleErc1155Instante.mintBatch(erc1155ClaimerInstance.address, [2, 3, 4, 5], [12, 12, 12, 12], "0x00")
		).to.be.reverted;
		await expect(
			simpleErc1155Instante
				.connect(userOne)
				.safeBatchTransferFrom(userOne.address, erc1155ClaimerInstance.address, [0], [1], "0x00")
		).to.be.revertedWith("The contract can't receive NFTs from this operator");
	});

	const RANDOM_CLAIM_EVENT_TYPE = 1; // enum in the smart contract
	const SIMPLE_CLAIM_EVENT_TYPE = 0; // enum in the smart contract

	it("Should allow to remove an active Simple claim event", async function () {
		const { erc1155ClaimerInstance, simpleErc1155Instante } = await loadFixture(deployContractsFixture);

		await erc1155ClaimerInstance.createSimpleClaimEvent(simpleErc1155Instante.address, BACKPACK_ID);
		await erc1155ClaimerInstance.createSimpleClaimEvent(simpleErc1155Instante.address, BACKPACK_ID);
		await erc1155ClaimerInstance.createSimpleClaimEvent(simpleErc1155Instante.address, BACKPACK_ID);

		await erc1155ClaimerInstance.disableClaimEvent(SIMPLE_CLAIM_EVENT_TYPE, 0);
		await expect(erc1155ClaimerInstance.disableClaimEvent(SIMPLE_CLAIM_EVENT_TYPE, 4)).to.be.revertedWith(
			"Simple Claim event not in the active list"
		);
	});

	it("Should allow to remove an active Random claim event", async function () {
		const { erc1155ClaimerInstance, simpleErc1155Instante } = await loadFixture(deployContractsFixture);

		await erc1155ClaimerInstance.createRandomClaimEvent(simpleErc1155Instante.address, [BACKPACK_ID]);
		await erc1155ClaimerInstance.createRandomClaimEvent(simpleErc1155Instante.address, [BACKPACK_ID]);
		await erc1155ClaimerInstance.createRandomClaimEvent(simpleErc1155Instante.address, [BACKPACK_ID]);

		const simpleClaimEventsActive = await erc1155ClaimerInstance.getRandomClaimEventsActive();
		console.log(simpleClaimEventsActive);

		await erc1155ClaimerInstance.disableClaimEvent(RANDOM_CLAIM_EVENT_TYPE, 0);
		await expect(erc1155ClaimerInstance.disableClaimEvent(RANDOM_CLAIM_EVENT_TYPE, 4)).to.be.revertedWith(
			"Random Claim event not in the active list"
		);
	});
});

function bigArrayToArray(bigArray) {
	const convertedArray = [];
	for (let i = 0; i < bigArray.length; i++) {
		convertedArray.push(bigArray[i].toNumber());
	}
	return convertedArray;
}

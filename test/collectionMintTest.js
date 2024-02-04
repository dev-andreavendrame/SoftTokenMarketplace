const { expect, assert } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, mine, time } = require("@nomicfoundation/hardhat-network-helpers");

const anyValue = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("Collection mint testing", function () {
	const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";
	const MANAGER_ROLE = "0x241ecf16d79d0f8dbfb92cbc07fe17840425976cf0667f022fe9877caa831b08";
	const PAUSER_ROLE = "0x65d7a28e3265b37a6474929f336521b332c1681b933f6cb9f3376673440d862a";
	const MINTER_ROLE = "0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6";
	const URI_EDITOR_ROLE = "0x9c66f910f205d7535152ebffe8ac04c001560c07b4ff8d983d454b2df5e70cf8";
	const ZERO_ADDRESS = ethers.constants.AddressZero;

	const MAX_COLLECTION_SUPPLY = 100;

	async function deployContractsFixture() {
		// Define process actors
		const [deployer, userOne, userTwo, contractProvider] = await ethers.getSigners();

		// Deploy the Erc721collection contract
		const Erc721Collection = await ethers.getContractFactory("Erc721Collection");
		const erc721Collection = await Erc721Collection.deploy(0, MAX_COLLECTION_SUPPLY, 250, "my_custom_URI");
		await erc721Collection.deployed();

		// Deploy the CollectionMinter contract
		const CollectionMinter = await ethers.getContractFactory("CollectionMinter");
		const collectionMinter = await CollectionMinter.deploy(erc721Collection.address, 50, contractProvider.address);
		await collectionMinter.deployed();

		await erc721Collection.grantRole(MINTER_ROLE, collectionMinter.address);

		// Deploy an ERC20 for paying the minting
		const Erc20 = await ethers.getContractFactory("MyToken");
		const erc20 = await Erc20.deploy();
		await erc20.deployed();

		return {
			deployer,
			userOne,
			userTwo,
			contractProvider,
			erc721Collection,
			collectionMinter,
			erc20,
		};
	}

	// Erc20 mint test
	it("Should allow to mint Erc20 tokens", async function () {
		const { erc20, deployer } = await loadFixture(deployContractsFixture);
		await erc20.mint(deployer.address, 1);
	});

	it("Should allow to deploy the contracts", async function () {
		const { erc721Collection, collectionMinter } = await loadFixture(deployContractsFixture);
		expect(erc721Collection.address).to.not.equal(ethers.constants.AddressZero);
		expect(collectionMinter.address).to.not.equal(ethers.constants.AddressZero);
	});

	it("Should allow to grant the PAUSER_ROLE and revoke it", async function () {
		const { deployer, erc721Collection } = await loadFixture(deployContractsFixture);

		await expect(erc721Collection.grantRole(PAUSER_ROLE, deployer.address)).to.not.be.reverted;
		await expect(erc721Collection.revokeRole(PAUSER_ROLE, deployer.address)).to.not.be.reverted;
	});

	it("Should allow a wallet with the PAUSER_ROLE role to pause and unpause the contract", async function () {
		const { deployer, userOne, erc721Collection } = await loadFixture(deployContractsFixture);

		await erc721Collection.grantRole(PAUSER_ROLE, deployer.address);
		await expect(erc721Collection.pause()).to.not.be.reverted;
		await expect(erc721Collection.connect(userOne).unpause()).to.be.reverted;
		await expect(erc721Collection.unpause()).to.not.be.reverted;
		await expect(erc721Collection.connect(userOne).pause()).to.be.reverted;
	});

	it("Should allow to grant the MINTER_ROLE role and mint a token directly from the ERC721 collection", async function () {
		const { deployer, userOne, erc721Collection } = await loadFixture(deployContractsFixture);

		await erc721Collection.grantRole(MINTER_ROLE, deployer.address);
		await expect(erc721Collection.connect(userOne).safeMint(deployer.address)).to.be.reverted;
		await expect(erc721Collection.safeMint(deployer.address)).to.not.be.reverted;
	});

	it("Should allow to check the token URI of a minted token", async function () {
		const { deployer, erc721Collection } = await loadFixture(deployContractsFixture);

		await erc721Collection.grantRole(MINTER_ROLE, deployer.address);
		await expect(erc721Collection.safeMint(deployer.address)).to.not.be.reverted;
		const tokenURI = await erc721Collection.tokenURI(0);
		console.log(tokenURI);
	});

	it("Should allow to check the token URI of an existing token", async function () {
		const { deployer, erc721Collection } = await loadFixture(deployContractsFixture);

		await erc721Collection.grantRole(MINTER_ROLE, deployer.address);
		await erc721Collection.safeMint(deployer.address);
		expect(erc721Collection.tokenURI(1)).to.not.be.reverted;
	});

	it("Should allow to grant the URI_EDITOR_ROLE role and set a new token URI", async function () {
		const { deployer, userOne, erc721Collection } = await loadFixture(deployContractsFixture);

		await erc721Collection.grantRole(MINTER_ROLE, deployer.address);
		await erc721Collection.grantRole(URI_EDITOR_ROLE, deployer.address);
		await erc721Collection.safeMint(deployer.address);
		await expect(erc721Collection.setTokenURI(1, "newURI")).to.not.be.reverted;

		// Shoud not allow to edit the URI Without URI_EDITOR_ROLE role
		await expect(erc721Collection.connect(userOne).setTokenURI(1, "newURI")).to.be.reverted;

		// Should not allow to edit the token URI when the contract is paused
		await erc721Collection.pause();
		await expect(erc721Collection.setTokenURI(1, "newURI")).to.be.reverted;
	});

	it("Should support ERC2981, ERC721, ERC721URIStorage, AccessControl interfaces", async function () {
		const { erc721Collection } = await loadFixture(deployContractsFixture);

		const supportsERC2981 = await erc721Collection.supportsInterface("0x2a55205a");
		const supportsAccessControl = await erc721Collection.supportsInterface("0x7965db0b");
		const supportsERC721URIStorage = await erc721Collection.supportsInterface("0x49064906");
		const supportsERC721 = await erc721Collection.supportsInterface("0x80ac58cd");

		expect(supportsERC2981 && supportsAccessControl && supportsERC721URIStorage && supportsERC721).to.equal(true);
	});

	// ---------------------------------------------------------------- //
	// ---------- COLLECTION SMART CONTRACT STATE INSPECTION ---------- //
	// ---------------------------------------------------------------- //

	it("Should allow to read the royalties information (royaltiesReceiver and contractRoyaltiesBps)", async function () {
		const { erc721Collection } = await loadFixture(deployContractsFixture);
		expect(await erc721Collection.royaltiesReceiver()).to.not.be.reverted;
		expect(await erc721Collection.contractRoyaltiesBps()).to.not.be.reverted;
	});

	it("Should allow to read the partialMetadataUri information", async function () {
		const { erc721Collection } = await loadFixture(deployContractsFixture);
		expect(await erc721Collection.partialMetadataUri()).to.not.be.reverted;
	});

	it("Should allow to read collection supply constraints", async function () {
		const { erc721Collection } = await loadFixture(deployContractsFixture);
		expect(await erc721Collection.minimumNftTokenId()).to.not.be.reverted;
		expect(await erc721Collection.maximumNftTokenId()).to.not.be.reverted;
	});

	it("Should not allow to mint if the contract is paused", async function () {
		const { deployer, erc721Collection } = await loadFixture(deployContractsFixture);

		await erc721Collection.grantRole(PAUSER_ROLE, deployer.address);
		await erc721Collection.grantRole(MINTER_ROLE, deployer.address);
		await erc721Collection.grantRole(URI_EDITOR_ROLE, deployer.address);
		await erc721Collection.pause();
		await expect(erc721Collection.safeMint(deployer.address)).to.be.reverted;
	});

	it("Should allow to check the current collection supply and max collection supply", async function () {
		const { deployer, erc721Collection } = await loadFixture(deployContractsFixture);

		const MAX_COLLECTION_SUPPLY = 100;

		await erc721Collection.grantRole(MINTER_ROLE, deployer.address);
		await erc721Collection.grantRole(URI_EDITOR_ROLE, deployer.address);
		await erc721Collection.safeMint(deployer.address);
		const currentSupply = await erc721Collection.getCurrentSupply();
		const maxSupply = await erc721Collection.getMaxCollectionSupply();
		expect(currentSupply).to.equal(1);
		expect(maxSupply).to.equal(MAX_COLLECTION_SUPPLY);
	});

	it("Should return 0 when the 'getCurrentSupply' function is called and 0 tokens are minted", async function () {
		const { deployer, erc721Collection } = await loadFixture(deployContractsFixture);

		const MAX_COLLECTION_SUPPLY = 100;

		await erc721Collection.grantRole(MINTER_ROLE, deployer.address);
		await erc721Collection.grantRole(URI_EDITOR_ROLE, deployer.address);
		const currentSupply = await erc721Collection.getCurrentSupply();
		expect(currentSupply).to.equal(0);
	});

	it("Should allow to update the royalties receiver of the collection", async function () {
		const { userOne, erc721Collection } = await loadFixture(deployContractsFixture);

		const newBpsPoints = 200;
		await erc721Collection.updateDefaultRoyaties(userOne.address, newBpsPoints);
		await expect(erc721Collection.connect(userOne).updateDefaultRoyaties(userOne.address, newBpsPoints)).to.be.reverted;
	});

	// ---------------------------------------------------------------- //
	// ---------- MINTER SMART CONTRACT TESTING ----------------------- //
	// ---------------------------------------------------------------- //

	it("Should allow a wallet with the PAUSER_ROLE role to pause and unpause the minter contract", async function () {
		const { deployer, collectionMinter } = await loadFixture(deployContractsFixture);
		await collectionMinter.grantRole(PAUSER_ROLE, deployer.address);
		await expect(collectionMinter.grantRole(PAUSER_ROLE, deployer.address)).to.not.be.reverted;
		await expect(collectionMinter.pause()).to.not.be.reverted;
		await expect(collectionMinter.unpause()).to.not.be.reverted;
	});

	it("Should not allow a wallet WITHOUT the PAUSER_ROLE role to pause and unpause the minter contract", async function () {
		const { deployer, userOne, collectionMinter } = await loadFixture(deployContractsFixture);
		// Call the functions when the contract is not paused
		await expect(collectionMinter.connect(userOne).pause()).to.be.reverted;
		await expect(collectionMinter.connect(userOne).unpause()).to.be.reverted;
		// Call the functions when the contract is paused
		await collectionMinter.grantRole(PAUSER_ROLE, deployer.address);
		await collectionMinter.pause();
		await expect(collectionMinter.connect(userOne).pause()).to.be.reverted;
		await expect(collectionMinter.connect(userOne).unpause()).to.be.reverted;
	});

	it("Should allow a wallet with the MANAGER_ROLE role to enable and disable the mint (minter)", async function () {
		const { deployer, collectionMinter } = await loadFixture(deployContractsFixture);
		await collectionMinter.grantRole(MANAGER_ROLE, deployer.address);
		await expect(collectionMinter.enableMint()).to.not.be.reverted;
		await expect(collectionMinter.disableMint()).to.not.be.reverted;
	});

	it("Should not allow a wallet WITHOUT the MANAGER_ROLE role to enable and disable the mint (minter)", async function () {
		const { userOne, collectionMinter } = await loadFixture(deployContractsFixture);
		await expect(collectionMinter.connect(userOne).enableMint()).to.be.reverted;
		await expect(collectionMinter.connect(userOne).disableMint()).to.be.reverted;
	});

	it("Should allow to check if an not existing sale phase is active", async function () {
		const { userOne, collectionMinter } = await loadFixture(deployContractsFixture);
		const isNotExistingSalePhaseActive = await collectionMinter.isSalePhaseActive(10);
		expect(isNotExistingSalePhaseActive).to.equal(false);
	});

	it("Should allow to check the ID of the last sale phase created", async function () {
		const { collectionMinter } = await loadFixture(deployContractsFixture);
		const lastSalePhaseCreated = await collectionMinter.lastSalePhaseCreated();
		expect(lastSalePhaseCreated).to.equal(0);
	});

	it("Should not allow to manage the whitelist for a not existing sale phase", async function () {
		const { deployer, userOne, collectionMinter } = await loadFixture(deployContractsFixture);

		//await collectionMinter.grantRole(PAUSER_ROLE, deployer.address);
		await collectionMinter.grantRole(MANAGER_ROLE, deployer.address);

		//await collectionMinter.pause();

		// Grant whitelist to userOne
		await expect(collectionMinter.grantWhitelistForSalePhase(0, [userOne.address])).to.be.revertedWith(
			"The provided sale phase hasn't been created yet."
		);

		await expect(collectionMinter.revokeWhitelistFromSalePhase(0, [userOne.address])).to.be.revertedWith(
			"The provided sale phase hasn't been created yet."
		);
	});

	it("Should not allow wallet WITHOUT the MANAGER_ROLE role to create a new sale phase", async function () {
		const { userOne, collectionMinter } = await loadFixture(deployContractsFixture);

		await expect(collectionMinter.connect(userOne).createSalePhase(false, 0, 100, true, ZERO_ADDRESS, 100, 1, 100)).to
			.be.reverted;
	});

	it("Should allow wallet with the MANAGER_ROLE role to create a new sale phase", async function () {
		const { deployer, collectionMinter } = await loadFixture(deployContractsFixture);

		//await collectionMinter.grantRole(PAUSER_ROLE, deployer.address);
		await collectionMinter.grantRole(MANAGER_ROLE, deployer.address);

		// Grant whitelist to userOne
		await expect(collectionMinter.createSalePhase(false, 0, 100, true, ZERO_ADDRESS, 100, 1, 100)).to.not.be.reverted;
	});

	it("Should not allow wallet with the MANAGER_ROLE role to create a new sale phase when the contract is paused", async function () {
		const { deployer, userOne, collectionMinter } = await loadFixture(deployContractsFixture);

		await collectionMinter.grantRole(PAUSER_ROLE, deployer.address);
		await collectionMinter.grantRole(MANAGER_ROLE, deployer.address);
		await collectionMinter.pause();

		await expect(collectionMinter.createSalePhase(false, 0, 100, true, ZERO_ADDRESS, 100, 1, 100)).to.be.reverted;
	});

	it("Should allow wallet with the MANAGER_ROLE role to create a new sale phase", async function () {
		const { deployer, userOne, collectionMinter } = await loadFixture(deployContractsFixture);

		//await collectionMinter.grantRole(PAUSER_ROLE, deployer.address);
		await collectionMinter.grantRole(MANAGER_ROLE, deployer.address);

		// Grant whitelist to userOne
		await expect(collectionMinter.createSalePhase(false, 0, 100, true, ZERO_ADDRESS, 100, 1, 100)).to.not.be.reverted;
	});

	it("Should revert the creation of a sale phase where the start block is lower thant the end", async function () {
		const { deployer, collectionMinter } = await loadFixture(deployContractsFixture);

		//await collectionMinter.grantRole(PAUSER_ROLE, deployer.address);
		await collectionMinter.grantRole(MANAGER_ROLE, deployer.address);

		await expect(collectionMinter.createSalePhase(false, 100, 1, true, ZERO_ADDRESS, 100, 1, 100)).to.be.revertedWith(
			"The sale time cannot be zero!"
		);
	});

	it("Should allow to disable an active sale phase", async function () {
		const { deployer, userOne, collectionMinter } = await loadFixture(deployContractsFixture);

		//await collectionMinter.grantRole(PAUSER_ROLE, deployer.address);
		await collectionMinter.grantRole(MANAGER_ROLE, deployer.address);

		// Grant whitelist to userOne
		await collectionMinter.createSalePhase(false, 1, 100, true, ZERO_ADDRESS, 100, 1, 100);
		await expect(collectionMinter.connect(userOne).disableSalePhase(0)).to.be.reverted;
		await expect(collectionMinter.disableSalePhase(0)).to.not.be.reverted;
	});

	it("Should allow wallet with the MANAGER_ROLE role to grant the whitelist for a sale phase (and vice versa)", async function () {
		const { deployer, userOne, collectionMinter } = await loadFixture(deployContractsFixture);

		//await collectionMinter.grantRole(PAUSER_ROLE, deployer.address);
		await collectionMinter.grantRole(MANAGER_ROLE, deployer.address);

		//await collectionMinter.pause();

		// Grant whitelist to userOne
		await expect(collectionMinter.grantWhitelistForSalePhase(0, [userOne.address])).to.be.revertedWith(
			"The provided sale phase hasn't been created yet."
		);
	});

	it("Should allow a wallet with the DEFAULT_ADMIN_ROLE role to change the fundsReceiver", async function () {
		const { userOne, collectionMinter } = await loadFixture(deployContractsFixture);

		await expect(collectionMinter.updateFundsReceiver(userOne.address)).to.not.be.reverted;
		await expect(collectionMinter.connect(userOne).updateFundsReceiver(userOne.address)).to.be.reverted;
	});

	it("Should not allow a wallet to mint if the mint is not enabled yet", async function () {
		const { deployer, collectionMinter } = await loadFixture(deployContractsFixture);

		await collectionMinter.grantRole(MANAGER_ROLE, deployer.address);
		await collectionMinter.createSalePhase(false, 0, 100, true, ZERO_ADDRESS, 100, 1, 100);
		await expect(collectionMinter.mintTokens(1, 0)).to.be.revertedWith("Mint is not enabled now");
	});

	it("Should allow wallet with the MANAGER_ROLE role to create a new sale phase", async function () {
		const { deployer, userOne, collectionMinter } = await loadFixture(deployContractsFixture);

		//await collectionMinter.grantRole(PAUSER_ROLE, deployer.address);
		await collectionMinter.grantRole(MANAGER_ROLE, deployer.address);
		await collectionMinter.enableMint();

		// Reverts becasue the value used to pay the mint is not enough
		await collectionMinter.createSalePhase(false, 1, 1000, true, ZERO_ADDRESS, 100, 1, 100);
		await expect(collectionMinter.mintTokens(1, 1, { value: 0 })).to.be.reverted;

		// Reverts becasue a wallet can't mint 0 tokens
		await expect(collectionMinter.mintTokens(0, 1, { value: 150 })).to.be.reverted;

		// Reverts because the sale phase 2 has a starting block equal to 0
		await collectionMinter.createSalePhase(false, 0, 1000, true, ZERO_ADDRESS, 100, 1, 100);
		await expect(collectionMinter.mintTokens(1, 2, { value: 0 })).to.be.reverted;

		// Reverts because the sale phase 3 is not active yet
		await collectionMinter.createSalePhase(false, 100, 1000, true, ZERO_ADDRESS, 100, 1, 100);
		await expect(collectionMinter.mintTokens(1, 3, { value: 150 })).to.be.revertedWith("Sale phase not active");

		// Reverts because the sale is sold-out
		await collectionMinter.createSalePhase(false, 1, 1000, true, ZERO_ADDRESS, 100, 1, 0);
		await expect(collectionMinter.mintTokens(1, 4, { value: 150 })).to.be.revertedWith("This sale is sold out.");

		// Reverts because the wallet is not allowed to buy in this sale phase
		await collectionMinter.createSalePhase(true, 1, 1000, true, ZERO_ADDRESS, 100, 1, 100);
		await expect(collectionMinter.mintTokens(1, 5, { value: 150 })).to.be.revertedWith(
			"You are not allowed to mint in this phase"
		);

		// Buy a token in a public sale (ID = 1)
		await collectionMinter.mintTokens(1, 1, { value: 150 });

		// Reverts because the wallet max mint limit has been reached
		await expect(collectionMinter.mintTokens(1, 1, { value: 150 })).to.be.revertedWith(
			"Max minting limit reached! You can't mint more tokens."
		);

		// Buy a token in a whitelisted sale phase (ID = 5)
		await collectionMinter.grantWhitelistForSalePhase(5, [userOne.address]);
		await collectionMinter.connect(userOne).mintTokens(1, 5, { value: 150 });
	});

	it("Should allow to pay the mint with ERC20 tokens", async function () {
		const { deployer, userOne, collectionMinter, erc20 } = await loadFixture(deployContractsFixture);

		const MAX_PHASE_LIMIT_SUPPLY = 10;
		const MAX_MINTED_TOKENS_PER_WALLET = 1;
		const MINT_PRICE = 100;

		await collectionMinter.grantRole(MANAGER_ROLE, deployer.address);
		await collectionMinter.enableMint();

		// Reverts becasue the value used to pay the mint is not enough
		await collectionMinter.createSalePhase(
			false,
			1,
			1000,
			false,
			erc20.address,
			MINT_PRICE,
			MAX_MINTED_TOKENS_PER_WALLET,
			MAX_PHASE_LIMIT_SUPPLY
		);

		// Should revert for insufficient funds
		await expect(collectionMinter.connect(userOne).mintTokens(MAX_MINTED_TOKENS_PER_WALLET, 1, { value: 50 })).to.be
			.reverted;

		// Should reverts because of insufficient allowance (custom error)
		await erc20.mint(userOne.address, MINT_PRICE);
		await expect(
			collectionMinter.connect(userOne).mintTokens(MAX_MINTED_TOKENS_PER_WALLET, 1, { value: 50 })
		).to.be.revertedWith("The current allowance can't cover the full mint price.");

		// Should allow a wallet to buy one token
		await erc20.connect(userOne).approve(collectionMinter.address, MINT_PRICE);
		await expect(collectionMinter.connect(userOne).mintTokens(MAX_MINTED_TOKENS_PER_WALLET, 1, { value: 50 })).to.not.be
			.reverted;
	});
});

function bigArrayToArray(bigArray) {
	const convertedArray = [];
	for (let i = 0; i < bigArray.length; i++) {
		convertedArray.push(bigArray[i].toNumber());
	}
	return convertedArray;
}

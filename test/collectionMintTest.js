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

		console.log(await erc721Collection.URI_EDITOR_ROLE());

		return {
			deployer,
			userOne,
			userTwo,
			contractProvider,
			erc721Collection,
			collectionMinter,
		};
	}

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
		const { deployer, erc721Collection } = await loadFixture(deployContractsFixture);

		await erc721Collection.grantRole(PAUSER_ROLE, deployer.address);
		await expect(erc721Collection.pause()).to.not.be.reverted;
		await expect(erc721Collection.unpause()).to.not.be.reverted;
	});

	it("Should allow to grant the MINTER_ROLE role and mint a token directly from the ERC721 collection", async function () {
		const { deployer, erc721Collection } = await loadFixture(deployContractsFixture);

		await erc721Collection.grantRole(MINTER_ROLE, deployer.address);
		await expect(erc721Collection.safeMint(deployer.address)).to.not.be.reverted;
	});

	it("Should allow to check the token URI of an existing token", async function () {
		const { deployer, erc721Collection } = await loadFixture(deployContractsFixture);

		await erc721Collection.grantRole(MINTER_ROLE, deployer.address);
		await erc721Collection.safeMint(deployer.address);
		expect(erc721Collection.tokenURI(1)).to.not.be.reverted;
	});

	it("Should allow to grant the URI_EDITOR_ROLE role and set a new token URI", async function () {
		const { deployer, erc721Collection } = await loadFixture(deployContractsFixture);

		await erc721Collection.grantRole(MINTER_ROLE, deployer.address);
		await erc721Collection.grantRole(URI_EDITOR_ROLE, deployer.address);
		await erc721Collection.safeMint(deployer.address);
		await expect(erc721Collection.setTokenURI(1, "newURI")).to.not.be.reverted;
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

	it("Should allow to update the royalties receiver of the collection", async function () {
		const { userOne, erc721Collection } = await loadFixture(deployContractsFixture);

		const newBpsPoints = 200;
		await erc721Collection.updateDefaultRoyaties(userOne.address, newBpsPoints);
	});
});

function bigArrayToArray(bigArray) {
	const convertedArray = [];
	for (let i = 0; i < bigArray.length; i++) {
		convertedArray.push(bigArray[i].toNumber());
	}
	return convertedArray;
}

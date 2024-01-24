const { expect, assert } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, mine, time } = require("@nomicfoundation/hardhat-network-helpers");

const anyValue = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("Snow token tracker and marketplace - Test", function () {
	const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";
	const MANAGER_ROLE = "0x241ecf16d79d0f8dbfb92cbc07fe17840425976cf0667f022fe9877caa831b08";
	const SPENDER_ROLE = "0x7434c6f201a551bfd17336985361933e0c4935b520dac8a49d937b325f7d5c0a";
	const ORDERS_MANAGER_ROLE = "0xaa5fbceb487d55b340de6be38039a291fbf696e3c434bf175637eaf8d5acd429";
	const ZERO_ADDRESS = ethers.constants.AddressZero;

	async function deployContractsFixture() {
		// Define process actors
		const [deployer, userOne, userTwo] = await ethers.getSigners();

		// Deploy the SnowTracker contract
		const SnowTracker = await ethers.getContractFactory("SnowTracker");
		const snowTracker = await SnowTracker.deploy();
		await snowTracker.deployed();

		// Deploy the Marketplace contract
		const Marketplace = await ethers.getContractFactory("SnowMarketplace");
		const marketplace = await Marketplace.deploy(snowTracker.address);
		await marketplace.deployed();

		// Deploy a simple ERC721 token to test the marketplace
		const SimpleErc721 = await ethers.getContractFactory("SimpleErc721");
		const simple721 = await SimpleErc721.deploy(deployer.address);
		await simple721.deployed();

		// Deploy a simple ERC1155 contract to test the marketplace
		const SimpleErc1155 = await ethers.getContractFactory("SimpleErc1155");
		const simple1155 = await SimpleErc1155.deploy(deployer.address);
		await simple1155.deployed();

		return {
			deployer,
			userOne,
			userTwo,
			snowTracker,
			marketplace,
			simple721,
			simple1155,
		};
	}

	it("Should allow to add tokens to a specified wallet", async function () {
		const { snowTracker, userOne } = await loadFixture(deployContractsFixture);

		const tokensToAdd = 10;
		const initialBalance = await snowTracker.balances(userOne.address);
		await snowTracker.addTokens(userOne.address, tokensToAdd);
		expect(await snowTracker.balances(userOne.address)).to.be.equal(parseInt(initialBalance) + tokensToAdd);
	});

	it("Should allow the contract deployer to pause and unpause the SnowTracker contract", async function () {
		const { snowTracker } = await loadFixture(deployContractsFixture);
		await expect(snowTracker.pause()).to.not.be.reverted;
		await expect(snowTracker.unpause()).to.not.be.reverted;
	});

	it("Should allow to batch add tokens to a list of wallets", async function () {
		const { snowTracker, userOne, userTwo } = await loadFixture(deployContractsFixture);

		const tokensToAdd = [10, 20];
		const initialUserOneBalance = await snowTracker.balances(userOne.address);
		const initialUserTwoBalance = await snowTracker.balances(userTwo.address);

		const totalTokensToAdd = tokensToAdd[0] + tokensToAdd[1];
		const result = await snowTracker.callStatic.batchAddTokens([userOne.address, userTwo.address], tokensToAdd);

		await snowTracker.batchAddTokens([userOne.address, userTwo.address], tokensToAdd);
		expect(await snowTracker.balances(userOne.address)).to.be.equal(parseInt(initialUserOneBalance) + tokensToAdd[0]);
		expect(await snowTracker.balances(userTwo.address)).to.be.equal(parseInt(initialUserTwoBalance) + tokensToAdd[1]);
		expect(parseInt(result)).to.equal(totalTokensToAdd);
	});

	it("Should allow to remove tokens from a specified wallet", async function () {
		const { snowTracker, userOne } = await loadFixture(deployContractsFixture);

		const tokensToAdd = 10;
		const tokensToRemove = 7;
		const initialBalance = await snowTracker.balances(userOne.address);
		await snowTracker.addTokens(userOne.address, tokensToAdd);
		await snowTracker.removeTokens(userOne.address, tokensToRemove);
		expect(await snowTracker.balances(userOne.address)).to.be.equal(
			parseInt(initialBalance) + tokensToAdd - tokensToRemove
		);
	});

	it("Should allow to batch remove tokens to a list of wallets", async function () {
		const { snowTracker, userOne, userTwo } = await loadFixture(deployContractsFixture);

		const tokensToAdd = [10, 20];
		const tokensToRemove = [6, 2];
		const totalRemoved = tokensToRemove[0] + tokensToRemove[1];
		await snowTracker.batchAddTokens([userOne.address, userTwo.address], tokensToAdd);
		const initialUserOneBalance = await snowTracker.balances(userOne.address);
		const initialUserTwoBalance = await snowTracker.balances(userTwo.address);

		const result = await snowTracker.callStatic.batchRemoveTokens([userOne.address, userTwo.address], tokensToRemove);
		await snowTracker.batchRemoveTokens([userOne.address, userTwo.address], tokensToRemove);

		expect(await snowTracker.balances(userOne.address)).to.be.equal(
			parseInt(initialUserOneBalance) - tokensToRemove[0]
		);
		expect(await snowTracker.balances(userTwo.address)).to.be.equal(
			parseInt(initialUserTwoBalance) - tokensToRemove[1]
		);

		expect(parseInt(result)).to.equal(totalRemoved);
	});

	it("Should allow to transfer tokens between 2 wallets", async function () {
		const { snowTracker, userOne, userTwo } = await loadFixture(deployContractsFixture);

		const tokensToAdd = 100;
		const tokensToTransfer = 23;
		const initialUserOneBalance = (await snowTracker.balances(userOne.address)) + tokensToAdd;
		const initialUserTwoBalance = await snowTracker.balances(userTwo.address);
		await snowTracker.addTokens(userOne.address, tokensToAdd);
		await snowTracker.connect(userOne).transferTokens(userTwo.address, tokensToTransfer);
		expect(await snowTracker.balances(userOne.address)).to.be.equal(parseInt(initialUserOneBalance) - tokensToTransfer);
		expect(await snowTracker.balances(userTwo.address)).to.be.equal(parseInt(initialUserTwoBalance) + tokensToTransfer);
	});

	it("Should revert with a custom error when trying to remove more tokens than the available balance", async function () {
		const { snowTracker, userOne } = await loadFixture(deployContractsFixture);

		const tokensToAdd = 100;
		await snowTracker.addTokens(userOne.address, tokensToAdd);
		const tokensToRemove = tokensToAdd * 2;
		await expect(snowTracker.removeTokens(userOne.address, tokensToRemove)).to.be.revertedWith(
			"Can't remove more than the available tokens"
		);
	});

	it("Should revert with a custom error when trying to remove 0 tokens from a user balance", async function () {
		const { snowTracker, userOne } = await loadFixture(deployContractsFixture);

		const tokensToRemove = 0;
		await expect(snowTracker.removeTokens(userOne.address, tokensToRemove)).to.be.revertedWith(
			"Can't remove zero tokens"
		);
	});

	it("Should revert the token transfer if the sender doesn't have enough in his balance", async function () {
		const { snowTracker, userTwo } = await loadFixture(deployContractsFixture);

		const tokensToRemove = 110;
		await expect(snowTracker.transferTokens(userTwo.address, tokensToRemove)).to.be.revertedWith(
			"Can't transfer more tokens than the available balance"
		);
	});

	it("Should revert if a wallet without the role MANAGER_ROLE tries to add tokens to another wallet address", async function () {
		const { snowTracker, userOne } = await loadFixture(deployContractsFixture);

		const tokensToAdd = 110;
		await expect(snowTracker.connect(userOne).addTokens(userOne.address, tokensToAdd)).to.be.reverted;
	});

	it("Should revert if a wallet without the role MANAGER_ROLE tries to remove tokens from another wallet address", async function () {
		const { snowTracker, userOne, userTwo } = await loadFixture(deployContractsFixture);

		const tokensToRemove = 110;
		await expect(snowTracker.connect(userOne).removeTokens(userTwo.address, tokensToRemove)).to.be.reverted;
	});

	it("Should revert if a wallet without the role SPENDER_ROLE tries to spend tokens of another wallet address", async function () {
		const { snowTracker, userOne, userTwo } = await loadFixture(deployContractsFixture);

		const tokenToSpend = 100;
		await snowTracker.addTokens(userOne.address, tokenToSpend);
		await expect(snowTracker.connect(userTwo).spendTokens(userOne.address, tokenToSpend)).to.be.reverted;
	});

	it("Should not revert if a wallet with the role SPENDER_ROLE tries to spend tokens of another wallet address", async function () {
		const { snowTracker, userOne } = await loadFixture(deployContractsFixture);

		const tokenToSpend = 100;
		await snowTracker.addTokens(userOne.address, tokenToSpend);
		await snowTracker.grantRole(SPENDER_ROLE, userOne.address);
		await expect(snowTracker.connect(userOne).spendTokens(userOne.address, tokenToSpend)).to.not.be.reverted;
	});

	it("Should track the total amount of unique token holders", async function () {
		const { snowTracker, userOne, userTwo } = await loadFixture(deployContractsFixture);

		const tokensToAdd = [10, 20];
		await snowTracker.batchAddTokens([userOne.address, userTwo.address], tokensToAdd);

		var uniqueHolders = await snowTracker.uniqueHolders();
		expect(uniqueHolders).to.equal(2);

		await snowTracker.removeTokens(userOne.address, tokensToAdd[0]);
		uniqueHolders = await snowTracker.uniqueHolders();
		expect(uniqueHolders).to.equal(1);

		await snowTracker.removeTokens(userTwo.address, tokensToAdd[1]);
		uniqueHolders = await snowTracker.uniqueHolders();
		expect(uniqueHolders).to.equal(0);
	});

	it("Should track the total token supply", async function () {
		const { snowTracker, userOne, userTwo } = await loadFixture(deployContractsFixture);

		const tokensToAdd = [10, 20];
		await snowTracker.batchAddTokens([userOne.address, userTwo.address], tokensToAdd);

		var totalSupply = await snowTracker.totalSupply();
		expect(totalSupply).to.equal(tokensToAdd[0] + tokensToAdd[1]);

		await snowTracker.removeTokens(userOne.address, tokensToAdd[0]);
		totalSupply = await snowTracker.totalSupply();
		expect(totalSupply).to.equal(tokensToAdd[1]);

		await snowTracker.removeTokens(userTwo.address, tokensToAdd[1]);
		totalSupply = await snowTracker.totalSupply();
		expect(totalSupply).to.equal(0);
	});

	//-------------------------------------------------------------//
	//-------------------- MARKETPLACE TESTING --------------------//
	//-------------------------------------------------------------//

	it("Should NOT allow a wallet address without the ORDERS_MANAGER_ROLE role to create a MarketOrder with a ERC1155 token", async function () {
		const { deployer, marketplace, simple1155 } = await loadFixture(deployContractsFixture);

		// Mint to deployer wallet ERC1155 tokens
		const tokenId = 1234;
		const amount = 2;
		const ERC1155_NFT_TYPE = 0;
		await simple1155.mint(deployer.address, tokenId, amount, "0x00");

		await expect(marketplace.createOrder(0, ERC1155_NFT_TYPE, simple1155.address, tokenId)).to.be.reverted;
	});

	it("Should NOT allow a wallet address WITH the ORDERS_MANAGER_ROLE role to create a free MarketOrder (price = 0 SNOW tokens)", async function () {
		const { deployer, marketplace, simple1155 } = await loadFixture(deployContractsFixture);

		// Mint to deployer wallet ERC1155 tokens
		const tokenId = 1234;
		const amount = 2;
		const ERC1155_NFT_TYPE = 0;
		const freePrice = 0; // this value is not valid for the smart contract logic"
		await simple1155.mint(deployer.address, tokenId, amount, "0x00");
		await marketplace.grantRole(ORDERS_MANAGER_ROLE, deployer.address);

		await expect(marketplace.createOrder(freePrice, ERC1155_NFT_TYPE, simple1155.address, tokenId)).to.be.revertedWith(
			"Can't create a free order"
		);
	});

	it("Should allow a wallet address WITH the ORDERS_MANAGER_ROLE role to create a valid MarketOrder for an ERC1155 token", async function () {
		const { deployer, marketplace, simple1155 } = await loadFixture(deployContractsFixture);

		// Mint to deployer wallet ERC1155 tokens
		const tokenId = 1234;
		const amount = 2;
		const ERC1155_NFT_TYPE = 0;
		const OPEN_ORDER_STATE = 0;
		const orderPrice = 10;
		await simple1155.mint(deployer.address, tokenId, amount, "0x00");
		await marketplace.grantRole(ORDERS_MANAGER_ROLE, deployer.address);

		const initialNftsBalance = await simple1155.balanceOf(marketplace.address, tokenId);

		// Approve the tokens spending from the marketplace side
		await simple1155.setApprovalForAll(marketplace.address, true);

		// Create order
		const orderId = await marketplace.callStatic.createOrder(orderPrice, ERC1155_NFT_TYPE, simple1155.address, tokenId);
		await marketplace.createOrder(orderPrice, ERC1155_NFT_TYPE, simple1155.address, tokenId);

		// Check current active order list to have a length equal to 1
		const activeOrders = await marketplace.getActiveOrderIds();

		// Check length correctness
		expect(activeOrders.length).to.equal(1);

		// Check order data correctness
		const orderDetails = await marketplace.orderDetails(orderId);
		expect(orderDetails.maker).to.equal(deployer.address);
		expect(orderDetails.price).to.equal(orderPrice);
		expect(orderDetails.nftType).to.equal(ERC1155_NFT_TYPE);
		expect(orderDetails.tokenContractAddress).to.equal(simple1155.address);
		expect(orderDetails.tokenId).to.equal(tokenId);
		expect(orderDetails.filledAtBlock).to.equal(0);
		expect(orderDetails.orderState).to.equal(OPEN_ORDER_STATE);
		expect(orderDetails.taker).to.equal(ZERO_ADDRESS);

		// Check marketplace NFT presence
		const currentNftsBalance = await simple1155.balanceOf(marketplace.address, tokenId);
		expect(currentNftsBalance).to.equal(initialNftsBalance + 1);
	});

	it("Should NOT allow a wallet address WITHOUT the ORDERS_MANAGER_ROLE role to send ERC1155 tokens to the marketplace contract", async function () {
		const { deployer, marketplace, simple1155 } = await loadFixture(deployContractsFixture);

		// Mint to deployer wallet ERC1155 tokens
		const tokenId = 1234;
		const amount = 2;
		await simple1155.mint(deployer.address, tokenId, amount, "0x00");
		await expect(
			simple1155.safeTransferFrom(deployer.address, marketplace.address, tokenId, amount, "0x00")
		).to.be.revertedWith("The contract can't receive NFTs from this address");
	});

	it("Should allow a wallet address WITH the ORDERS_MANAGER_ROLE role to create a valid MarketOrder for an ERC721 token", async function () {
		const { deployer, marketplace, simple721 } = await loadFixture(deployContractsFixture);

		// Mint to deployer wallet ERC1155 tokens
		const tokenId = 0;
		const ERC721_NFT_TYPE = 1;
		const OPEN_ORDER_STATE = 0;
		const orderPrice = 50;
		await simple721.safeMint(deployer.address);
		await marketplace.grantRole(ORDERS_MANAGER_ROLE, deployer.address);

		// Approve the tokens spending from the marketplace side
		await simple721.setApprovalForAll(marketplace.address, true);

		// Check if the deployer is the token owner
		expect(await simple721.ownerOf(tokenId)).to.be.equal(deployer.address);

		// Create order
		const orderId = await marketplace.callStatic.createOrder(orderPrice, ERC721_NFT_TYPE, simple721.address, tokenId);
		await marketplace.createOrder(orderPrice, ERC721_NFT_TYPE, simple721.address, tokenId);

		// Check current active order list to have a length equal to 1
		const activeOrders = await marketplace.getActiveOrderIds();

		// Check length correctness
		expect(activeOrders.length).to.equal(1);

		// Check the current token owner (should be the marketplace contract)
		expect(await simple721.ownerOf(tokenId)).to.be.equal(marketplace.address);
		expect(await simple721.ownerOf(tokenId)).to.not.be.equal(deployer.address);

		// Check order data correctness
		const orderDetails = await marketplace.orderDetails(orderId);
		expect(orderDetails.maker).to.equal(deployer.address);
		expect(orderDetails.price).to.equal(orderPrice);
		expect(orderDetails.nftType).to.equal(ERC721_NFT_TYPE);
		expect(orderDetails.tokenContractAddress).to.equal(simple721.address);
		expect(orderDetails.tokenId).to.equal(tokenId);
		expect(orderDetails.filledAtBlock).to.equal(0);
		expect(orderDetails.orderState).to.equal(OPEN_ORDER_STATE);
		expect(orderDetails.taker).to.equal(ZERO_ADDRESS);
	});

	it("Should NOT allow a wallet without the MANAGER_ROLE to send an ERC721 token to the contract", async function () {
		const { deployer, userOne, marketplace, simple721 } = await loadFixture(deployContractsFixture);

		// Mint to deployer wallet ERC1155 tokens

		await simple721.safeMint(userOne.address);
		const balance = await simple721.balanceOf(userOne.address);
		await expect(
			simple721.connect(userOne)["safeTransferFrom(address,address,uint256)"](userOne.address, marketplace.address, 0)
		).to.be.revertedWith("The contract can't receive NFTs from this address");
	});

	it("Should NOT allow a wallet address WITH the ORDERS_MANAGER_ROLE role to create an ERC721 order if the marketplace is paused", async function () {
		const { deployer, marketplace, simple721 } = await loadFixture(deployContractsFixture);

		// Mint to deployer wallet ERC1155 tokens
		const tokenId = 0;
		const ERC721_NFT_TYPE = 1;
		const orderPrice = 50;
		await simple721.safeMint(deployer.address);
		await marketplace.grantRole(ORDERS_MANAGER_ROLE, deployer.address);

		// Approve the tokens spending from the marketplace side
		await simple721.setApprovalForAll(marketplace.address, true);

		// Check if the deployer is the token owner
		expect(await simple721.ownerOf(tokenId)).to.be.equal(deployer.address);

		// Pause marketplace
		await marketplace.pauseMarketplace();

		// Try to create a new order
		await expect(marketplace.createOrder(orderPrice, ERC721_NFT_TYPE, simple721.address, tokenId)).to.be.revertedWith(
			"Marketplace not active"
		);
	});

	it("Should NOT allow to create a new order with an invalid NFT_TYPE parameter", async function () {
		const { deployer, marketplace, simple721 } = await loadFixture(deployContractsFixture);

		// Mint to deployer wallet ERC1155 tokens
		const tokenId = 0;
		const ERC721_NFT_TYPE = 1;
		const orderPrice = 50;
		await simple721.safeMint(deployer.address);
		await marketplace.grantRole(ORDERS_MANAGER_ROLE, deployer.address);

		// Approve the tokens spending from the marketplace side
		await simple721.setApprovalForAll(marketplace.address, true);

		// Can either fail for not owning the token or if the token doesn't exists
		await expect(marketplace.createOrder(orderPrice, ERC721_NFT_TYPE, simple721.address, 10)).to.be.reverted;
	});

	it("Should allow a wallet address WITH the ORDERS_MANAGER_ROLE role to create an ERC721 order after the marketplace is paused and then unpaused", async function () {
		const { deployer, marketplace, simple721 } = await loadFixture(deployContractsFixture);

		// Mint to deployer wallet ERC1155 tokens
		const tokenId = 0;
		const ERC721_NFT_TYPE = 1;
		const orderPrice = 50;
		await simple721.safeMint(deployer.address);
		await marketplace.grantRole(ORDERS_MANAGER_ROLE, deployer.address);

		// Approve the tokens spending from the marketplace side
		await simple721.setApprovalForAll(marketplace.address, true);

		// Check if the deployer is the token owner
		expect(await simple721.ownerOf(tokenId)).to.be.equal(deployer.address);

		// Pause marketplace
		await marketplace.pauseMarketplace();
		await marketplace.unpauseMarketplace();

		// Try to create a new order
		await expect(marketplace.createOrder(orderPrice, ERC721_NFT_TYPE, simple721.address, tokenId)).to.not.be.reverted;
	});

	it("Should allow a wallet address WITH the ORDERS_MANAGER_ROLE role to create a batch ERC1155 order", async function () {
		const { deployer, marketplace, simple1155 } = await loadFixture(deployContractsFixture);

		// Mint to deployer wallet ERC1155 tokens
		const tokenId = 1234;
		const amount = 100;
		const ERC1155_NFT_TYPE = 0;
		const CANCELED_ORDER_STATE = 2;
		const orderPrice = 10;
		await simple1155.mint(deployer.address, tokenId, amount, "0x00");
		await marketplace.grantRole(ORDERS_MANAGER_ROLE, deployer.address);

		const initialNftsBalance = await simple1155.balanceOf(marketplace.address, tokenId);

		// Approve the tokens spending from the marketplace side
		await simple1155.setApprovalForAll(marketplace.address, true);

		// Create orders
		const orderIds = bigArrayToArray(
			await marketplace.callStatic.createBatchERC1155Order(orderPrice, simple1155.address, tokenId, amount)
		);
		await marketplace.createBatchERC1155Order(orderPrice, simple1155.address, tokenId, amount);
		var currentNftsBalance = await simple1155.balanceOf(marketplace.address, tokenId);

		// Check the number of ERC1155 NFT copies put on sale
		expect(currentNftsBalance).to.equal(amount);

		var deletedOrders = [];
		for (let i = 0; i < orderIds.length; i++) {
			const toDelete = Math.random() < 0.5 ? false : true;
			if (toDelete) {
				deletedOrders.push(orderIds[i]);
				await marketplace.cancelOrder(orderIds[i]);
			}
		}

		// Check the number of ERC1155 NFT copies put on sale (after removing some NFTs)
		currentNftsBalance = await simple1155.balanceOf(marketplace.address, tokenId);
		expect(currentNftsBalance).to.equal(amount - deletedOrders.length);

		var currentActiveOrderIds = bigArrayToArray(await marketplace.getActiveOrderIds());

		var wrongElements = 0;

		// Check removal consistency in a two steps
		for (let i = 0; i < currentActiveOrderIds.length; i++) {
			if (deletedOrders.includes(currentActiveOrderIds[i])) {
				wrongElements++;
			}
		}

		for (let i = 0; i < deletedOrders.length; i++) {
			if (currentActiveOrderIds.includes(deletedOrders[i])) {
				wrongElements++;
			}
		}

		for (let i = 0; i < deletedOrders.length; i++) {
			const orderDetails = await marketplace.orderDetails(deletedOrders[i]);
			expect(orderDetails.orderState).to.equal(CANCELED_ORDER_STATE);
			expect(orderDetails.filledAtBlock).to.equal(0);
		}

		expect(wrongElements).to.equal(0);
	});

	describe("Marketplace not empty testing", function () {
		async function createErc721OrderFixture() {
			const { deployer, userOne, userTwo, snowTracker, marketplace, simple721, simple1155 } = await loadFixture(
				deployContractsFixture
			);

			// Mint to deployer wallet ERC1155 tokens
			const tokenId = 0;
			const ERC721_NFT_TYPE = 1;
			const orderPrice = 50;
			await simple721.safeMint(deployer.address);
			await marketplace.grantRole(ORDERS_MANAGER_ROLE, deployer.address);

			// Approve the tokens spending from the marketplace side
			await simple721.setApprovalForAll(marketplace.address, true);

			// Create order
			await marketplace.createOrder(orderPrice, ERC721_NFT_TYPE, simple721.address, tokenId);
			return { deployer, userOne, userTwo, snowTracker, marketplace, simple721, simple1155 };
		}

		async function createErc1155OrderFixture() {
			const { deployer, userOne, userTwo, snowTracker, marketplace, simple721, simple1155 } = await loadFixture(
				deployContractsFixture
			);

			// Mint to deployer wallet ERC1155 tokens
			const tokenId = 1234;
			const amount = 2;
			const ERC1155_NFT_TYPE = 0;
			const orderPrice = 10;
			await simple1155.mint(deployer.address, tokenId, amount, "0x00");
			await marketplace.grantRole(ORDERS_MANAGER_ROLE, deployer.address);

			// Approve the tokens spending from the marketplace side
			await simple1155.setApprovalForAll(marketplace.address, true);

			// Create order
			await marketplace.createOrder(orderPrice, ERC1155_NFT_TYPE, simple1155.address, tokenId);

			return { deployer, userOne, userTwo, snowTracker, marketplace, simple721, simple1155 };
		}

		it("Should NOT allow to fulfill an ERC721 MarketOrder if the balance of SNOW tokens is NOT enough", async function () {
			const { marketplace, userOne } = await loadFixture(createErc721OrderFixture);

			const activeOrders = await marketplace.getActiveOrderIds();
			expect(activeOrders.length).to.equal(1);

			// Give to the userOne enough tokens to fulfill the order
			const orderId = activeOrders[0].toNumber();
			await expect(marketplace.connect(userOne).fulfillOrder(orderId)).to.be.revertedWith(
				"Not enough tokens available to buy the NFT"
			);
		});

		it("Should NOT allow to fulfill an ERC721 MarketOrder if the marketplace can't spend users SNOW tokens", async function () {
			const { marketplace, userOne } = await loadFixture(createErc721OrderFixture);

			const activeOrders = await marketplace.getActiveOrderIds();
			expect(activeOrders.length).to.equal(1);

			// Give to the userOne enough tokens to fulfill the order
			const orderId = activeOrders[0].toNumber();
			await expect(marketplace.connect(userOne).fulfillOrder(orderId)).to.be.reverted;
		});

		it("Should NOT allow to fulfill an invalid MarketOrder", async function () {
			const { marketplace, userOne, snowTracker } = await loadFixture(createErc721OrderFixture);

			const activeOrders = await marketplace.getActiveOrderIds();
			const INVALID_ORDER_ID = 100000000;

			// Give to the userOne enough tokens to fulfill the order
			await snowTracker.addTokens(userOne.address, 5000);
			const orderId = activeOrders[0].toNumber();

			// Give the marketplace the permission to spend users tokens
			await snowTracker.grantRole(SPENDER_ROLE, marketplace.address);

			await expect(marketplace.connect(userOne).fulfillOrder(INVALID_ORDER_ID)).to.be.revertedWith(
				"Invalid order ID provided"
			);
		});

		it("Should allow to fulfill an ERC721 MarketOrder if the balance of SNOW tokens is enough", async function () {
			const { marketplace, userOne, snowTracker, simple721 } = await loadFixture(createErc721OrderFixture);

			const activeOrders = await marketplace.getActiveOrderIds();
			expect(activeOrders.length).to.equal(1);

			// Give to the userOne enough tokens to fulfill the order
			await snowTracker.addTokens(userOne.address, 5000);
			const orderId = activeOrders[0].toNumber();
			const orderDetails = await marketplace.orderDetails(orderId);

			// Give the marketplace the permission to spend users tokens
			await snowTracker.grantRole(SPENDER_ROLE, marketplace.address);

			// Check NFTs on sale number
			const initialErc721OnSale = await marketplace.onSaleErc721Tokens();
			expect(initialErc721OnSale).to.equal(1);

			const initialUserOneBalance = await snowTracker.balances(userOne.address);
			const initialTokenOwner = await simple721.ownerOf(orderDetails.tokenId);
			expect(initialTokenOwner).to.equal(marketplace.address);

			// Check tokens spent in the market
			const initialtOrdersFilled = await marketplace.ordersFullfilled();
			const initialTotalMarketTokensSpent = await marketplace.totalTokensSpent();

			// Fulfill market order
			await marketplace.connect(userOne).fulfillOrder(orderId);

			const currenUserOneBalance = await snowTracker.balances(userOne.address);
			expect(currenUserOneBalance).to.equal(initialUserOneBalance.toNumber() - orderDetails.price.toNumber());

			const currenErc721OnSale = await marketplace.onSaleErc721Tokens();
			expect(currenErc721OnSale).to.equal(initialErc721OnSale.toNumber() - 1);

			// Check order state updates
			const currenOrderDetails = await marketplace.orderDetails(orderId);
			const CLOSED_SUCCESSFULLY_ORDER_STATE = 1;
			expect(currenOrderDetails.orderState).to.equal(CLOSED_SUCCESSFULLY_ORDER_STATE);
			expect(currenOrderDetails.filledAtBlock).to.be.greaterThan(0);

			// Check tokens spent in the market
			const currentOrdersFilled = await marketplace.ordersFullfilled();
			const currentTotalMarketTokensSpent = await marketplace.totalTokensSpent();
			expect(initialtOrdersFilled).to.equal(currentOrdersFilled.toNumber() - 1);
			expect(initialTotalMarketTokensSpent).to.equal(currentTotalMarketTokensSpent - currenOrderDetails.price);

			// Check token transfer
			const currentTokenOwner = await simple721.ownerOf(orderDetails.tokenId);
			expect(currentTokenOwner).to.equal(userOne.address);
		});

		it("Should allow to fulfill an ERC1155 MarketOrder if the balance of SNOW tokens is enough", async function () {
			const { marketplace, userOne, snowTracker, simple1155 } = await loadFixture(createErc1155OrderFixture);

			const activeOrders = await marketplace.getActiveOrderIds();
			expect(activeOrders.length).to.equal(1);

			// Give to the userOne enough tokens to fulfill the order
			await snowTracker.addTokens(userOne.address, 5000);
			const orderId = activeOrders[0].toNumber();
			const orderDetails = await marketplace.orderDetails(orderId);

			// Give the marketplace the permission to spend users tokens
			await snowTracker.grantRole(SPENDER_ROLE, marketplace.address);

			// Check NFTs on sale number
			const initialErc1155OnSale = await marketplace.onSaleErc1155Tokens();
			expect(initialErc1155OnSale).to.equal(1);

			const initialUserOneBalance = await snowTracker.balances(userOne.address);
			const initialMarketTokenBalance = await simple1155.balanceOf(marketplace.address, orderDetails.tokenId);
			const initialUserOneTokenBalance = await simple1155.balanceOf(userOne.address, orderDetails.tokenId);

			// Check tokens spent in the market
			const initialtOrdersFilled = await marketplace.ordersFullfilled();
			const initialTotalMarketTokensSpent = await marketplace.totalTokensSpent();

			// Fulfill market order
			await marketplace.connect(userOne).fulfillOrder(orderId);

			const currenUserOneBalance = await snowTracker.balances(userOne.address);
			expect(currenUserOneBalance).to.equal(initialUserOneBalance.toNumber() - orderDetails.price.toNumber());

			const currenErc1155OnSale = await marketplace.onSaleErc1155Tokens();
			expect(currenErc1155OnSale).to.equal(initialErc1155OnSale.toNumber() - 1);

			// Check order state updates
			const currenOrderDetails = await marketplace.orderDetails(orderId);
			const CLOSED_SUCCESSFULLY_ORDER_STATE = 1;
			expect(currenOrderDetails.orderState).to.equal(CLOSED_SUCCESSFULLY_ORDER_STATE);
			expect(currenOrderDetails.filledAtBlock).to.be.greaterThan(0);

			// Check tokens spent in the market
			const currentOrdersFilled = await marketplace.ordersFullfilled();
			const currentTotalMarketTokensSpent = await marketplace.totalTokensSpent();
			expect(initialtOrdersFilled).to.equal(currentOrdersFilled.toNumber() - 1);
			expect(initialTotalMarketTokensSpent).to.equal(currentTotalMarketTokensSpent - currenOrderDetails.price);

			// Check token transfer
			const currentMarketTokenBalance = await simple1155.balanceOf(marketplace.address, orderDetails.tokenId);
			const currentUserOneTokenBalance = await simple1155.balanceOf(userOne.address, orderDetails.tokenId);
			expect(currentMarketTokenBalance).to.equal(initialMarketTokenBalance.toNumber() - 1);
			expect(currentUserOneTokenBalance).to.equal(initialUserOneTokenBalance.toNumber() + 1);
		});

		it("Should NOT allow to fulfill an ERC1155 MarketOrder if the marketplace is paused", async function () {
			const { marketplace, userOne, snowTracker, simple1155 } = await loadFixture(createErc1155OrderFixture);

			const activeOrders = await marketplace.getActiveOrderIds();
			expect(activeOrders.length).to.equal(1);

			// Give to the userOne enough tokens to fulfill the order
			await snowTracker.addTokens(userOne.address, 5000);
			const orderId = activeOrders[0].toNumber();
			const orderDetails = await marketplace.orderDetails(orderId);

			// Give the marketplace the permission to spend users tokens
			await snowTracker.grantRole(SPENDER_ROLE, marketplace.address);

			// Check NFTs on sale number
			const initialErc1155OnSale = await marketplace.onSaleErc1155Tokens();
			expect(initialErc1155OnSale).to.equal(1);

			// Pause marketplace
			await marketplace.pauseMarketplace();

			// Fulfill market order
			await expect(marketplace.connect(userOne).fulfillOrder(orderId)).to.be.revertedWith("Marketplace not active");
		});

		it("Should allow to fulfill an ERC1155 MarketOrder if the marketplace is paused and then unpaused", async function () {
			const { marketplace, userOne, snowTracker, simple1155 } = await loadFixture(createErc1155OrderFixture);

			const activeOrders = await marketplace.getActiveOrderIds();
			expect(activeOrders.length).to.equal(1);

			// Give to the userOne enough tokens to fulfill the order
			await snowTracker.addTokens(userOne.address, 5000);
			const orderId = activeOrders[0].toNumber();
			const orderDetails = await marketplace.orderDetails(orderId);

			// Give the marketplace the permission to spend users tokens
			await snowTracker.grantRole(SPENDER_ROLE, marketplace.address);

			// Check NFTs on sale number
			const initialErc1155OnSale = await marketplace.onSaleErc1155Tokens();
			expect(initialErc1155OnSale).to.equal(1);

			// Pause marketplace
			await marketplace.pauseMarketplace();
			await marketplace.unpauseMarketplace();

			// Fulfill market order
			await expect(marketplace.connect(userOne).fulfillOrder(orderId)).to.not.be.reverted;
		});

		it("Should NOT allow a wallet address WITHOUT the ORDERS_MANAGER_ROLE role to cancel an ERC721 order", async function () {
			const { marketplace, userOne } = await loadFixture(createErc721OrderFixture);

			const activeOrders = await marketplace.getActiveOrderIds();
			expect(activeOrders.length).to.equal(1);

			// Give to the userOne enough tokens to fulfill the order
			const orderId = activeOrders[0].toNumber();

			// Cancel market order
			await expect(marketplace.connect(userOne).cancelOrder(orderId)).to.be.reverted;
		});

		it("Should allow a wallet address WITH the ORDERS_MANAGER_ROLE role to cancel an ERC721 order", async function () {
			const { deployer, marketplace, simple721, userOne } = await loadFixture(createErc721OrderFixture);

			const activeOrders = await marketplace.getActiveOrderIds();
			expect(activeOrders.length).to.equal(1);

			// Give to the userOne enough tokens to fulfill the order
			const orderId = activeOrders[0].toNumber();
			const orderDetails = await marketplace.orderDetails(orderId);

			// Give the marketplace the permission to spend users tokens
			await marketplace.grantRole(ORDERS_MANAGER_ROLE, deployer.address);

			// Check NFTs on sale number
			const initialErc721OnSale = await marketplace.onSaleErc721Tokens();
			expect(initialErc721OnSale).to.equal(1);

			const initialTokenOwner = await simple721.ownerOf(orderDetails.tokenId);
			expect(initialTokenOwner).to.equal(marketplace.address);

			// Check tokens spent in the market
			const initialtOrdersFilled = await marketplace.ordersFullfilled();
			const initialTotalMarketTokensSpent = await marketplace.totalTokensSpent();

			// Cancel market order
			await marketplace.cancelOrder(orderId);

			const currenErc721OnSale = await marketplace.onSaleErc721Tokens();
			expect(currenErc721OnSale).to.equal(initialErc721OnSale.toNumber() - 1);

			// Check order state updates
			const currenOrderDetails = await marketplace.orderDetails(orderId);
			const CANCELED_ORDER_STATE = 2;
			expect(currenOrderDetails.orderState).to.equal(CANCELED_ORDER_STATE);
			expect(currenOrderDetails.filledAtBlock).to.equal(0);

			// Check tokens spent in the market
			const currentOrdersFilled = await marketplace.ordersFullfilled();
			const currentTotalMarketTokensSpent = await marketplace.totalTokensSpent();
			expect(initialtOrdersFilled).to.equal(currentOrdersFilled.toNumber());
			expect(initialTotalMarketTokensSpent).to.equal(currentTotalMarketTokensSpent);

			// Check token transfer
			const currentTokenOwner = await simple721.ownerOf(orderDetails.tokenId);
			expect(currentTokenOwner).to.equal(deployer.address);
		});

		it("Should allow a wallet address WITH the ORDERS_MANAGER_ROLE role to cancel an ERC1155 order", async function () {
			const { deployer, marketplace, simple1155 } = await loadFixture(createErc1155OrderFixture);

			const activeOrders = await marketplace.getActiveOrderIds();
			expect(activeOrders.length).to.equal(1);

			// Give to the userOne enough tokens to fulfill the order
			const orderId = activeOrders[0].toNumber();
			const orderDetails = await marketplace.orderDetails(orderId);

			// Give the marketplace the permission to spend users tokens
			await marketplace.grantRole(ORDERS_MANAGER_ROLE, deployer.address);

			// Check NFTs on sale number
			const initialErc1155OnSale = await marketplace.onSaleErc1155Tokens();
			expect(initialErc1155OnSale).to.equal(1);

			const initialMarketTokenBalance = await simple1155.balanceOf(marketplace.address, orderDetails.tokenId);
			const initialDeployerTokenBalance = await simple1155.balanceOf(deployer.address, orderDetails.tokenId);

			// Check tokens spent in the market
			const initialtOrdersFilled = await marketplace.ordersFullfilled();
			const initialTotalMarketTokensSpent = await marketplace.totalTokensSpent();

			// Cancel market order
			await marketplace.cancelOrder(orderId);

			const currenErc1155OnSale = await marketplace.onSaleErc1155Tokens();
			expect(currenErc1155OnSale).to.equal(initialErc1155OnSale.toNumber() - 1);

			// Check order state updates
			const currenOrderDetails = await marketplace.orderDetails(orderId);
			const CANCELED_ORDER_STATE = 2;
			expect(currenOrderDetails.orderState).to.equal(CANCELED_ORDER_STATE);
			expect(currenOrderDetails.filledAtBlock).to.equal(0);

			// Check tokens spent in the market
			const currentOrdersFilled = await marketplace.ordersFullfilled();
			const currentTotalMarketTokensSpent = await marketplace.totalTokensSpent();
			expect(initialtOrdersFilled).to.equal(currentOrdersFilled);
			expect(initialTotalMarketTokensSpent).to.equal(currentTotalMarketTokensSpent);

			// Check token transfer
			const currentMarketTokenBalance = await simple1155.balanceOf(marketplace.address, orderDetails.tokenId);
			const currentDeployerTokenBalance = await simple1155.balanceOf(deployer.address, orderDetails.tokenId);
			expect(currentMarketTokenBalance).to.equal(initialMarketTokenBalance.toNumber() - 1);
			expect(currentDeployerTokenBalance).to.equal(initialDeployerTokenBalance.toNumber() + 1);
		});

		it("Should allow a wallet address WITH the ORDERS_MANAGER_ROLE role to cancel an ERC1155 order is the marketplace is paused", async function () {
			const { deployer, marketplace, simple1155 } = await loadFixture(createErc1155OrderFixture);

			const activeOrders = await marketplace.getActiveOrderIds();
			expect(activeOrders.length).to.equal(1);

			// Give to the userOne enough tokens to fulfill the order
			const orderId = activeOrders[0].toNumber();
			const orderDetails = await marketplace.orderDetails(orderId);

			// Give the marketplace the permission to spend users tokens
			await marketplace.grantRole(ORDERS_MANAGER_ROLE, deployer.address);

			await marketplace.pauseMarketplace();
			await marketplace.cancelOrder(orderId);
		});
	});
});

function bigArrayToArray(bigArray) {
	const convertedArray = [];
	for (let i = 0; i < bigArray.length; i++) {
		convertedArray.push(bigArray[i].toNumber());
	}
	return convertedArray;
}
